const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.TONGPIN_TEST_URL||'http://127.0.0.1:51329/index.html';
const output=path.resolve(__dirname,'../../知乎黑客松1/资料/CardSwap卡片验收');
const front=page=>page.locator('.tp-card-swap__card[data-active=true]');
const settled=page=>page.locator('.tp-card-swap[data-moving=false]').waitFor();
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 async function open(options={},shelf){
  const context=await browser.newContext(options);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/state',r=>r.fulfill({json:{questions:[],messages:[],shelf:[]}}));
  await page.addInitScript(saved=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}});
    Object.defineProperty(navigator,'share',{configurable:true,value:async card=>{window.__shared=card}});
    if(saved)localStorage.setItem('tongpin-community-v2',JSON.stringify({questions:[],shelf:saved}));
  },shelf);
  await page.goto(base);await page.locator('[data-view=shelf]').click();await settled(page);return {context,page};
 }
 try{
  await fs.mkdir(output,{recursive:true});const {page,context}=await open({viewport:{width:1280,height:850}});
  assert.equal(await page.locator('.tp-card-swap__card').count(),3);assert.equal(await page.locator('#shelf-count').innerText(),'0');
  await page.getByRole('button',{name:'暂停轮播',exact:true}).click();
  for(const width of [320,375,768,1280]){
    await page.setViewportSize({width,height:850});await settled(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}页面横向溢出`);
    for(let i=0;i<3;i++){
      const before=await front(page).getAttribute('data-card-id');await page.getByRole('button',{name:'下一张卡片',exact:true}).click();await settled(page);
      assert.notEqual(await front(page).getAttribute('data-card-id'),before);assert.equal(await page.locator('.tp-card-swap__card[data-active=true]').count(),1);
      assert(await front(page).evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth}));
      const title=await front(page).locator('h3').innerText();await front(page).getByRole('button',{name:'复制卡片',exact:true}).click();assert((await page.evaluate(()=>window.__copied)).startsWith(title));
      await front(page).getByRole('button',{name:'分享',exact:true}).click();assert.equal((await page.evaluate(()=>window.__shared)).title,title);
      assert(await front(page).getByRole('button',{name:'复制卡片',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));
    }
    await page.screenshot({path:path.join(output,`${width}-叠卡.png`)});
  }
  const retained=await front(page).getAttribute('data-card-id');await front(page).evaluate(el=>window.__retainedCard=el);
  await page.waitForTimeout(2700);
  assert.equal(await front(page).evaluate(el=>el===window.__retainedCard),true,'后台轮询保留节点');assert.equal(await front(page).getAttribute('data-card-id'),retained);
  await page.getByRole('button',{name:'继续轮播',exact:true}).click();await page.locator('[data-view=shelf]').focus();await page.mouse.move(0,0);
  await page.waitForFunction(id=>document.querySelector('.tp-card-swap__card[data-active=true]').dataset.cardId!==id,retained,{timeout:10000});await settled(page);
  const hovered=await front(page).getAttribute('data-card-id');await front(page).hover();await page.waitForTimeout(7100);assert.equal(await front(page).getAttribute('data-card-id'),hovered,'悬停暂停');
  await page.mouse.move(0,0);await front(page).locator('.tp-card-swap__body').focus();await page.waitForTimeout(7100);assert.equal(await front(page).getAttribute('data-card-id'),hovered,'阅读焦点暂停');
  await page.locator('[data-view=board]').click();await page.waitForTimeout(7100);assert.equal(await front(page).getAttribute('data-card-id'),hovered,'隐藏视图暂停');
  await context.close();
  const longCard={id:'saved-long',title:'真实卡片：很长的问题标题'.repeat(12),summary:'我保留的关键句与总结。\n'.repeat(100),category:'用户自己的分类',createdAt:1};
  const real=await open({viewport:{width:320,height:700},reducedMotion:'reduce'},[longCard]);
  assert.equal(await real.page.locator('.tp-card-swap__card').count(),1);assert.equal(await real.page.locator('#shelf-count').innerText(),'1');
  assert.equal(await real.page.locator('.tp-card-swap__tag').innerText(),'用户自己的分类');assert.equal(await real.page.getByRole('button',{name:'下一张卡片'}).isDisabled(),true);
  assert(await front(real.page).locator('.tp-card-swap__body').evaluate(e=>e.scrollHeight>e.clientHeight));
  assert(await front(real.page).getByRole('button',{name:'复制卡片'}).isVisible());
  await real.page.reload();await real.page.locator('[data-view=shelf]').click();await settled(real.page);assert.equal(await front(real.page).getAttribute('data-card-id'),'saved-long');
  await real.page.screenshot({path:path.join(output,'320-真实长卡片.png')});await real.context.close();
  const reduced=await open({viewport:{width:375,height:812},reducedMotion:'reduce'});assert(await reduced.page.getByRole('button',{name:'静态浏览'}).isDisabled());
  const first=await front(reduced.page).getAttribute('data-card-id');await reduced.page.getByRole('button',{name:'下一张卡片'}).click();await settled(reduced.page);assert.notEqual(await front(reduced.page).getAttribute('data-card-id'),first);
  await reduced.context.close();assert.deepEqual(errors,[]);console.log('PASS 3张示例/真实替换与刷新、320/375/768/1280px、前后切换、复制分享、自动播放与悬停/焦点/隐藏暂停、长文滚动、减少动态、轮询不重建，无脚本错误。');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
