const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.TONGPIN_TEST_URL;
if(!base)throw new Error('请设置独立测试服务 TONGPIN_TEST_URL，避免向用户预览写入测试数据。');
const output=process.env.TONGPIN_TEST_OUTPUT||path.resolve(__dirname,'../../知乎黑客松1/资料/成就验收');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  try{
    await fs.mkdir(output,{recursive:true});
    const a=await context.newPage();await a.goto(base);
    await a.locator('[data-view=shelf]').click();
    assert.equal(await a.locator('#achievement-panel').isVisible(),false);
    await a.locator('#toggle-achievements').focus();await a.keyboard.press('Enter');
    assert.equal(await a.locator('#toggle-achievements').getAttribute('aria-expanded'),'true');
    assert.equal(await a.locator('.achievement-badge').count(),2);
    assert.match(await a.locator('.achievement-badge').first().innerText(),/待点亮/);
    assert.equal(await a.locator('.badge-art img').evaluateAll(imgs=>imgs.every(x=>x.complete&&x.naturalWidth>0&&getComputedStyle(x).objectFit==='contain')),true);
    await a.screenshot({path:path.join(output,'桌面-徽章展开.png')});
    await a.locator('#toggle-achievements').click();
    await a.screenshot({path:path.join(output,'桌面-成就小入口.png')});
    for(const width of [320,375,768]){
      await a.setViewportSize({width,height:812});
      assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px 页面溢出`);
      await a.locator('#toggle-achievements').click();
      assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px 徽章溢出`);
      await a.screenshot({path:path.join(output,`手机-${width}-徽章展开.png`)});
      await a.locator('#toggle-achievements').click();
    }
    await a.setViewportSize({width:1280,height:800});
    await a.locator('[data-view=board]').click();await a.locator('#open-create').click();
    await a.locator('#q-text').fill('成就验收：怎样把一个学习问题分成可实践的步骤？');
    await a.locator('#q-name').fill('测试提问者');await a.locator('#q-want').fill('学会拆解步骤');
    await a.locator('#create-form button[type=submit],#create-form button[value=default]').click();
    await a.waitForFunction(()=>!!JSON.parse(localStorage.getItem('tongpin-community-v2')||'null')?.activeId);
    const q=await a.evaluate(()=>{const d=JSON.parse(localStorage.getItem('tongpin-community-v2'));return d.questions.find(q=>q.id===d.activeId)});
    const b=await context.newPage();await b.goto(`${base}?role=b&question=${q.id}`);
    await a.locator('#chat-input').fill('我先明确目标，再安排一个小练习。');await a.locator('#chat-form button').click();
    await b.waitForFunction(()=>document.querySelector('#chat-messages').textContent.includes('我先明确目标'));
    await b.locator('#chat-input').fill('可以先用十分钟试一次，再根据结果调整。');await b.locator('#chat-form button').click();
    await a.waitForFunction(()=>document.querySelector('#chat-messages').textContent.includes('可以先用十分钟'));
    for(const [page,summary] of [[a,'学到了先做小练习再调整。'],[b,'帮助对方把目标分成了可行动的小步骤。']]){
      await page.locator('#end-chat').click();await page.locator('#key-lines input').first().check();
      await page.locator('#my-summary').fill(summary);await page.locator('#finish-form button[value=default]').click();
    }
    await b.waitForTimeout(120);
    assert.equal(await b.locator('#achievement-toast').isVisible(),true,'完成后显示成就提示');
    assert.match(await b.locator('#achievement-toast').innerText(),/成就更新/);
    await b.locator('#achievement-toast-close').click();
    assert.equal(await b.locator('#achievement-toast').isVisible(),false,'可手动关闭成就提示');
    await a.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('tongpin-achievements-v1')||'{}')).length===1);
    for(const [page,index] of [[a,0],[b,1]]){
      await page.locator('[data-view=shelf]').click();await page.locator('#toggle-achievements').click();
      assert.match(await page.locator('.achievement-badge').nth(index).innerText(),/Lv\.1/);
      // 本地同源双标签属于同一本地访客，既提问也协助完成时两种成就都记录。
      assert.match(await page.locator('.achievement-badge').nth(1-index).innerText(),/Lv\.1/);
      await page.locator('.achievement-badge').nth(index).click();
      assert.equal(await page.locator('#achievement-preview-dialog').isVisible(),true,'可放大预览成就');
      const kind=index===0?'asker':'solver';
      for(const stage of [1,2,3,1]){
        await page.locator(`[data-preview-stage="${stage}"]`).click();
        assert.equal(await page.locator('#achievement-preview-body img').getAttribute('src'),`assets/ip/badge-${kind}-${stage}.png`);
        assert.equal(await page.locator(`[data-preview-stage="${stage}"]`).getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('[data-preview-stage][aria-pressed=true]').count(),1);
      }
      await page.locator('#achievement-preview-close').click();
    }
    const ledgerBefore=await a.evaluate(()=>localStorage.getItem('tongpin-achievements-v1'));
    await b.reload();await b.locator('[data-view=shelf]').click();await b.locator('#toggle-achievements').click();
    assert.match(await b.locator('.achievement-badge').nth(1).innerText(),/Lv\.1/);
    assert.equal(await b.evaluate(()=>localStorage.getItem('tongpin-achievements-v1')),ledgerBefore);
    await b.locator('[data-view=chat]').click();await b.locator('#end-chat').click();
    await b.locator('#my-summary').fill('再次确认同一问题已经解决。');await b.locator('#finish-form button[value=default]').click();
    assert.equal(await b.evaluate(()=>localStorage.getItem('tongpin-achievements-v1')),ledgerBefore,'同一问题不重复计数');
    // 下列为隔离浏览器中的等级边界样本，不进入用户浏览器或产品示例数据。
    for(const [count,level] of [[3,2],[10,3]]){
      await a.evaluate(n=>{const id=localStorage.getItem('tongpin-profile-v1');const records={};for(let i=0;i<n;i++)records['level-fixture-'+i]={asker:id,solver:'another-test-profile',completedAt:1};localStorage.setItem('tongpin-achievements-v1',JSON.stringify(records));},count);
      await a.locator('[data-view=shelf]').click();
      if(!await a.locator('#achievement-panel').isVisible())await a.locator('#toggle-achievements').click();
      assert.match(await a.locator('.achievement-badge').first().innerText(),new RegExp('Lv\\.'+level));
      assert.match(await a.locator('.achievement-badge').nth(1).innerText(),/待点亮/,'未参与解决者不获对应成就');
      assert.equal(await a.locator('.achievement-badge').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    }
    await a.screenshot({path:path.join(output,'桌面-成长等级测试样本.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: 默认收起、键盘开关、完成弹窗手动关闭、预览放大、完整图片、320/375/768px、双页完成计数、刷新保留、重复确认去重、1/3/10成长边界、分行为统计、无脚本错误。');
    console.log('截图：'+output);
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
