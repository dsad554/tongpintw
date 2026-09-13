const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
(async()=>{
  if(!process.env.TONGPIN_ANNOTATION_STYLE)throw Error('请指定已核验的备注组件样式文件 TONGPIN_ANNOTATION_STYLE');
  const css=await fs.readFile(process.env.TONGPIN_ANNOTATION_STYLE,'utf8');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tongpin-annotation-'));
  const state={questions:[{id:'kept-q',roomId:'kept-room',text:'测试恢复',matched:true}],messages:[{id:'kept-m',roomId:'kept-room',from:'a',text:'测试消息'}],shelf:[]};
  const statePath=path.join(temp,'会话恢复样本.json');await fs.writeFile(statePath,JSON.stringify(state));
  const child=spawn(process.execPath,[path.join(__dirname,'本地预览.mjs')],{env:{...process.env,TONGPIN_PORT:'0',TONGPIN_RESTORE_STATE:statePath},windowsHide:true});
  let browser;
  try{
    const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('测试服务启动超时')),10000);child.stdout.on('data',b=>{output+=b;const found=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timer);resolve(found[0])}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error('测试服务退出 '+code))})});
    assert.deepEqual(await(await fetch(base+'/api/state')).json(),state,'完整恢复ID和原始会话');
    const response=await fetch(base);const csp=response.headers.get('content-security-policy');
    assert(csp.includes("'sha256-"+createHash('sha256').update(css).digest('base64')+"'"));
    assert(csp.includes("script-src 'self';"));assert(!/unsafe-inline|unsafe-eval/.test(csp));
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto(base);
    const result=await page.evaluate(css=>{
      const host=document.createElement('div');document.documentElement.append(host);const shadow=host.attachShadow({mode:'open'});
      const allowed=document.createElement('style');allowed.textContent=css;shadow.append(allowed);
      const layer=document.createElement('div');layer.className='interaction-layer';shadow.append(layer);
      const blocker=document.createElement('div');blocker.className='interaction-blocker';layer.append(blocker);
      const denied=document.createElement('style');denied.textContent='body{background:rgb(255,0,0)!important}';document.head.append(denied);
      const script=document.createElement('script');script.textContent='document.documentElement.dataset.inlineRan="yes"';document.head.append(script);
      return {sheet:!!allowed.sheet,rules:allowed.sheet?.cssRules.length,background:getComputedStyle(layer).backgroundColor,border:getComputedStyle(layer).borderWidth,blockerPosition:getComputedStyle(blocker).position,blockerHeight:blocker.getBoundingClientRect().height,deniedSheet:!!denied.sheet,inlineRan:document.documentElement.dataset.inlineRan||null};
    },css);
    assert.equal(result.sheet,true);assert(result.rules>0);assert.equal(result.background,'rgba(0, 0, 0, 0)');assert.equal(result.border,'0px');
    assert.equal(result.blockerPosition,'absolute');assert(result.blockerHeight>0);
    assert.equal(result.deniedSheet,false);assert.equal(result.inlineRan,null);
    console.log('PASS 备注准确样式哈希可用、交互层透明且覆盖全页、其他内联样式和脚本仍禁止；会话快照完整恢复。');
  }finally{if(browser)await browser.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
