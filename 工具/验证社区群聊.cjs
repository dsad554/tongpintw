const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base=process.env.TEST_URL||'http://127.0.0.1:51331';
const output=path.resolve(__dirname,'../文档/验收/疑问社区群聊');
fs.mkdirSync(output,{recursive:true});
const report=[];
const until=async fn=>{for(let i=0;i<60;i++){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw new Error('等待状态超时');};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const errors=[];
  const pages=await Promise.all([1280,631,375].map(async width=>{const context=await browser.newContext({viewport:{width,height:800}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);return page;}));
  const [a,b,c]=pages;
  await a.locator('#open-create').click();await a.locator('#create-close').click();assert.equal(await a.locator('#create-dialog').evaluate(e=>e.open),false);
  const title='群聊验收：如何安排第一次求职复盘？'+Date.now();
  await a.locator('#open-create').click();await a.locator('#q-category').selectOption('求职');await a.locator('#q-text').fill(title);await a.locator('#q-name').fill('提问者小林');await a.locator('#create-form button[value="default"]').click();
  await a.locator('#chat-input').waitFor({state:'visible'});
  await until(()=>a.locator('#extend-topic').isEnabled());
  await until(()=>b.locator('.board-card').filter({hasText:title}).count());
  await b.locator('.board-card').filter({hasText:title}).locator('.match-btn').click();
  await b.locator('#join-name').fill('解决者小陈');await b.locator('#join-want').fill('一起梳理经验');await b.locator('#join-form button[type="submit"],#join-form button[value="default"]').click();
  await until(()=>b.locator('#chat-input').isEnabled());
  await b.locator('#extend-topic').click();
  await b.locator('#view-community.active .topic-enter').waitFor();
  assert.equal(await b.locator('.topic-card').filter({hasText:title}).count(),1);
  report.push('无人工消息时，回应者可直接扩展；疑问社区显示一张问题块和加入房间按钮。');
  await a.locator('#community-nav').click();await until(()=>a.locator('.topic-card').filter({hasText:title}).count());
  await c.locator('#community-nav').click();await until(()=>c.locator('.topic-card').filter({hasText:title}).count());
  for(const p of pages)await p.locator('.topic-card').filter({hasText:title}).locator('.topic-enter').click();
  for(let i=0;i<pages.length;i++){await until(()=>pages[i].locator('#chat-input').isEnabled());await pages[i].locator('#chat-input').fill(['我先列出投递记录。','我建议按岗位要求复盘。','社区补充：可以记录面试反馈。'][i]);await pages[i].locator('#chat-form button').click();}
  for(const p of pages)await until(async()=>await p.locator('#chat-messages').innerText().then(t=>t.includes('我先列出投递记录。')&&t.includes('我建议按岗位要求复盘。')&&t.includes('社区补充：可以记录面试反馈。')));
  const state=await fetch(base+'/api/state').then(r=>r.json()),q=state.questions.find(q=>q.text===title),topic=state.topics.find(t=>t.roomId===q.roomId);
  assert.equal(topic.participants.length,3);assert.equal(new Set(state.messages.filter(m=>m.roomId===q.roomId&&m.senderId).map(m=>m.senderId)).size,3);
  assert.ok((await a.locator('#chat-messages').innerText()).includes('解决者小陈'));
  report.push('三个独立浏览器身份互发成功，每方收到三条消息，服务端保存三个不同 senderId。');
  await c.reload();await c.locator('#chat-nav').click();await until(()=>c.locator('#chat-input').isEnabled());assert.ok((await c.locator('#room-meta').innerText()).includes('3 人'));
  await c.locator('#chat-input').fill('刷新后继续群聊');await c.locator('#chat-form button').click();await until(async()=>(await a.locator('#chat-messages').innerText()).includes('刷新后继续群聊'));
  for(const p of [a,b]){await p.locator('#extend-topic').click();await p.locator('.topic-card').filter({hasText:title}).locator('.topic-enter').click();}
  const s2=await fetch(base+'/api/state').then(r=>r.json());assert.equal(s2.topics.filter(t=>t.roomId===q.roomId).length,1);assert.equal(s2.topics.find(t=>t.roomId===q.roomId).participants.length,3);
  report.push('刷新重进和重复加入保持原房间、三人身份和历史消息；无重复话题。');
  const style=await a.locator('.message.system').first().evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.equal(style.bg,'rgba(0, 0, 0, 0)');
  const mine=await a.locator('.message.mine').first().evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(mine,'rgba(0, 0, 0, 0)');
  for(let i=0;i<pages.length;i++){assert.equal(await pages[i].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await pages[i].screenshot({path:path.join(output,`群聊-${[1280,631,375][i]}像素.png`),fullPage:true});}
  report.push('1280/631/375px 无横向溢出；系统背景透明、文字 '+style.color+'；用户气泡保留底色。');
  await c.route('**/api/messages',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));await c.locator('#chat-input').fill('失败后保留文字');await c.locator('#chat-form button').click();await until(async()=>(await c.locator('#notice').innerText()).includes('消息发送失败'));assert.equal(await c.locator('#chat-input').inputValue(),'失败后保留文字');await c.unroute('**/api/messages');
  report.push('发送失败有明确提示，输入内容保留。');
  await a.locator('[data-view="board"]').click();await a.locator('#open-create').click();await a.locator('#q-text').fill('第二间房：学习计划如何拆分？');await a.locator('#q-name').fill('提问者小林');await a.locator('#create-form button[value="default"]').click();await until(()=>a.locator('#extend-topic').isEnabled());
  await a.route('**/api/topics',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));await a.locator('#extend-topic').click();await until(async()=>(await a.locator('#notice').innerText()).includes('发布到疑问社区失败'));assert.equal(await a.locator('#view-chat').evaluate(e=>e.classList.contains('active')),true);await a.unroute('**/api/topics');
  await a.locator('#extend-topic').click();await a.locator('#view-community.active .topic-enter').first().waitFor();await a.locator('.topic-card').filter({hasText:'第二间房：学习计划如何拆分？'}).locator('.topic-enter').click();await a.locator('#chat-input').fill('第二间房独立消息');await a.locator('#chat-form button').click();await until(async()=>(await a.locator('#chat-messages').innerText()).includes('第二间房独立消息'));
  await new Promise(r=>setTimeout(r,1600));assert.ok(!(await b.locator('#chat-messages').innerText()).includes('第二间房独立消息'));assert.ok(!(await a.locator('#chat-messages').innerText()).includes('我先列出投递记录。'));
  report.push('提问者同样可在仅系统消息时发布；发布失败不假报成功；第二个房间不串原房间消息。');
  await a.locator('#community-nav').click();await a.locator('#topic-list').screenshot({path:path.join(output,'疑问社区问题块.png')});
  assert.deepEqual(errors,[]);report.push('三个浏览器均无未捕获脚本错误。');
  fs.writeFileSync(path.join(output,'验收结果.json'),JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
