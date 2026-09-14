(() => {
  const protectedSelectors = [
    '#open-create', '#open-solve', '#chat-nav', '#chat-friends', '#extend-topic', '#end-chat',
    '.nav-btn[data-view="shelf"]'
  ];
  let authorized = false;
  fetch('/api/me', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((data) => { authorized = Boolean(data.user); })
    .catch(() => { authorized = false; });

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.(protectedSelectors.join(','));
    if (!target || authorized) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign((location.port === '51283' ? 'http://127.0.0.1:3000' : '') + '/api/auth/zhihu/start');
  }, true);
})();
