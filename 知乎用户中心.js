(() => {
  const root = document.getElementById('zhihu-account');
  if (!root) return;
  const apiBase = location.port === '51283' ? 'http://127.0.0.1:3000' : '';
  const loginHref = `${apiBase}/api/auth/zhihu/start`;
  let profile;
  function esc(value) { const div = document.createElement('div'); div.textContent = value == null ? '' : String(value); return div.innerHTML; }
  function renderLoggedOut() { root.innerHTML = `<a class="zhihu-login-button" href="${loginHref}">知乎登录</a>`; }
  function renderLoggedIn(user) {
    root.innerHTML = `<button type="button" class="zhihu-account-button" aria-expanded="false"><img src="${esc(user.avatar_path)}" alt=""><span>${esc(user.fullname || '知乎用户')}</span></button><div class="zhihu-profile-popover" hidden><div class="zhihu-profile-head"><img src="${esc(user.avatar_path)}" alt=""><div><strong>${esc(user.fullname || '知乎用户')}</strong><p>${esc(user.headline || '知乎用户')}</p></div></div><p class="zhihu-description">${esc(user.description || '')}</p><section><h3>关注的人</h3><ul data-list="followees"><li class="zhihu-muted">打开后加载</li></ul><button type="button" class="zhihu-more" data-more="followees" hidden>加载更多</button></section><section><h3>创作信息</h3><ul data-list="contents"><li class="zhihu-muted">打开后加载</li></ul><button type="button" class="zhihu-more" data-more="contents" hidden>加载更多</button></section><button type="button" class="zhihu-logout-button" data-logout>退出同频账号</button><p class="zhihu-logout-error" data-logout-error hidden role="alert">退出失败，请重试。</p></div>`;
    const toggle = root.querySelector('.zhihu-account-button'); const pop = root.querySelector('.zhihu-profile-popover');
    toggle.addEventListener('click', async () => { const open = !pop.hidden; pop.hidden = open; toggle.setAttribute('aria-expanded', String(!open)); if (!open && !profile.loaded) { profile.loaded = true; await Promise.all([loadList('followees', 0), loadList('contents', 0)]); } });
    root.querySelectorAll('[data-more]').forEach((button) => button.addEventListener('click', () => loadList(button.dataset.more, profile[button.dataset.more].offset)));
    root.querySelector('[data-logout]').addEventListener('click', logout);
    profile = { loaded: false, followees: { offset: 0 }, contents: { offset: 0 } };
  }
  async function loadList(type, offset) {
    const state = profile[type]; const list = root.querySelector(`[data-list="${type}"]`); const more = root.querySelector(`[data-more="${type}"]`); if (!list || state.loading) return; state.loading = true;
    const data = await fetch(`${apiBase}/api/me/${type}?limit=10&offset=${offset}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }).then((r) => r.json()).catch(() => ({}));
    if (offset === 0) list.innerHTML = ''; const items = data.items || []; if (!items.length && offset === 0) list.innerHTML = '<li class="zhihu-muted">暂无数据</li>';
    items.forEach((item) => { const li = document.createElement('li'); if (type === 'followees') li.innerHTML = `<strong>${esc(item.fullname || item.Fullname || '知乎用户')}</strong><span>${esc(item.headline || item.Headline || '')}</span>`; else li.innerHTML = `<a href="${esc(item.url || item.Url || '#')}" target="_blank" rel="noreferrer">${esc(item.title || item.Title || '未命名创作')}</a><span>${esc(item.summary || item.Summary || '')}</span>`; list.appendChild(li); });
    state.offset = data.nextOffset ?? offset; state.end = Boolean(data.isEnd ?? true); more.hidden = state.end || !items.length; state.loading = false;
  }
  async function logout(event) {
    event.preventDefault(); const button = event.currentTarget; const error = root.querySelector('[data-logout-error]'); button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '正在退出…'; error.hidden = true;
    try { const response = await fetch(`${apiBase}/api/auth/zhihu/logout`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }); const data = await response.json().catch(() => ({})); if (!response.ok || data.ok !== true) throw new Error('logout_failed'); const redirect = typeof data.redirect === 'string' && /^\/(?!\/)/.test(data.redirect) ? data.redirect : '/same-frequency/index.html?logged_out=1'; window.location.assign(redirect); }
    catch (_error) { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = '退出同频账号'; error.hidden = false; }
  }
  fetch(`${apiBase}/api/me`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }).then((r) => r.json()).then((data) => { if (data.user) renderLoggedIn(data.user); else renderLoggedOut(); }).catch(renderLoggedOut);
})();
