(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const TYPES = ['提问者', '解决者', '社群好友'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let context, notice, state = {friends: [], incoming: [], outgoing: [], peers: []};
  let grouping = {}, editingId = '', busy = false, generation = 0, timer;
  const storageKey = () => 'tongpin-friend-groups-v2:' + context().profileId;
  function markup(node, html) {
    if (node.dataset.content === html) return;
    node.innerHTML = html;
    node.dataset.content = html;
  }
  function groupFor(friend) { return grouping[friend.id] || friend.type; }
  function renderGroups() {
    const root = $('friend-groups');
    const names = [...new Set([...TYPES, ...state.friends.map(groupFor)])];
    for (const item of [...root.children]) if (!names.includes(item.dataset.friendGroup)) item.remove();
    names.forEach(name => {
      let section = [...root.children].find(item => item.dataset.friendGroup === name);
      if (!section) {
        section = document.createElement('details');
        section.className = 'friend-group';
        section.dataset.friendGroup = name;
        const summary = document.createElement('summary');
        summary.innerHTML = '<span class="friend-group-name"></span><span class="friend-group-count"></span>';
        section.append(summary, document.createElement('div'));
        section.lastChild.className = 'friend-group-list';
        root.append(section);
      }
      const members = state.friends.filter(friend => groupFor(friend) === name);
      section.querySelector('.friend-group-name').textContent = name;
      section.querySelector('.friend-group-count').textContent = String(members.length);
      markup(section.lastChild, members.length ? members.map(friend => `<div class="friend-row" data-profile-id="${esc(friend.profileId)}"><div class="friend-person"><strong>${esc(friend.name)}</strong></div><div class="friend-row-actions"><button type="button" class="text-button" data-regroup-friend="${esc(friend.id)}">分区</button><button type="button" class="text-button friend-remove" data-remove-friend="${esc(friend.id)}">删除</button></div></div>`).join('') : '<p class="friend-empty">暂无好友</p>');
    });
  }
  function render() {
    renderGroups();
    const incoming = $('friend-incoming'), outgoing = $('friend-outgoing');
    incoming.hidden = !state.incoming.length;
    markup(incoming, '<h2>好友申请</h2>' + state.incoming.map(request => `<div class="friend-row"><div class="friend-person"><strong>${esc(request.name)}</strong><small>通过后归入${esc(request.type)}</small></div><div class="friend-row-actions"><button type="button" class="button secondary" data-friend-reject="${esc(request.id)}">忽略</button><button type="button" class="button primary" data-friend-accept="${esc(request.id)}">通过</button></div></div>`).join(''));
    outgoing.hidden = !state.outgoing.length;
    markup(outgoing, '<h2>等待通过</h2>' + state.outgoing.map(request => `<div class="friend-row"><div class="friend-person"><strong>${esc(request.name)}</strong><small>${esc(request.type)} · 等待对方通过</small></div></div>`).join(''));
    $('friend-request-count').hidden = !state.incoming.length;
    $('friend-request-count').textContent = String(state.incoming.length);
    const current = context();
    markup($('friend-peers'), !current.roomId ? '<p class="muted">先进入一个交流房间，再添加一起交流的人。</p>' : state.peers.length ? state.peers.map(peer => {
      const friend = state.friends.some(item => item.profileId === peer.profileId);
      const pending = state.outgoing.some(item => item.profileId === peer.profileId);
      const received = state.incoming.find(item => item.profileId === peer.profileId);
      const action = friend ? '<span class="friend-state">已是好友</span>' : pending ? '<span class="friend-state">等待通过</span>' : received ? `<button type="button" class="button primary" data-friend-accept="${esc(received.id)}">通过申请</button>` : `<button type="button" class="button secondary" data-request-peer="${esc(peer.profileId)}">添加好友</button>`;
      return `<div class="friend-row"><div class="friend-person"><strong>${esc(peer.name)}</strong><small>${esc(peer.type)}</small></div>${action}</div>`;
    }).join('') : '<p class="muted">等待其他人加入房间，加入后会在这里显示。</p>');
  }
  async function refresh() {
    if (!context || busy) return;
    const revision = ++generation, current = context();
    try {
      const res = await fetch('/api/friends?' + new URLSearchParams(current), {cache: 'no-store'});
      if (!res.ok) throw new Error('unavailable');
      const result = await res.json();
      if (revision !== generation || current.roomId !== context().roomId) return;
      state = {friends: result.friends || [], incoming: result.incoming || [], outgoing: result.outgoing || [], peers: result.peers || []};
      $('friends-status').hidden = true;
      render();
    } catch {
      if (revision !== generation) return;
      $('friends-status').hidden = false;
      $('friends-status').textContent = '暂时无法连接好友服务，正在重试。';
    }
  }
  async function mutate(path, body, button) {
    if (busy) return;
    busy = true; generation++;
    if (button) button.disabled = true;
    try {
      const res = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...context(), ...body})});
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'failed');
      notice(path.endsWith('request') ? '好友申请已发送，等待对方通过。' : body.accept ? '已成为好友，并按对方角色归类。' : '已忽略这次申请。');
    } catch {
      notice('操作未完成，请刷新后重试；只有对方通过后才会加入好友列表。');
    } finally {
      busy = false;
      if (button) button.disabled = false;
      await refresh();
    }
  }
  function openGroup(id) {
    const friend = state.friends.find(item => item.id === id);
    if (!friend) return;
    editingId = id;
    const names = [...new Set([...TYPES, ...state.friends.map(groupFor)])];
    $('friend-group-select').innerHTML = names.map(name => `<option>${esc(name)}</option>`).join('') + '<option value="__custom__">自定义分区</option>';
    $('friend-group-select').value = groupFor(friend);
    $('friend-custom-group').value = '';
    $('friend-custom-group-wrap').hidden = true;
    $('friend-group-dialog').showModal();
  }
  function init(options) {
    context = options.context; notice = options.notice;
    try { const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) grouping = saved; } catch {}
    render();
    $('friend-close').onclick = () => $('friend-dialog').close();
    $('friend-group-close').onclick = () => $('friend-group-dialog').close();
    $('chat-friends').onclick = async () => { $('friend-dialog').showModal(); await refresh(); };
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.requestPeer) mutate('/api/friends/request', {targetProfileId:button.dataset.requestPeer}, button);
      if (button.dataset.friendAccept) mutate('/api/friends/respond', {requestId:button.dataset.friendAccept, accept:true}, button);
      if (button.dataset.friendReject) mutate('/api/friends/respond', {requestId:button.dataset.friendReject, accept:false}, button);
      if (button.dataset.removeFriend) removeFriend(button.dataset.removeFriend, button);
      if (button.dataset.regroupFriend) openGroup(button.dataset.regroupFriend);
    });
    $('friend-group-select').onchange = () => { $('friend-custom-group-wrap').hidden = $('friend-group-select').value !== '__custom__'; };
    $('friend-group-form').onsubmit = event => {
      event.preventDefault();
      const value = $('friend-group-select').value;
      const name = value === '__custom__' ? $('friend-custom-group').value.trim() : value;
      if (!name || name === '__custom__') { $('friend-custom-group').focus(); notice('请输入分区名称。'); return; }
      const next = {...grouping, [editingId]: name};
      try { localStorage.setItem(storageKey(), JSON.stringify(next)); grouping = next; }
      catch { notice('分区未能保存，请检查浏览器存储后重试。'); return; }
      $('friend-group-dialog').close(); render(); notice('好友分区已更新。');
    };
    window.addEventListener('storage', event => {
      if (event.key !== storageKey()) return;
      try { grouping = JSON.parse(event.newValue || '{}'); render(); } catch {}
    });
    refresh(); clearInterval(timer); timer = setInterval(refresh, 1500);
  }
  async function removeFriend(id, button) {
    if (busy) return;
    busy = true; generation++; button.disabled = true;
    try {
      const res = await fetch('/api/friends/' + encodeURIComponent(id) + '?' + new URLSearchParams(context()), {method:'DELETE'});
      if (!res.ok) throw new Error('failed');
      notice('好友已删除，双方好友列表已更新。');
    } catch { notice('删除好友未完成，请刷新后重试。'); }
    finally { busy = false; button.disabled = false; await refresh(); }
  }
  window.TongpinFriends = {init, refresh};
})();
