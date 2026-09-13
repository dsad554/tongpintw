// 实际浏览器验收；只启动 51341 隔离服务，不访问或修改 51283 的用户数据。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '测试输出', '好友验收');
const stateFile = path.join(output, '测试状态.json');
const port = 51341;
const base = `http://127.0.0.1:${port}`;
const results = [];
const errors = [];
const pages = [];
let browser, server;
let serverLog = '';

async function eventually(check, label, timeout = 12000) {
  const until = Date.now() + timeout;
  let error;
  while (Date.now() < until) {
    try { if (await check()) return; } catch (e) { error = e; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label}${error ? ': ' + error.message : ''}`);
}
async function check(name, fn) {
  const started = Date.now();
  try { await fn(); results.push({ name, passed: true, ms: Date.now() - started }); console.log('通过：' + name); }
  catch (e) { results.push({ name, passed: false, error: e.message }); throw e; }
}
async function nav(page, view) {
  await page.locator(`.nav-btn[data-view="${view}"]`).click();
  await page.locator(`#view-${view}.active`).waitFor();
}
async function openPerson(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push({ person: name, message: e.message, stack: e.stack }));
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
  pages.push({ name, page });
  const profileId = await page.evaluate(() => localStorage.getItem('tongpin-profile-v1'));
  assert(profileId, '访客身份已创建');
  return { name, context, page, profileId };
}
async function chat(person, text) {
  await nav(person.page, 'chat');
  await eventually(() => person.page.locator('#chat-input').isEnabled(), `${person.name} 可输入消息`);
  await person.page.locator('#chat-input').fill(text);
  await person.page.locator('#chat-form button[type="submit"]').click();
  await person.page.locator('#chat-messages .message').filter({ hasText: text }).waitFor();
}
async function requestFriend(from, to) {
  await nav(from.page, 'chat');
  await from.page.locator('#chat-friends').click();
  await from.page.locator('#friend-dialog[open]').waitFor();
  await from.page.locator(`#friend-peers [data-request-peer="${to.profileId}"]`).click();
  await eventually(async () => {
    const text = await from.page.locator('#friend-dialog').innerText();
    return /已发送|等待|申请中/.test(text) || !(await from.page.locator('#friend-dialog').isVisible());
  }, '发送好友申请得到可见反馈');
  if (await from.page.locator('#friend-dialog').isVisible()) await from.page.locator('#friend-dialog').getByRole('button', { name: '关闭', exact: true }).click();
}
async function acceptIncoming(person) {
  await nav(person.page, 'friends');
  const button = person.page.locator('#friend-incoming [data-friend-accept]');
  await button.first().waitFor();
  assert.equal(await button.count(), 1, '一次只有待验收的申请');
  await button.click();
  await eventually(async () => (await person.page.locator('#friend-incoming [data-friend-accept]').count()) === 0, '接受后移除待处理申请');
}
function row(person, group, peer) {
  return person.page.locator(`details[data-friend-group="${group}"] .friend-row[data-profile-id="${peer.profileId}"]`);
}
async function hasFriend(person, group, peer) {
  await nav(person.page, 'friends');
  await eventually(async () => (await row(person, group, peer).count()) === 1, `${person.name} 的 ${group} 含 ${peer.name}`);
}
async function ensureUnusedPort() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`测试端口 ${port} 已被占用；为保护已有进程，未终止任何服务。`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

(async () => {
  try {
    await fs.mkdir(output, { recursive: true });
    await ensureUnusedPort();
    // 仅覆盖此脚本自己的隔离测试数据文件；每次验收从空状态开始。
    await fs.writeFile(stateFile, JSON.stringify({ questions: [], messages: [], shelf: [], topics: [], achievements: [], friendRequests: [], friendships: [] }), 'utf8');
    server = spawn(process.execPath, [path.join(root, '工具', '本地预览.mjs')], {
      cwd: root, windowsHide: true,
      env: { ...process.env, TONGPIN_PORT: String(port), TONGPIN_STATE_FILE: stateFile, TONGPIN_RESTORE_STATE: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', chunk => { serverLog += chunk; });
    server.stderr.on('data', chunk => { serverLog += chunk; });
    await eventually(async () => (await fetch(base + '/api/state')).ok, '隔离本地服务可访问');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const A = await openPerson('提问者甲');
    const B = await openPerson('解决者乙');
    const C = await openPerson('社区丙');
    assert.equal(new Set([A.profileId, B.profileId, C.profileId]).size, 3, '三个浏览器上下文身份互相独立');

    await check('好友是独立顶部页面，个人卡片标题不再放好友按钮', async () => {
      assert.equal(await A.page.locator('.nav [data-view="friends"]').count(), 1);
      assert.equal(await A.page.locator('#view-shelf #open-friends').count(), 0);
      await nav(A.page, 'friends');
      for (const group of ['提问者', '解决者', '社群好友']) assert.equal(await A.page.locator(`details[data-friend-group="${group}"]`).count(), 1);
    });

    const question = '好友验收：怎样为毕业后的第一份工作准备作品集？';
    await check('提出问题，另一端选择问题后填写昵称与需求进入交流', async () => {
      await nav(A.page, 'board');
      await A.page.locator('#open-create').click();
      await A.page.locator('#create-close').click();
      assert.equal(await A.page.locator('#create-dialog').isVisible(), false, '空表单直接关闭');
      await A.page.locator('#open-create').click();
      await A.page.locator('#q-category').selectOption({ label: '求职' });
      await A.page.locator('#q-text').fill(question);
      await A.page.locator('#q-name').fill(A.name);
      await A.page.locator('#q-want').fill('学会梳理作品集结构');
      await A.page.locator('#create-form .dialog-actions button').click();
      await A.page.locator('#view-chat.active').waitFor();
      await B.page.locator('#board-list .board-card').filter({ hasText: question }).waitFor();
      assert(await B.page.locator('#open-solve').isDisabled(), '未选问题不可解决');
      await B.page.locator('#board-list .board-card').filter({ hasText: question }).locator('h3').click();
      assert.equal(await B.page.locator('#board-list .board-card.selected').count(), 1, '问题块明确选中');
      await B.page.locator('#open-solve').click();
      await B.page.locator('#join-dialog[open]').waitFor();
      await B.page.locator('#join-name').fill(B.name);
      await B.page.locator('#join-want').fill('一起明确项目案例的呈现重点');
      await B.page.locator('#join-form .dialog-actions button').click();
      await B.page.locator('#view-chat.active').waitFor();
    });

    await check('两个独立用户能互发并收到消息', async () => {
      await chat(A, '我准备了课程项目，需要如何选案例？');
      await B.page.locator('#chat-messages .message').filter({ hasText: '我准备了课程项目，需要如何选案例？' }).waitFor();
      await chat(B, '先选择与你的目标岗位最相关的两个案例。');
      await A.page.locator('#chat-messages .message').filter({ hasText: '先选择与你的目标岗位最相关的两个案例。' }).waitFor();
    });

    await check('申请未经同意不会进入好友列表，对方通过后按角色双向分类', async () => {
      await requestFriend(B, A);
      await nav(B.page, 'friends');
      await eventually(async () => /等待|已发送|待通过/.test(await B.page.locator('#friend-outgoing').innerText()), '发送者看到待通过申请');
      assert.equal(await B.page.locator('#friend-groups .friend-row').count(), 0, '未通过前没有好友');
      await nav(A.page, 'friends');
      await A.page.locator('#friend-incoming [data-friend-accept]').waitFor();
      assert.equal(await A.page.locator('#friend-groups .friend-row').count(), 0, '收件者通过前没有好友');
      await acceptIncoming(A);
      await hasFriend(A, '解决者', B);
      await hasFriend(B, '提问者', A);
    });

    await check('好友折叠可操作，后台轮询保留节点、展开状态和焦点', async () => {
      const group = B.page.locator('details[data-friend-group="提问者"]');
      if (!(await group.getAttribute('open'))) {
        if (!(await group.evaluate(el => el.open))) await group.locator('summary').click();
      }
      await group.locator('summary').focus();
      await group.evaluate(el => { window.__friendGroupNode = el; window.__friendGroupSummary = el.querySelector('summary'); });
      await B.page.waitForTimeout(2800);
      assert(await group.evaluate(el => el === window.__friendGroupNode && el.open), '轮询未替换展开的分组');
      assert(await B.page.evaluate(() => document.activeElement === window.__friendGroupSummary), '轮询未夺走焦点');
      await group.locator('summary').click();
      assert.equal(await group.evaluate(el => el.open), false, '可以缩回');
      await B.page.waitForTimeout(1500);
      assert.equal(await group.evaluate(el => el.open), false, '缩回状态在轮询后保留');
    });

    await check('刷新后双向好友与角色分类仍存在', async () => {
      await Promise.all([A.page.reload(), B.page.reload()]);
      await hasFriend(A, '解决者', B);
      await hasFriend(B, '提问者', A);
    });

    await check('扩展至疑问社区，第三者从社区进入后可交流和申请好友', async () => {
      await nav(A.page, 'chat');
      await A.page.locator('#extend-topic').click();
      await A.page.locator('#view-community.active').waitFor();
      await nav(C.page, 'community');
      const topic = C.page.locator('#topic-list .topic-card').filter({ hasText: question });
      await topic.waitFor();
      await topic.locator('.topic-enter').click();
      await C.page.locator('#view-chat.active').waitFor();
      await chat(C, '社区补充：每个案例说明自己的具体贡献。');
      await nav(A.page, 'chat');
      await A.page.locator('#chat-messages .message').filter({ hasText: '社区补充：每个案例说明自己的具体贡献。' }).waitFor();
      await requestFriend(C, A);
      await acceptIncoming(A);
      await hasFriend(A, '社群好友', C);
      await hasFriend(C, '提问者', A);
    });

    await check('拒绝申请不会形成好友，其他已接受好友不受影响', async () => {
      await requestFriend(C, B);
      await nav(B.page, 'friends');
      const reject = B.page.locator('#friend-incoming [data-friend-reject]');
      await reject.waitFor();
      await reject.click();
      await eventually(async () => (await B.page.locator('#friend-incoming [data-friend-reject]').count()) === 0, '拒绝后申请移除');
      await nav(C.page, 'friends');
      await C.page.waitForTimeout(1500);
      assert.equal(await B.page.locator(`.friend-row[data-profile-id="${C.profileId}"]`).count(), 0);
      assert.equal(await C.page.locator(`.friend-row[data-profile-id="${B.profileId}"]`).count(), 0);
      await hasFriend(C, '提问者', A);
    });

    await check('接受好友之后可自定义分区，分区只改变自己的好友视图', async () => {
      await nav(B.page, 'friends');
      const group = B.page.locator('details[data-friend-group="提问者"]');
      if (!(await group.evaluate(el => el.open))) await group.locator('summary').click();
      await row(B, '提问者', A).locator('[data-regroup-friend]').click();
      await B.page.locator('#friend-group-dialog[open]').waitFor();
      await B.page.locator('#friend-group-select').selectOption('__custom__');
      await B.page.locator('#friend-custom-group').fill('一起准备作品集');
      await B.page.locator('#friend-group-form button[type="submit"]').click();
      await hasFriend(B, '一起准备作品集', A);
      assert.equal(await row(B, '提问者', A).count(), 0, '自定义分区后从原组移出');
      await hasFriend(A, '解决者', B);
      await B.page.reload();
      await hasFriend(B, '一起准备作品集', A);
    });

    await check('320、375、631、1280 像素好友页面无横向溢出且列表文字可见', async () => {
      await nav(A.page, 'friends');
      for (const width of [320, 375, 631, 1280]) {
        await A.page.setViewportSize({ width, height: 850 });
        for (const group of ['提问者', '解决者', '社群好友']) {
          const detail = A.page.locator(`details[data-friend-group="${group}"]`);
          if (!(await detail.evaluate(el => el.open))) await detail.locator('summary').click();
        }
        assert(await A.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px 页面无横向溢出`);
        assert(await A.page.locator('.nav-btn[data-view="friends"]').evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; }), `${width}px 当前好友导航在视口内`);
        for (const peer of [B, C]) {
          const friend = A.page.locator(`#view-friends .friend-row[data-profile-id="${peer.profileId}"]`);
          assert(await friend.isVisible(), `${width}px 好友行可见`);
          assert(await friend.evaluate(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.right <= innerWidth + 1 && getComputedStyle(el).opacity !== '0'; }), `${width}px 好友行在视口内`);
        }
        await A.page.screenshot({ path: path.join(output, `${width}-好友分组.png`), fullPage: true });
        if (width === 320) {
          await row(A, '解决者', B).locator('[data-regroup-friend]').click();
          await A.page.locator('#friend-group-select').selectOption('__custom__');
          const input = A.page.locator('#friend-custom-group');
          await input.fill('移动端临时检查');
          assert(await input.evaluate(el => { const b = el.getBoundingClientRect(); const style = getComputedStyle(el); return b.width >= 160 && b.height >= 40 && b.left >= 0 && b.right <= innerWidth + 1 && style.color !== style.backgroundColor; }), '320px 自定义分区输入框尺寸合理、文字可见');
          await A.page.screenshot({ path: path.join(output, '320-自定义分区弹窗.png'), fullPage: true });
          await input.fill('');
          await A.page.locator('#friend-group-close').click();
          assert.equal(await A.page.locator('#friend-group-dialog').isVisible(), false, '空分区输入可直接关闭弹窗');
        }
      }
    });

    await check('浏览器无未处理脚本异常', async () => assert.deepEqual(errors, []));
    const state = await (await fetch(base + '/api/state')).json();
    await fs.writeFile(path.join(output, '验收后的公开状态.json'), JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
    for (const { name, page } of pages) await page.screenshot({ path: path.join(output, `失败-${name}.png`), fullPage: true }).catch(() => {});
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 3000); }); }
    await fs.writeFile(path.join(output, '浏览器验收报告.json'), JSON.stringify({ completedAt: new Date().toISOString(), url: base, results, errors }, null, 2), 'utf8');
    await fs.writeFile(path.join(output, '隔离服务日志.txt'), serverLog, 'utf8');
  }
})();
