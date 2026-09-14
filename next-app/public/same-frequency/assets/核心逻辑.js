(function (global) {
'use strict';
const TASK_IDS=['photo-story','reading-question','learning-step'];
const limits={name:24,offer:160,want:160,contribution:1200,reflection:800};
const emptyPerson=()=>({name:'',offer:'',want:'',contribution:'',reflection:''});
function newSession(taskId='photo-story'){
 if(!TASK_IDS.includes(taskId))throw new Error('未知题目');
 const sessionId=global.crypto?.randomUUID?.()??(Date.now().toString(16)+Math.random().toString(16).slice(2));
 return {schemaVersion:1,sessionId,taskId,revision:0,parentRevision:null,updatedAt:new Date().toISOString(),demo:false,participants:{a:emptyPerson(),b:emptyPerson()},result:'',openQuestions:'',claims:{a:false,b:false}};
}
function object(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('卡片结构不正确');
 if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw new Error('卡片字段不符合当前版本');
}
function string(value,max){
 if(typeof value!=='string'||value.length>max)throw new Error('卡片包含超长或无效文字');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('文字中存在不支持的控制字符');
 return value;
}
function validate(input){
 object(input,['schemaVersion','sessionId','taskId','revision','parentRevision','updatedAt','demo','participants','result','openQuestions','claims']);
 if(input.schemaVersion!==1||!TASK_IDS.includes(input.taskId))throw new Error('不支持的卡片版本或题目');
 if(typeof input.sessionId!=='string'||!/^[a-f0-9-]{12,64}$/i.test(input.sessionId))throw new Error('无效的共创编号');
 if(!Number.isInteger(input.revision)||input.revision<0||input.revision>1000000)throw new Error('版本号无效');
 if(input.parentRevision!==(input.revision===0?null:input.revision-1))throw new Error('上一版本号无效');
 if(typeof input.demo!=='boolean'||typeof input.updatedAt!=='string'||input.updatedAt.length>40||!Number.isFinite(Date.parse(input.updatedAt)))throw new Error('卡片元数据无效');
 object(input.participants,['a','b']);object(input.claims,['a','b']);
 const copy={...input,participants:{},claims:{}};
 for(const role of ['a','b']){
  object(input.participants[role],Object.keys(limits));
  copy.participants[role]=Object.fromEntries(Object.entries(limits).map(([key,max])=>[key,string(input.participants[role][key],max)]));
  if(typeof input.claims[role]!=='boolean')throw new Error('确认字段无效');
  copy.claims[role]=input.claims[role];
 }
 copy.result=string(input.result,1600);copy.openQuestions=string(input.openQuestions,800);
 return copy;
}
function parse(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>32768)throw new Error('卡片最大为 32 KB');
 let value;try{value=JSON.parse(text);}catch{throw new Error('不是有效的 JSON 交换卡');}
 return validate(value);
}
function hasContent(s){
 return ['a','b'].some(r=>Object.values(s.participants[r]).some(v=>v.trim()))||!!s.result.trim()||!!s.openQuestions.trim();
}
function complete(s){
 return ['a','b'].every(r=>Object.values(s.participants[r]).every(v=>v.trim())&&s.claims[r])&&!!s.result.trim();
}
function nextExport(s){
 const c=validate(s);c.parentRevision=c.revision;c.revision++;c.updatedAt=new Date().toISOString();return validate(c);
}
function importDecision(current,incoming,dirty){
 validate(current);validate(incoming);
 if(current.sessionId!==incoming.sessionId)return {ok:true,replace:true,message:'这是另一份共创卡。导入将替换当前浏览器草稿，请先保存需要保留的内容。'};
 if(incoming.taskId!==current.taskId||incoming.demo!==current.demo)return {ok:false,message:'同一共创编号的题目或示例标记发生变化，拒绝导入。'};
 if(incoming.revision<=current.revision)return {ok:false,message:'这是重复或较旧版本，当前草稿未被覆盖。'};
 if(dirty)return {ok:false,message:'当前有尚未导出的修改。请先保存自己的卡片，再人工比较两份贡献；不会自动覆盖。'};
 if(incoming.parentRevision!==current.revision)return {ok:false,message:'版本不连续，可能存在并行修改。请与对方核对上一版，当前草稿未被覆盖。'};
 return {ok:true,replace:false,message:'这是当前共创的下一版本。确认后导入，昵称和确认仍仅为参与者自述。'};
}
function textCard(s,title){
 const lines=['同频提问局 · 新理解卡',s.demo?'【虚构人物／流程示例，非真实合作记录】':'【参与者自述，未经身份或共识验证】','共同问题：'+title,'版本：r'+s.revision,''];
 for(const role of ['a','b']){
 const p=s.participants[role];lines.push(role.toUpperCase()+' · '+(p.name||'未填写昵称'),'我能贡献：'+p.offer,'我想学习：'+p.want,'具体贡献：'+p.contribution,'复述与补充：'+p.reflection,'自述确认：'+(s.claims[role]?'是':'尚未确认'),'');
 }
 lines.push('共同成果：',s.result||'尚未填写','','待解决的问题：',s.openQuestions||'尚未填写','','题目为自创练习，非知乎检索结果。文件是明文，可被修改与转发。');
 return lines.join('\n');
}
const api={TASK_IDS,limits,newSession,validate,parse,hasContent,complete,nextExport,importDecision,textCard};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
global.COCore=api;
})(globalThis);
