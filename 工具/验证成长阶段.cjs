const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const output=path.resolve(__dirname,'../../知乎黑客松1/资料/成就阶段点击验收');
const base=process.env.TONGPIN_TEST_URL||'http://127.0.0.1:51283/index.html';
const expected={asker:['提问起步','问题成形','持续提问'],solver:['回应起步','方法补充','持续助人']};
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext();const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // 独立浏览器，仅提供空列表；不操作用户服务、问题或成就数据。
  await page.route('**/api/state',route=>route.fulfill({json:{questions:[],messages:[],shelf:[]}}));
  try{
    await fs.mkdir(output,{recursive:true});await page.goto(base);
    await page.locator('[data-view=shelf]').click();await page.locator('#toggle-achievements').click();
    const ledger=await page.evaluate(()=>localStorage.getItem('tongpin-achievements-v1'));
    for(const width of [320,375,768,1280]){
      await page.setViewportSize({width,height:812});
      for(const kind of ['asker','solver']){
        const badge=page.locator(`[data-achievement-kind="${kind}"]`);
        await badge.focus();await page.waitForTimeout(2500);
        assert.equal(await badge.evaluate(el=>el===document.activeElement),true,'轮询后徽章保持焦点');
        await badge.click();
        for(const stage of [1,2,3,1]){
          const button=page.locator(`[data-preview-stage="${stage}"]`);
          await button.click();
          const img=page.locator('#achievement-preview-image');
          assert.equal(await img.getAttribute('src'),`assets/ip/badge-${kind}-${stage}.png`);
          assert.equal(await page.locator('#achievement-preview-name').innerText(),`${kind==='asker'?'学到了':'解决了'} · ${expected[kind][stage-1]}`);
          assert.equal(await button.getAttribute('aria-pressed'),'true');
          assert.equal(await page.locator('[data-preview-stage][aria-pressed=true]').count(),1);
          await img.evaluate(img=>img.decode());
          assert.equal(await img.evaluate(img=>img.naturalWidth>0&&getComputedStyle(img).objectFit==='contain'),true);
          assert.equal(await button.evaluate(el=>el===document.activeElement&&el.getBoundingClientRect().height>=44),true,'点击后保留焦点且命中面积至少44px');
          assert.equal(await page.evaluate(()=>{const d=document.querySelector('#achievement-preview-dialog');return d.scrollWidth<=d.clientWidth&&document.documentElement.scrollWidth<=innerWidth}),true,`${width}px无横向溢出`);
          if(stage>1)await page.screenshot({path:path.join(output,`${width}-${kind==='asker'?'学到了':'解决了'}-阶段${stage}.png`)});
        }
        await page.keyboard.press('Tab');await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-preview-stage="2"]').getAttribute('aria-pressed'),'true','键盘进入阶段2');
        await page.keyboard.press('Tab');await page.keyboard.press('Space');
        assert.equal(await page.locator('[data-preview-stage="3"]').getAttribute('aria-pressed'),'true','键盘进入阶段3');
        await page.waitForTimeout(2500);
        assert.equal(await page.locator('[data-preview-stage="3"]').evaluate(el=>el===document.activeElement&&el.getAttribute('aria-pressed')==='true'),true,'轮询后阶段3不重置');
        await page.locator('#achievement-preview-close').click();
      }
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('tongpin-achievements-v1')),ledger,'预览不写成就账本');
    await page.reload();await page.locator('[data-view=shelf]').click();await page.locator('#toggle-achievements').click();
    await page.locator('[data-achievement-kind=solver]').click();await page.locator('[data-preview-stage="3"]').click();
    assert.equal(await page.locator('#achievement-preview-image').getAttribute('src'),'assets/ip/badge-solver-3.png');
    assert.deepEqual(errors,[]);
    console.log('PASS 两种成就 × 320/375/768/1280px：真实点击1→2→3→1、准确图片/标题/唯一选中、44px命中、键盘连续切换、轮询焦点稳定、刷新及账本不变，无脚本错误。');
    console.log('截图：'+output);
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
