(() => {
  const root = document.getElementById('zhihu-account');
  if (!root) return;
  const loginHref = '/api/auth/zhihu/start';
  let profile;

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  function renderLoggedOut() {
    root.innerHTML = `<a class="zhihu-login-button" href="${loginHref}">知乎登录</a>`;
  }

  function renderLoggedIn(user) {
    root.innerHTML = `<button type="button" class="zhihu-account-button" aria-expanded="false"><img src="${esc(user.avatar_path)}" alt=""><span>${esc(user.fullname || '知乎用户')}</span></button><div class="zhihu-profile-popover" hidden><div class="zhihu-profile-head"><img src="${esc(user.avatar_path)}" alt=""><div><strong>${esc(user.fullname || '知乎用户')}</strong><p>${esc(user.headline || '知乎用户')}</p></div></div><p class="zhihu-description">${esc(user.description || '')}</p><section><h3>关注的人</h3><ul data-list="followees"><li class="zhihu-muted">打开后加载</li></ul><button type="button" class="zhihu-more" data-more="followees" hidden>加载更多</button></section><section><h3>创作信息</h3><ul data-list="contents"><li class="zhihu-muted">打开后加载</li></ul><button type="button" class="zhihu-more" data-more="contents" hidden>加载更多</button></section></div>`;
    const toggle = root.querySelector('.zhihu-account-button');
    const pop = root.querySelector('.zhihu-profile-popover');
    toggle.addEventListener('click', async () => {
      const open = !pop.hidden;
      pop.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
      if (!open && !profile.loaded) { profile.loaded = true; await Promise.all([loadList('followees', 0), loadList('contents', 0)]); }
    });
    root.querySelectorAll('[data-more]').forEach((button) => button.addEventListener('click', () => loadList(button.dataset.more, profile[button.dataset.more].offset)));
    profile = { loaded: false, followees: { offset: 0 }, contents: { offset: 0 } };
  }

  async function loadList(type, offset) {
    const state = profile[type];
    const list = root.querySelector(`[data-list="${type}"]`);
    const more = root.querySelector(`[data-more="${type}"]`);
    if (!list || state.loading) return;
    state.loading = true;
    const data = await fetch(`/api/me/${type}?limit=10&offset=${offset}`, { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}));
    if (offset === 0) list.innerHTML = '';
    const items = data.items || [];
    if (!items.length && offset === 0) list.innerHTML = '<li class="zhihu-muted">暂无数据</li>';
    items.forEach((item) => {
      const li = document.createElement('li');
      if (type === 'followees') li.innerHTML = `<strong>${esc(item.fullname || item.Fullname || '知乎用户')}</strong><span>${esc(item.headline || item.Headline || '')}</span>`;
      else li.innerHTML = `<a href="${esc(item.url || item.Url || '#')}" target="_blank" rel="noreferrer">${esc(item.title || item.Title || '未命名创作')}</a><span>${esc(item.summary || item.Summary || '')}</span>`;
      list.appendChild(li);
    });
    state.offset = data.nextOffset ?? offset;
    state.end = Boolean(data.isEnd ?? true);
    more.hidden = state.end || !items.length;
    state.loading = false;
  }

  fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json()).then((data) => {
    if (data.user) renderLoggedIn(data.user); else renderLoggedOut();
  }).catch(renderLoggedOut);
})();
