import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// 独立端口和临时数据目录，不连接正在使用的预览服务。
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'tongpin-friends-test-'));
const stateFile=path.join(folder,'本地状态.json');
const serverFile=path.join(path.dirname(fileURLToPath(import.meta.url)),'本地预览.mjs');
let child,base,log='';
async function start(){
  child=spawn(process.execPath,[serverFile],{env:{...process.env,TONGPIN_PORT:'0',TONGPIN_RESTORE_STATE:'',TONGPIN_STATE_FILE:stateFile},stdio:['ignore','pipe','pipe'],windowsHide:true});
  base=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('服务启动超时')),10000);
    child.on('error',reject);child.on('exit',code=>{if(code)reject(new Error('服务退出 '+code+' '+log))});
    child.stderr.on('data',b=>{log+=b.toString()});
    child.stdout.on('data',b=>{const match=b.toString().match(/Local: (http:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1])}});
  });
}
async function stop(){if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
async function api(url,body,status=200,method=body?'POST':'GET'){
  const result=await fetch(base+url,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const payload=await result.json();assert.equal(result.status,status,JSON.stringify(payload));return payload;
}
const a={profileId:'test-profile-a',clientId:'test-client-a'},b={profileId:'test-profile-b',clientId:'test-client-b'},c={profileId:'test-profile-c',clientId:'test-client-c'},outsider={profileId:'outsider',clientId:'outsider'};
const state=(who,roomId)=>api('/api/friends?'+new URLSearchParams({...who,roomId}));
try{
  await start();
  let {question:q}=await api('/api/questions',{text:'好友后端回归',name:'提问小甲',creatorClientId:a.clientId,creatorProfileId:a.profileId},201);
  await api('/api/match',{questionId:q.id,role:'asker',participant:a.clientId,profileId:a.profileId});
  await api('/api/match',{questionId:q.id,role:'responder',participant:a.clientId,responderProfileId:a.profileId},409);
  await api('/api/match',{questionId:q.id,role:'responder',participant:b.clientId,responderProfileId:b.profileId,name:'解决小乙'});
  assert.deepEqual((await state(a,q.roomId)).peers.map(p=>[p.name,p.type]),[['解决小乙','解决者']]);
  await api('/api/friends/request',{...a,roomId:q.roomId,targetProfileId:a.profileId},400);
  await api('/api/friends/request',{...outsider,roomId:q.roomId,targetProfileId:a.profileId},403);
  const {request:r}=await api('/api/friends/request',{...a,roomId:q.roomId,targetProfileId:b.profileId,type:'伪造类型',name:'伪造姓名'},201);
  assert.equal((await state(a,q.roomId)).friends.length,0);
  assert.equal((await state(a,q.roomId)).outgoing.length,1);
  assert.equal((await state(b,q.roomId)).incoming[0].name,'提问小甲');
  await api('/api/friends/request',{...a,roomId:q.roomId,targetProfileId:b.profileId},409);
  await api('/api/friends/request',{...b,roomId:q.roomId,targetProfileId:a.profileId},409);
  await api('/api/friends/respond',{...a,requestId:r.id,accept:true},403);
  await api('/api/friends/respond',{...b,requestId:r.id,accept:true});
  await api('/api/friends/respond',{...b,requestId:r.id,accept:true},409);
  assert.deepEqual((await state(a,q.roomId)).friends.map(f=>[f.name,f.type]),[['解决小乙','解决者']]);
  assert.deepEqual((await state(b,q.roomId)).friends.map(f=>[f.name,f.type]),[['提问小甲','提问者']]);
  await api('/api/friends/request',{...a,roomId:q.roomId,targetProfileId:b.profileId},409);
  const {topic}=await api('/api/topics',{roomId:q.roomId},201);
  await api('/api/topics/join',{...c,topicId:topic.id,name:'社群小丙'});
  assert.equal((await state(a,q.roomId)).peers.find(p=>p.profileId===c.profileId).type,'社群好友');
  const {request:r2}=await api('/api/friends/request',{...c,roomId:q.roomId,targetProfileId:a.profileId},201);
  await api('/api/friends/respond',{...a,requestId:r2.id,accept:true});
  assert.equal((await state(a,q.roomId)).friends.find(f=>f.profileId===c.profileId).type,'社群好友');
  assert.equal((await state(c,q.roomId)).friends.find(f=>f.profileId===a.profileId).type,'提问者');
  const {request:declined}=await api('/api/friends/request',{...b,roomId:q.roomId,targetProfileId:c.profileId},201);
  await api('/api/friends/respond',{...c,requestId:declined.id,accept:false});
  assert.equal((await state(b,q.roomId)).friends.length,1);
  assert.equal((await state(c,q.roomId)).incoming.length,0);
  const before=await api('/api/state');
  assert.equal(before.friendRequests.length,3);assert.equal(before.friends.length,4);
  const disk=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.deepEqual(disk,before);
  await stop();await start();assert.deepEqual(await api('/api/state'),before);
  assert.equal((await state(a,q.roomId)).friends.length,2);
  assert.equal(log,'');
  console.log('通过：提问/回应身份、自加与房间校验、待接受、重复请求、拒绝、双向角色分类、第三人社群分类、所有数组落盘与服务重启恢复。');
}finally{
  await stop();
  const target=path.resolve(folder),temporaryRoot=path.resolve(os.tmpdir());
  if(!target.startsWith(temporaryRoot+path.sep)||!path.basename(target).startsWith('tongpin-friends-test-'))throw new Error('拒绝清理临时目录范围之外的路径');
  await fs.rm(target,{recursive:true,force:true});
}
