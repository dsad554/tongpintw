(() => {
  const protectedSelectors = [
    '#open-create', '#open-solve', '#chat-nav', '#chat-friends', '#extend-topic', '#end-chat',
    '#friends-nav', '.nav-btn[data-view="shelf"]'
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
    window.location.assign('/api/auth/zhihu/start');
  }, true);
})();
