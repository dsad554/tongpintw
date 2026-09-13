const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

// 独立浏览器与内存 API，避免向用户的本地房间写入或删除测试问题。
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const output=path.resolve(__dirname,'../memory/验收截图/取消选择与删除按钮');
 await fs.mkdir(output,{recursive:true});
 try{
  for(const width of [320,631,1280]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   let questions=[
    {id:'test-first',category:'学习',text:'怎样安排一周的复习？',name:'测试提问者',want:'安排复习顺序',roomId:'test-room-1'},
    {id:'test-second',category:'求职',text:'第一份简历怎么整理？',name:'测试提问者',want:'明确简历重点',roomId:'test-room-2'},
    {id:'test-matched',category:'学习',text:'已经匹配的问题',name:'测试提问者',roomId:'test-room-3',responderJoined:true}
   ];
   let stateReads=0,deleteRequested=false,releaseDelete;
   const deleteGate=new Promise(resolve=>{releaseDelete=resolve});
   await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/api/state'){
     stateReads++;
     return route.fulfill({json:{questions,messages:[],shelf:[],topics:[],achievements:[]}});
    }
    if(req.method()==='DELETE'&&url.pathname==='/api/questions/test-first'){
     deleteRequested=true;
     await deleteGate;
     questions=questions.filter(q=>q.id!=='test-first');
     return route.fulfill({json:{ok:true}});
    }
    throw new Error('Unexpected API: '+req.method()+' '+url.pathname);
   });
   await page.goto(process.env.TONGPIN_TEST_URL||'http://127.0.0.1:51283/index.html');
   const first=page.locator('.board-card[data-question-id="test-first"]');
   const second=page.locator('.board-card[data-question-id="test-second"]');
   const solve=page.locator('#open-solve');
   await first.waitFor();
   assert.equal(await page.locator('.board-card').count(),2,'已匹配问题不出现在首页');
   assert(await solve.isDisabled());
   const before=await first.boundingBox();
   await first.locator('h3').click();
   assert.equal(await first.getAttribute('aria-pressed'),'true');
   assert(await solve.isEnabled());
   assert.equal(await first.evaluate(el=>getComputedStyle(el).borderColor),'rgb(60, 82, 217)');
   assert.equal((await first.boundingBox()).height,before.height,'选择不改变高度');
   await page.screenshot({path:path.join(output,`${width}-选中.png`),fullPage:true});
   await first.locator('h3').click();
   assert.equal(await first.getAttribute('aria-pressed'),'false');
   assert(await solve.isDisabled());
   assert.notEqual(await first.evaluate(el=>getComputedStyle(el).borderColor),'rgb(60, 82, 217)','取消后悬停无蓝框');
   assert.equal((await first.boundingBox()).height,before.height,'取消不改变高度');
   const readsBefore=stateReads;
   await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state');
   await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state');
   assert(stateReads>readsBefore);
   assert.equal(await first.getAttribute('aria-pressed'),'false','轮询不会恢复选择');
   await first.focus();
   await page.keyboard.press('Enter');
   assert.equal(await first.getAttribute('aria-pressed'),'true');
   await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state');
   assert(await first.evaluate(el=>el===document.activeElement),'轮询保留焦点');
   await page.keyboard.press('Space');
   assert.equal(await first.getAttribute('aria-pressed'),'false','键盘可取消选择');
   await first.locator('h3').click();
   await second.locator('h3').click();
   assert.equal(await page.locator('.board-card.selected').count(),1);
   assert.equal(await first.getAttribute('aria-pressed'),'false');
   const trash=first.getByRole('button',{name:'删除问题',exact:true});
   const bounds=await trash.boundingBox(),cardBounds=await first.boundingBox();
   const status=await first.locator('.status-stack > span').boundingBox();
   assert.equal(bounds.width,44);assert.equal(bounds.height,44);
   assert(Math.abs(bounds.x+bounds.width-(cardBounds.x+cardBounds.width-21))<=1,'删除按钮右对齐');
   assert(bounds.y>=status.y+status.height&&bounds.y-(status.y+status.height)<=6,'删除按钮位于状态下方');
   assert(bounds.y<=(await first.locator('h3').boundingBox()).y,'删除按钮在卡片头部');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'页面没有横向溢出');
   await page.screenshot({path:path.join(output,`${width}-右上角方块删除.png`),fullPage:true});
   await trash.click();
   assert(deleteRequested);
   assert.equal(await second.getAttribute('aria-pressed'),'true','点垃圾桶不切换当前选择');
   assert.equal(await first.getAttribute('aria-pressed'),'false');
   releaseDelete();
   await first.waitFor({state:'detached'});
   await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state');
   assert.equal(await first.count(),0,'删除后轮询不恢复');
   await second.locator('h3').click();
   assert(await solve.isDisabled());
   assert.deepEqual(errors,[],'无脚本异常');
   await context.close();
   console.log(`PASS ${width}px: 选中/取消/单选/键盘/轮询/方块位置/删除不误选与不恢复/无溢出/无脚本异常`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
