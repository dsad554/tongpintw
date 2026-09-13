import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFriendsApi} from './好友服务.mjs';
const root=await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
const api={questions:[],messages:[],shelf:[],topics:[],achievements:[],friends:[],friendRequests:[]};
// 网页发布目录外保存状态；显式快照只作为输入，后续更新写到独立状态文件。
const stateFile=path.resolve(process.env.TONGPIN_STATE_FILE||path.join(root,'../数据/本地状态.json'));
if(stateFile===root||stateFile.startsWith(root+path.sep))throw new Error('本地状态文件必须位于网页发布目录之外');
const restoreFile=process.env.TONGPIN_RESTORE_STATE|| (fsSync.existsSync(stateFile)?stateFile:null);
if(restoreFile){
 const restored=JSON.parse(await fs.readFile(restoreFile,'utf8'));
 if(!['questions','messages','shelf'].every(k=>Array.isArray(restored[k])))throw new Error('本地会话快照格式不正确');
 for(const key of Object.keys(api))if(Array.isArray(restored[key]))api[key]=restored[key];
}
function persist(){
 fsSync.mkdirSync(path.dirname(stateFile),{recursive:true});
 const temporary=stateFile+'.'+process.pid+'.tmp';
 fsSync.writeFileSync(temporary,JSON.stringify(api,null,2),'utf8');
 fsSync.renameSync(temporary,stateFile);
}
const friendsApi=createFriendsApi(api,persist);
// 仅放行当前 Codex 备注组件的已核验样式；不允许其他内联样式或脚本。
const annotationStyleHash="'sha256-IoGdj2IlN9XUXqAkcdRQcq4qPMUauAY/xerBUezRHq8='";
const previewCsp=`default-src 'self'; script-src 'self'; style-src 'self' ${annotationStyleHash}; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;
const json=(res,status,payload)=>{if(res.apiMutation&&status<400)persist();res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
const readBody=async req=>{let s='';for await(const c of req)s+=c;try{return JSON.parse(s||'{}')}catch{return {}}};
const publicQuestion=q=>({...q});
// 群聊沿用原房间，把提问者、回应者和社区成员分别记录。
function topicMembers(topic,q){
 topic.participants=Array.isArray(topic.participants)?topic.participants:[];
 for(const [clientId,profileId,name,role] of [[q.creatorClientId,q.creatorProfileId,q.name||'提问者','a'],[q.responderClientId,q.responderProfileId,q.responderName||'回应者','b']]){
  if(role==='b'&&(clientId===q.creatorClientId||(profileId&&profileId===q.creatorProfileId)))continue;
  const existing=topic.participants.find(p=>p.clientId===clientId||(profileId&&p.profileId===profileId));
  if(clientId&&!existing)topic.participants.push({id:clientId,clientId,profileId:profileId||'',name,role,joinedAt:topic.createdAt});
  else if(existing&&profileId&&!existing.profileId)existing.profileId=profileId;
 }
 q.communityRoom=true;q.communityMembers=topic.participants;return topic.participants;
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   res.apiMutation=!['GET','HEAD'].includes(req.method);
   if(req.method==='GET'&&url.pathname==='/api/state'){return json(res,200,api);}
   if(req.method==='GET'&&url.pathname==='/api/friends'){const result=friendsApi.getState(Object.fromEntries(url.searchParams));return json(res,result.status,result.payload);}
   if(req.method==='POST'&&url.pathname==='/api/friends/request'){const result=friendsApi.request(await readBody(req));return json(res,result.status,result.payload);}
   if(req.method==='POST'&&url.pathname==='/api/friends/respond'){const result=friendsApi.respond(await readBody(req));return json(res,result.status,result.payload);}
   if(req.method==='DELETE'&&url.pathname.startsWith('/api/friends/')){const friendId=decodeURIComponent(url.pathname.slice('/api/friends/'.length));const query=Object.fromEntries(url.searchParams);const result=friendsApi.remove(query,friendId);return json(res,result.status,result.payload);}
   if(req.method==='POST'&&url.pathname==='/api/questions'){const b=await readBody(req);if(!String(b.text||'').trim()||!String(b.name||'').trim())return json(res,400,{error:'text_and_name_required'});const q={id:crypto.randomUUID(),roomId:crypto.randomUUID(),category:String(b.category||'其他'),text:String(b.text).trim(),name:String(b.name).trim(),want:String(b.want||'').trim(),creatorClientId:String(b.creatorClientId||''),creatorProfileId:String(b.creatorProfileId||''),createdAt:Date.now(),matched:false};api.questions.unshift(q);return json(res,201,{question:q});}
   if(req.method==='POST'&&url.pathname==='/api/match'){
    const b=await readBody(req),q=api.questions.find(x=>x.id===b.questionId);
    if(!q)return json(res,404,{error:'question_not_found'});
    const responder=String(b.role||'')==='responder'||(b.role!=='asker'&&Boolean(String(b.responderProfileId||'').trim()));
    const responderClientId=String(b.responderClientId||b.participant||''),responderProfileId=String(b.responderProfileId||b.profileId||'');
    if(responder&&(responderClientId===q.creatorClientId||(responderProfileId&&responderProfileId===q.creatorProfileId)))return json(res,409,{error:'cannot_match_self'});
    const alreadyJoined=Boolean((q.responderJoined||q.responderProfileId)&&q.responderClientId!==q.creatorClientId);
    if(responder&&alreadyJoined&&q.responderClientId!==responderClientId&&q.responderProfileId!==responderProfileId)return json(res,409,{error:'already_matched'});
    if(!responder){const profileId=String(b.profileId||b.creatorProfileId||'');if(q.creatorClientId!==String(b.participant||'')&&(!profileId||q.creatorProfileId!==profileId))return json(res,403,{error:'question_creator_required'});if(!q.creatorProfileId&&profileId)q.creatorProfileId=profileId;}
    q.participants=Array.from(new Set([...(q.participants||[]),String(b.participant||'guest')]));
    if(responder){q.matched=true;q.responderJoined=true;q.responderClientId=responderClientId;q.responderProfileId=responderProfileId;if(b.name)q.responderName=String(b.name).trim();if(b.want)q.responderWant=String(b.want).trim();}
    else if(!alreadyJoined){q.matched=false;}
    if(!api.messages.some(m=>m.roomId===q.roomId&&m.from==='system'))api.messages.push({id:crypto.randomUUID(),roomId:q.roomId,from:'system',text:'已进入匹配：可以开始交流。',at:Date.now()});
    return json(res,200,{question:q});
   }
   if(req.method==='POST'&&url.pathname==='/api/messages'){const b=await readBody(req);if(!b.roomId||!String(b.text||'').trim())return json(res,400,{error:'room_and_text_required'});const roomId=String(b.roomId),q=api.questions.find(x=>x.roomId===roomId),senderId=String(b.senderId||b.clientId||'');const topic=api.topics.find(t=>t.roomId===roomId);if(!q)return json(res,404,{error:'question_not_found'});let member;if(topic){member=topicMembers(topic,q).find(p=>p.clientId===senderId);if(!member)return json(res,403,{error:'join_topic_first'});}if(!q)return json(res,404,{error:'question_not_found'});const m={id:crypto.randomUUID(),roomId,from:member?.role||String(b.from||'guest'),senderId:senderId||undefined,clientId:senderId||undefined,senderName:member?.name||String(b.senderName||'').trim()||undefined,text:String(b.text).trim(),at:Date.now()};api.messages.push(m);return json(res,201,{message:m});}
   if(req.method==='POST'&&url.pathname==='/api/topics'){const b=await readBody(req);const roomId=String(b.roomId||'');if(!roomId)return json(res,400,{error:'room_required'});const q=api.questions.find(x=>x.roomId===roomId);if(!q)return json(res,404,{error:'question_not_found'});let topic=api.topics.find(t=>t.roomId===roomId);if(topic){topicMembers(topic,q);return json(res,200,{topic,question:q,existing:true});}const topicText=String(b.text||('话题：'+q.text)).trim();if(!topicText)return json(res,400,{error:'text_required'});topic={id:crypto.randomUUID(),roomId,questionId:q.id,category:String(b.category||q.category||'其他'),text:topicText,from:String(b.from||'guest'),createdAt:Date.now(),participants:[]};api.topics.push(topic);topicMembers(topic,q);api.messages.push({id:crypto.randomUUID(),roomId,from:'system',text:'问题已进入疑问社区，其他人可加入房间。',at:Date.now()});return json(res,201,{topic,question:q});}
   if(req.method==='POST'&&url.pathname==='/api/topics/join'){const b=await readBody(req);const roomId=String(b.roomId||'');let topic=(b.topicId&&api.topics.find(t=>t.id===String(b.topicId)))||api.topics.find(t=>t.roomId===roomId);if(!topic)return json(res,404,{error:'topic_not_found'});const q=api.questions.find(x=>x.roomId===topic.roomId);if(!q)return json(res,404,{error:'question_not_found'});const clientId=String(b.clientId||'');if(!clientId)return json(res,400,{error:'client_id_required'});topicMembers(topic,q);let participant=topic.participants.find(p=>p.clientId===clientId);if(!participant){participant={id:clientId,clientId,role:'c',profileId:String(b.profileId||''),name:String(b.name||('社区成员 '+(topic.participants.filter(p=>p.role==='c').length+1))).trim(),joinedAt:Date.now()};topic.participants.push(participant)}q.communityRoom=true;q.communityMembers=topic.participants;return json(res,200,{topic,question:q,roomId:topic.roomId,participant});}
   if(req.method==='POST'&&url.pathname==='/api/cards'){const b=await readBody(req);if(!b.roomId||!String(b.title||'').trim()||!String(b.summary||'').trim())return json(res,400,{error:'room_title_summary_required'});const existing=api.shelf.find(c=>c.roomId===String(b.roomId));if(existing)return json(res,200,{card:existing,existing:true});const card={id:String(b.id||crypto.randomUUID()),roomId:String(b.roomId),category:String(b.category||''),title:String(b.title).trim(),summary:String(b.summary).trim(),createdAt:Number(b.createdAt)||Date.now()};api.shelf.push(card);return json(res,201,{card});}
   if(req.method==='DELETE'&&url.pathname.startsWith('/api/cards/')){const id=decodeURIComponent(url.pathname.slice('/api/cards/'.length));const before=api.shelf.length;api.shelf=api.shelf.filter(c=>c.id!==id);if(before===api.shelf.length)return json(res,404,{error:'card_not_found'});return json(res,200,{ok:true});}
   if(req.method==='POST'&&url.pathname==='/api/achievements'){const b=await readBody(req);if(!b.roomId||!b.asker||!b.solver)return json(res,400,{error:'room_asker_solver_required'});const existing=api.achievements.find(a=>a.roomId===String(b.roomId));if(existing)return json(res,200,{achievement:existing,existing:true});const achievement={roomId:String(b.roomId),asker:String(b.asker),solver:String(b.solver),completedAt:Number(b.completedAt)||Date.now()};api.achievements.push(achievement);return json(res,201,{achievement});}
   if(req.method==='DELETE'&&url.pathname.startsWith('/api/questions/')){const id=url.pathname.split('/').pop();const q=api.questions.find(x=>x.id===id);if(!q)return json(res,404,{error:'question_not_found'});if((q.participants||[]).length>1)return json(res,409,{error:'already_matched'});api.questions=api.questions.filter(x=>x.id!==id);api.messages=api.messages.filter(m=>m.roomId!==q.roomId);return json(res,200,{ok:true});}
   return json(res,404,{error:'api_not_found'});
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(raw==='/'?'/index.html':raw));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const resolved=await fs.realpath(file);
  if(!resolved.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(resolved);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':previewCsp,'Referrer-Policy':'no-referrer'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch(error){if(req.url.startsWith('/api/')){console.error('Local API failed:',error.message);if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'local_service_error'}));}}else{res.writeHead(404);res.end('Not found');}}
});
const previewPort=Number(process.env.TONGPIN_PORT||51283);
server.listen(previewPort,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>process.exit(0)));
