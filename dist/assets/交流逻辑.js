(()=>{
'use strict';
const $=id=>document.getElementById(id),STORE='tongpin-community-v2',CATEGORY_STORE='tongpin-card-categories-v1',ACHIEVEMENT_STORE='tongpin-achievements-v1',CHANNEL='tongpin-room-v2';
const roleParam=new URL(location.href).searchParams.get('role');
let sessionRole=roleParam==='b'?'b':(sessionStorage.getItem('tongpin-role')||'a');
let communityMode=false;
try{sessionStorage.setItem('tongpin-role',sessionRole)}catch{}
const CLIENT_ID=sessionStorage.getItem('tongpin-client-id')||uid();try{sessionStorage.setItem('tongpin-client-id',CLIENT_ID)}catch{}
let selectedQuestionId=null,topicBusy=false,messageBusy=false;
const ROOM_SESSION='tongpin-active-room';
function roomRole(q){if(q?.creatorClientId===CLIENT_ID)return 'a';if(q?.responderClientId===CLIENT_ID)return 'b';return q?.communityRoom?'c':sessionRole}
function useQuestion(q){data.questions=[...data.questions.filter(x=>x.id!==q.id),q];data.activeId=q.id;sessionStorage.setItem(ROOM_SESSION,q.id)}
function topicFor(q){return (data.topics||[]).find(t=>t.roomId===q?.roomId)}
async function requestJSON(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
let data={questions:[],shelf:[],topics:[],activeId:null,messages:[],ended:false,finishStage:0,summaries:{a:'',b:''},finishRequested:{a:false,b:false},keyLines:[],cardSaved:false,achievementApplied:[]};
let achievementStats={};
function roleProfile(){try{const k='tongpin-profile-v1';const id=localStorage.getItem(k)||uid();localStorage.setItem(k,id);return id}catch{return CLIENT_ID}}
let PROFILE_ID=roleProfile(sessionRole);
let categories=[];
// 首页固定的六个问题板块；用于总结卡片分类下拉，也不会计入用户自定义分类数量。
const HOME_CATEGORIES=['学习','求职','职场适应','技能提升','生活规划','兴趣社交'];
const BOARD_EXAMPLES=[
  {id:'example-board-learning',category:'学习',text:'怎样把读后感变成值得聊的问题？',name:'示例参与者',want:'把想法整理成可执行的小步骤',demo:true},
  {id:'example-board-career',category:'求职',text:'第一次请教职场前辈时，怎样问得更具体？',name:'示例参与者',want:'获得一条可尝试的建议',demo:true}
];
let channel=null;
try{channel=new BroadcastChannel(CHANNEL);channel.onmessage=()=>syncShared()}catch{}
window.addEventListener('storage',e=>{if(e.key===STORE)syncShared()});
function uid(){return (crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2))}
function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#92;'}[c]))}
function notice(t){const n=$('notice');n.textContent=t;n.hidden=false;setTimeout(()=>n.hidden=true,4200)}
function save(){try{if(data.activeId)sessionStorage.setItem(ROOM_SESSION,data.activeId);localStorage.setItem(STORE,JSON.stringify(data));channel?.postMessage({changedAt:Date.now()})}catch{notice('本地保存不可用，请及时复制成果内容。')}}
async function syncServer(){try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)return;const s=await r.json();if(Array.isArray(s.questions)){const remote=s.questions.filter(q=>q&&!q.demo&&q.id!=='demo');data.questions=remote.map(q=>({...data.questions.find(x=>x.id===q.id),...q}));data.messages=s.messages||[];data.topics=Array.isArray(s.topics)?s.topics:[];if(Array.isArray(s.shelf)){/* 服务器列表是删除后的权威结果，直接替换可同步卡片删除。 */data.shelf=s.shelf.filter(c=>c&&typeof c.id==='string'&&typeof c.title==='string'&&typeof c.summary==='string')}if(Array.isArray(s.achievements))mergeAchievementRecords(s.achievements);const qp=sessionStorage.getItem(ROOM_SESSION)||new URL(location.href).searchParams.get('question');if(!data.activeId&&qp&&data.questions.some(q=>q.id===qp))data.activeId=qp;/* 服务器同步补上 activeId 后，双方完成提交（总结可为空）时自动落卡。 */if(Number(data.finishStage)===1&&data.finishRequested?.a&&data.finishRequested?.b)finalizeIfReady();renderBoard();renderCommunity();renderShelf();if(data.activeId)renderChat()}}catch{}}
function read(){try{const x=JSON.parse(localStorage.getItem(STORE)||'null');if(x&&Array.isArray(x.questions)){data={...data,questions:x.questions.filter(q=>!q.demo&&q.id!=='demo'),shelf:Array.isArray(x.shelf)?x.shelf.filter(c=>c&&typeof c.id==='string'&&typeof c.title==='string'&&typeof c.summary==='string'):data.shelf,topics:Array.isArray(x.topics)?x.topics:data.topics,messages:Array.isArray(x.messages)?x.messages:data.messages,activeId:typeof x.activeId==='string'?x.activeId:data.activeId,ended:!!x.ended,finishStage:Number(x.finishStage)||0,summaries:{a:'',b:'',...(x.summaries||{})},finishRequested:{a:false,b:false,...(x.finishRequested||{})},keyLines:Array.isArray(x.keyLines)?x.keyLines:[],cardSaved:!!x.cardSaved}}}catch{}}
function readAchievements(){try{const x=JSON.parse(localStorage.getItem(ACHIEVEMENT_STORE)||'{}');achievementStats=x&&typeof x==='object'?x:{}}catch{achievementStats={}}}
function saveAchievements(){try{localStorage.setItem(ACHIEVEMENT_STORE,JSON.stringify(achievementStats))}catch{}}
let achievementUnlockQueue=[],achievementProgress={asker:0,solver:0},achievementServerReady=false;
const ACHIEVEMENT_MILESTONES=[1,3,10],ACHIEVEMENT_NOTICES='tongpin-achievement-notices-v1';
const ACHIEVEMENT_STAGES={asker:[['成就/提问者-初级.webp','初级'],['成就/提问者-中级.webp','中级'],['成就/提问者-高级.webp','高级']],solver:[['成就/回答者-初级.webp','初级'],['成就/回答者-中级.webp','中级'],['成就/回答者-高级.webp','高级']]};
function achievementStage(kind,count){return count>=10?3:count>=3?2:count>=1?1:0}
function achievementAsset(kind,count){const stage=achievementStage(kind,count)||1;return ACHIEVEMENT_STAGES[kind][stage-1]}
function achievementCount(kind){return Object.values(achievementStats).filter(v=>v&&v[kind]===PROFILE_ID).length}
function showAchievementUnlock(unlocks){
  if(!Array.isArray(unlocks))return;
  achievementUnlockQueue.push(...unlocks.filter(u=>u&&ACHIEVEMENT_STAGES[u.kind]?.[u.stage-1]));
  displayNextAchievementUnlock();
}
function displayNextAchievementUnlock(){
  const dialog=$('achievement-unlock-dialog'),body=$('achievement-unlock-body');
  if(!dialog||!body||!achievementUnlockQueue.length||document.querySelector('dialog[open]'))return;
  const unlock=achievementUnlockQueue.shift(),name=unlock.kind==='asker'?'学到了':'解决了',asset=ACHIEVEMENT_STAGES[unlock.kind][unlock.stage-1];
  body.innerHTML=`<p class="achievement-unlock-kicker">成就达成</p><h2 id="achievement-unlock-title">${name} · ${asset[1]}</h2><button type="button" class="achievement-image-button achievement-unlock-image" aria-label="预览${name} · ${asset[1]}"><img src="assets/ip/${asset[0]}" alt="刘看山，${name}，${asset[1]}成就" width="260" height="260"></button><p>${unlock.kind==='asker'?'你提出的问题已解决':'你已帮助他人解决问题'} ${unlock.count} 次</p><p class="muted">点击空白处关闭</p>`;
  body.querySelector('.achievement-unlock-image').onclick=()=>{dialog.close();openAchievementPreview(unlock.kind,unlock.stage)};
  dialog.showModal();
}
// 进度与弹窗分开：按当前用户识别新跨过的阶段，历史载入只恢复徽章。
function observeAchievementProgress(notify=true){
  const key=ACHIEVEMENT_NOTICES+':'+PROFILE_ID;let seen={};
  try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(saved&&typeof saved==='object')seen=saved}catch{}
  const unlocks=[];
  for(const kind of ['asker','solver']){
    const count=achievementCount(kind),previous=achievementProgress[kind];
    ACHIEVEMENT_MILESTONES.forEach((threshold,i)=>{
      if(count<threshold)return;
      const id=kind+':'+(i+1);
      if(notify&&previous<threshold&&!seen[id])unlocks.push({kind,stage:i+1,count:threshold});
      seen[id]=true;
    });
    achievementProgress[kind]=count;
  }
  try{localStorage.setItem(key,JSON.stringify(seen))}catch{}
  if(unlocks.length)showAchievementUnlock(unlocks);
}
function mergeAchievementRecords(records){
  readAchievements();
  for(const a of records){if(a&&typeof a.roomId==='string'&&a.roomId&&typeof a.asker==='string'&&a.asker&&typeof a.solver==='string'&&a.solver)achievementStats[a.roomId]={...achievementStats[a.roomId],...a}}
  saveAchievements();observeAchievementProgress(achievementServerReady);achievementServerReady=true;
}
function renderAchievementPreview(kind,stage){
const body=$('achievement-preview-body');if(!body||!ACHIEVEMENT_STAGES[kind])return;
  const safeStage=Math.min(3,Math.max(1,Number(stage)||1)),asset=ACHIEVEMENT_STAGES[kind][safeStage-1],name=kind==='asker'?'学到了':'解决了';
  body.dataset.kind=kind;
  $('achievement-preview-art').className=`achievement-preview-art stage-${safeStage}`;
  const img=$('achievement-preview-image');img.src=`assets/ip/${asset[0]}`;img.alt=`刘看山，${name}，${asset[1]}阶段`;
  $('achievement-preview-name').textContent=`${name} · ${asset[1]}`;
  $('achievement-preview-progress').textContent=`当前完成 ${achievementCount(kind)} 次。累计 1、3、10 次成长。`;
  body.querySelectorAll('[data-preview-stage]').forEach(button=>{const selected=Number(button.dataset.previewStage)===safeStage;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
}
function openAchievementPreview(kind,stage){const dialog=$('achievement-preview-dialog');if(!dialog)return;dialog.classList.remove('is-enlarged');const art=$('achievement-preview-art');if(art){art.setAttribute('aria-expanded','false');art.setAttribute('aria-label','放大成就图片')}renderAchievementPreview(kind,stage||achievementStage(kind,achievementCount(kind))||1);if(!dialog.open)dialog.showModal()}
function awardAchievements(q){
  if(!q||!q.roomId||!q.creatorProfileId||!q.responderProfileId)return [];
  readAchievements();
  if(achievementStats[q.roomId]){observeAchievementProgress();return []}
  achievementStats[q.roomId]={asker:q.creatorProfileId,solver:q.responderProfileId,completedAt:Date.now()};
  saveAchievements();
  const kinds=[];if(q.creatorProfileId===PROFILE_ID)kinds.push('asker');if(q.responderProfileId===PROFILE_ID)kinds.push('solver');observeAchievementProgress();channel?.postMessage({achievementsChanged:true});return kinds;
}
function renderAchievements(){
  const box=$('achievement-list');if(!box)return;
  readAchievements();
  const records=Object.values(achievementStats).filter(v=>v&&typeof v==='object');
  const badge=(kind,name,desc)=>{const count=records.filter(v=>v[kind]===PROFILE_ID).length;const level=achievementStage(kind,count);const next=level===0?1:level===1?3:level===2?10:null;const asset=achievementAsset(kind,count);
    return `<article class="achievement-badge level-${level}" tabindex="0" role="button" data-achievement-kind="${kind}" aria-label="放大查看${name}"><div class="badge-art"><img src="assets/ip/${asset[0]}" alt="刘看山，${name}，${asset[1]}阶段" width="96" height="104"></div><div class="badge-copy"><h3>${name} <span>${level?`Lv.${level}`:'待点亮'}</span></h3><p>${desc} · ${asset[1]}</p><progress class="badge-progress" aria-label="${name}成长进度" max="${next||10}" value="${Math.min(count,next||10)}"></progress><small>${count} 次${next?` · 距下一级 ${next-count} 次`:' · 已达最高等级'}</small></div></article>`};
  const markup=badge('asker','学到了','我提出的问题得到解决')+badge('solver','解决了','我帮助他人解决问题');
  if(box.innerHTML===markup)return;
  box.innerHTML=markup;
  box.querySelectorAll('[data-achievement-kind]').forEach(el=>{el.onclick=()=>openAchievementPreview(el.dataset.achievementKind);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAchievementPreview(el.dataset.achievementKind)}}});
}
function readCategories(){try{const x=JSON.parse(localStorage.getItem(CATEGORY_STORE)||'[]');categories=Array.isArray(x)?[...new Set(x.map(v=>String(v).trim()).filter(Boolean))].slice(0,30):[]}catch{categories=[]}}
function saveCategories(){try{localStorage.setItem(CATEGORY_STORE,JSON.stringify(categories))}catch{notice('分类无法保存，请检查浏览器本地存储。')}}
function renderCategoryControls(){
  const card=$('card-category'),selected=card.value;
  if(card){
    const all=[...new Set([...HOME_CATEGORIES,...categories])];
    card.innerHTML='<option value="">不分类</option>'+all.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    card.value=categories.includes(selected)?selected:'';
  }
  const manager=$('manage-categories');
  if(manager)manager.hidden=categories.length<2;
}
function renderCategoryManager(){const box=$('category-list');box.replaceChildren();if(!categories.length){box.innerHTML='<p class="muted">还没有分类，请先新增一个。</p>';return}categories.forEach(c=>{const row=document.createElement('div');row.className='category-row';row.innerHTML=`<span>${esc(c)}</span><button type="button" class="text-button" data-remove-category="${esc(c)}">删除</button>`;box.append(row)});box.querySelectorAll('[data-remove-category]').forEach(b=>b.onclick=()=>{const c=b.dataset.removeCategory;categories=categories.filter(x=>x!==c);data.shelf.forEach(card=>{if(card.category===c)card.category=''});saveCategories();save();renderCategoryControls();renderCategoryManager();renderShelf()})}
function syncShared(){const before=data.activeId;const flow=Object.fromEntries(['ended','finishStage','summaries','finishRequested','keyLines','cardSaved'].map(k=>[k,data[k]]));read();if(data.activeId!==before)Object.assign(data,flow);data.activeId=before;readAchievements();observeAchievementProgress();/* 双方都已提交总结（可为空）但旧版本未落卡时，收到同步即可自动补齐成果卡。 */if(Number(data.finishStage)===1&&data.finishRequested?.a&&data.finishRequested?.b)finalizeIfReady();renderBoard();renderShelf();renderAchievements();if(data.activeId&&data.activeId===before)renderChat();else if(data.activeId)renderChat()}
function active(){return data.questions.find(q=>q.id===data.activeId)||null}
function renderCommunity(){
 const box=$('topic-list');if(!box)return;
 const ordered=(data.topics||[]).slice().reverse();
 const markup=ordered.length?ordered.map(t=>`<article class="topic-card" data-topic-id="${esc(t.id)}" data-room-id="${esc(t.roomId)}"><div class="topic-meta"><span class="topic-category">${esc(t.category||'疑问社区')}</span><span class="muted">${(t.participants||[]).length} 人参与</span></div><h3>${esc(t.text)}</h3><div class="topic-actions"><button class="button primary topic-enter" type="button" data-topic-id="${esc(t.id)}">加入房间</button></div></article>`).join(''):'<p class="muted">暂时没有公开话题。</p>';
 if(box.dataset.markup===markup)return;box.dataset.markup=markup;box.innerHTML=markup;
 box.querySelectorAll('.topic-enter').forEach(button=>{button.onclick=async()=>{const topic=ordered.find(t=>t.id===button.dataset.topicId);button.disabled=true;try{await enterCommunityTopic(topic)}finally{button.disabled=false}}});
}
async function enterCommunityTopic(topic){
 if(!topic?.roomId){notice('该话题缺少对应房间，暂时无法进入。');return}
 try{
  const body=await requestJSON('/api/topics/join',{topicId:topic.id,roomId:topic.roomId,clientId:CLIENT_ID,profileId:PROFILE_ID});
  if(!body.question||!body.topic)throw new Error('missing room');
  useQuestion(body.question);data.topics=[...data.topics.filter(t=>t.roomId!==topic.roomId),body.topic];
  // 加入群聊不改原房间的总结和确认进度，也不冒充回应者。
  save();await syncServer();renderChat();nav('chat');notice('已加入疑问社区房间，可以开始群聊。');
 }catch{notice('加入房间失败，请检查本地服务后重试。')}
}
function nav(view){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}
function renderBoard(){
  const box=$('board-list'),focused=document.activeElement,focusedCard=focused?.closest('.board-card');
  const focusId=box.contains(focusedCard)?focusedCard.dataset.questionId:null;
  const focusControl=focused?.classList.contains('delete-icon')?'.delete-icon':focused?.classList.contains('match-btn')?'.match-btn':null;
  box.replaceChildren();
  /* 仅在回应者真正加入后隐藏问题块。发起者发布问题时服务端也会将
     matched 标记为 true，但此时仍没有回应者，问题应继续可见。 */
  const qs=data.questions.filter(q=>!q.responderJoined&&!q.responderProfileId&&!(Array.isArray(q.participants)&&q.participants.length>1));
  if(selectedQuestionId&&!qs.some(q=>q.id===selectedQuestionId))selectedQuestionId=null;
  // “解决问题”必须先选中问题块；每次重绘都同步按钮禁用状态，避免状态滞后。
  const solveButton=$('open-solve');
  if(solveButton){solveButton.disabled=!selectedQuestionId;solveButton.setAttribute('aria-disabled',String(!selectedQuestionId));}
  if(!qs.length){const tip=document.createElement('div');tip.className='board-empty';tip.innerHTML='<p>先点击“提出问题”，写下你想解决的事。</p><p>点击一个问题块选中，再点击“解决问题”填写昵称和想解决的问题后加入交流。</p><p class="muted">下面是流程示例，点击后会打开“提出问题”填写页，不会直接创建真实问题。</p>';box.append(tip)}
  const items=qs.length?qs:BOARD_EXAMPLES;
  items.forEach(q=>{const isDemo=Boolean(q.demo);const el=document.createElement('article');el.className='board-card'+(selectedQuestionId===q.id?' selected':'');el.dataset.questionId=q.id;el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-pressed',String(selectedQuestionId===q.id));el.innerHTML=`<div class="meta"><span>${esc(q.category)}</span><div class="status-stack"><span>${isDemo?'示例问题':'等待回应者'}</span>${!isDemo?`<button type="button" class="delete-icon" title="删除问题" aria-label="删除问题" data-id="${esc(q.id)}">🗑</button>`:''}</div></div><h3>${esc(q.text)}</h3><p>${esc(q.name)} · 想学：${esc(q.want||'未填写')}</p><div class="card-actions"><button class="button primary match-btn" data-id="${esc(q.id)}">加入匹配并交流</button></div>`;box.append(el)});
  const choose=q=>{if(!q)return;if(q.demo){$('q-category').value=q.category;$('q-text').value=q.text;$('q-name').value='';$('q-want').value=q.want||'';$('open-create').click();return}selectedQuestionId=selectedQuestionId===q.id?null:q.id;renderBoard();notice(selectedQuestionId?'已选中问题块，再点击“解决问题”即可加入交流。':'已取消选择问题。')};
  box.querySelectorAll('.board-card').forEach(card=>{const b=card.querySelector('.match-btn'),q=items.find(x=>x.id===b?.dataset.id);card.onclick=e=>{if(e.target.closest('button'))return;choose(q)};card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();choose(q)}}});
  // 卡片内“加入匹配并交流”保留原有直达流程；匿名解决入口使用上方“解决问题”按钮。
  box.querySelectorAll('.match-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();const q=items.find(x=>x.id===b.dataset.id);if(!q)return;if(q.demo){choose(q);return}if(q.creatorProfileId===PROFILE_ID)match(q.id);else openJoin(q)});
  box.querySelectorAll('.delete-icon').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteQuestion(b.dataset.id)});
  if(focusId){const card=Array.from(box.children).find(el=>el.dataset.questionId===focusId);(focusControl?card?.querySelector(focusControl):card)?.focus({preventScroll:true})}
}
function enterAnonymousSolve(){const q=data.questions.find(x=>x.id===selectedQuestionId);if(!q){notice('请先点击选择一个问题块');return}if(q.creatorProfileId===PROFILE_ID||q.creatorClientId===CLIENT_ID){match(q.id);return}openJoin(q)}

async function match(id){
 const original=data.questions.find(x=>x.id===id);if(!original){notice('这个问题已不存在');return false}
 const isAsker=original.creatorProfileId===PROFILE_ID||original.creatorClientId===CLIENT_ID;
 const role=isAsker?'asker':'responder';
 let q;
 try{const r=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId:id,role,profileId:PROFILE_ID,participant:CLIENT_ID,creatorProfileId:isAsker?PROFILE_ID:undefined,responderClientId:isAsker?undefined:CLIENT_ID,responderProfileId:isAsker?undefined:PROFILE_ID,name:isAsker?undefined:original.responderName,want:isAsker?undefined:original.responderWant})});if(!r.ok)throw new Error('match failed');q=(await r.json()).question}catch{notice('未能进入房间，请检查服务或刷新问题列表后重试。');return false}
 data.questions=data.questions.map(x=>x.id===q.id?q:x);sessionRole=isAsker?'a':'b';sessionStorage.setItem('tongpin-role',sessionRole);communityMode=false;
 const changedRoom=data.activeId!==q.id;data.activeId=q.id;if(changedRoom){data.ended=false;data.finishStage=0;data.cardSaved=false;data.summaries={a:'',b:''};data.finishRequested={a:false,b:false}}
 save();renderBoard();renderChat();nav('chat');window.TongpinFriends?.refresh();notice('已进入交流房间。');return true
}
async function deleteQuestion(id){const q=data.questions.find(x=>x.id===id);if(!q||((data.messages||[]).some(m=>m.roomId===q.roomId&&m.from!=='system'&&m.from!==sessionRole)))return;try{const r=await fetch('/api/questions/'+encodeURIComponent(id),{method:'DELETE'});if(!r.ok&&r.status!==404){notice('问题已有回应，无法删除');return}}catch{}data.questions=data.questions.filter(x=>x.id!==id);if(data.activeId===id)data.activeId=null;save();renderBoard();notice('问题已删除。')}
function openJoin(q){$('join-question').textContent=q.text;$('join-name').value='';$('join-want').value='';$('join-dialog').dataset.questionId=q.id;$('join-dialog').showModal()}
$('join-close').onclick=()=>$('join-dialog').close();
$('join-form').addEventListener('submit',async e=>{e.preventDefault();const q=data.questions.find(x=>x.id===$('join-dialog').dataset.questionId);if(!q)return;const name=$('join-name').value.trim(),want=$('join-want').value.trim();if(!name||!want){notice('请填写昵称和想解决的问题');return}q.responderName=name;q.responderWant=want;const button=e.submitter;if(button)button.disabled=true;try{if(await match(q.id)){$('join-dialog').close();selectedQuestionId=null}}finally{if(button)button.disabled=false}});
function renderChat(){
 const q=active();if(!q){$('room-title').textContent='尚未进入房间';$('room-meta').textContent='';$('chat-messages').replaceChildren();$('chat-input').disabled=true;$('chat-form').querySelector('button').disabled=true;$('end-chat').disabled=true;$('extend-topic').disabled=true;return}
 const topic=topicFor(q),communityRoom=Boolean(q.communityRoom||topic),role=roomRole(q),member=(topic?.participants||q.communityMembers||[]).find(m=>m.clientId===CLIENT_ID);
 $('room-title').textContent=q.text;$('room-meta').textContent=`${q.category||'问题'} · ${communityRoom?'疑问社区群聊 · '+(topic?.participants||q.communityMembers||[]).length+' 人':(role==='a'?'发起者':'回应者')}`;
 const box=$('chat-messages'),messages=(data.messages||[]).filter(m=>m.roomId===q.roomId);
 const markup=messages.map(m=>{const mine=m.senderId?m.senderId===CLIENT_ID:m.clientId?m.clientId===CLIENT_ID:m.from===role&&role!=='c';const label=m.from==='ai'?'AI 回复（知乎相近回答）':m.from==='system'?'系统':mine?'我':(m.senderName||({a:q.name||'提问者',b:q.responderName||'回应者'}[m.from]||'社区成员'));return `<div class="message ${mine?'mine':m.from==='ai'?'ai':m.from==='system'?'system':''}"><span class="label">${esc(label)}</span>${esc(m.text)}${m.source?`<small class="source">来源：${esc(m.source)}</small>`:''}</div>`}).join('');
 if(box.dataset.markup!==markup||box.dataset.room!==q.roomId){const bottom=box.scrollHeight-box.scrollTop-box.clientHeight<70,newRoom=box.dataset.room!==q.roomId;box.innerHTML=markup;box.dataset.markup=markup;box.dataset.room=q.roomId;if(bottom||newRoom)box.scrollTop=box.scrollHeight;}
 const stage=Number(data.finishStage)||0,hasChat=messages.some(m=>m.from!=='system'&&m.from!=='ai'),ownSummary=Boolean(data.summaries?.[sessionRole]?.trim()),bothSummaries=Boolean(data.summaries?.a?.trim()&&data.summaries?.b?.trim());
 const canChat=communityRoom?Boolean(member):stage===0&&!data.ended;$('chat-input').disabled=!canChat;$('chat-form').querySelector('button').disabled=!canChat||messageBusy;
 const endButton=$('end-chat');if(endButton){if(communityRoom&&role==='c'){endButton.disabled=true;endButton.textContent='结束并整理'}else if(stage===0){endButton.textContent='结束并整理';endButton.disabled=!hasChat}else if(stage===1&&!ownSummary){endButton.textContent='结束并整理（示例）';endButton.disabled=false}else if(stage===1&&!bothSummaries){endButton.textContent=ownSummary?'修改我的总结':'结束并整理（示例）';endButton.disabled=false}else if(stage===1&&!data.finishRequested?.[sessionRole]){endButton.textContent='确认结束并保存卡片（示例）';endButton.disabled=false}else{endButton.textContent='等待对方确认';endButton.disabled=true}}
 $('extend-topic').disabled=topicBusy||(!communityRoom&&role==='c');$('extend-topic').textContent=topicBusy?'正在发布…':communityRoom?'查看社区话题':'扩展为话题';
}
async function maybeAI(text,q){const endpoint=window.TONGPIN_AI_REPLY_ENDPOINT;if(!endpoint)return;try{const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q.text,message:text,roomId:q.roomId})});if(!res.ok)return;const body=await res.json();if(body&&body.found===true&&typeof body.reply==='string'&&body.reply.trim()){data.messages.push({id:uid(),from:'ai',text:body.reply.trim(),source:body.source||'知乎公开相近回答',roomId:q.roomId,at:Date.now()});save();renderChat()}}catch{}}
function renderShelf(){
  renderAchievements();
  const box=$('shelf-list');
  $('shelf-count').textContent=data.shelf.length;
  const examples=[
    {id:'example-card',title:'怎样把一个问题聊成可执行的答案？',summary:'先说清楚卡在哪里，再一起拆出一个小步骤。交流结束后，把双方总结和关键句留在卡片里，下次就能接着用。',example:true},
    {id:'example-expression',title:'想法很多，怎样表达得更清楚？',summary:'先说结论，再给一个具体例子。请对方复述听到的意思，再补上最容易被误解的一点。',example:true},
    {id:'example-practice',title:'学到了方法，怎样真正用起来？',summary:'选一个十分钟能完成的小练习，记录做了什么、哪里卡住。下一次交流，就从这个真实结果继续。',example:true}
  ];
  const cards=data.shelf.length?data.shelf:examples;
  const copy=async c=>{try{await navigator.clipboard.writeText(`${c.title}\n${c.summary}`);notice('卡片内容已复制。')}catch{notice('暂时无法复制，请选中卡片文字后手动复制。')}};
  const share=async c=>{if(navigator.share){try{await navigator.share({title:c.title,text:c.summary})}catch(e){if(e.name!=='AbortError')notice('暂时无法分享，请使用复制卡片。')}}else await copy(c)};
  if(window.TongpinCardShelf)window.TongpinCardShelf.render(box,cards,{onCopy:copy,onShare:share,onDelete:deleteCard});
}
async function deleteCard(card){
  if(!card||card.example)return;
  if(!window.confirm('确定删除这张问题卡片吗？删除后无法恢复。'))return;
  try{const r=await fetch('/api/cards/'+encodeURIComponent(card.id),{method:'DELETE'});if(!r.ok&&r.status!==404){notice('卡片删除失败，请稍后重试');return}}catch{}
  data.shelf=data.shelf.filter(c=>c.id!==card.id);save();renderShelf();notice('问题卡片已删除。');
}
function openFinish(){const q=active();if(!q)return;const msgs=(data.messages||[]).filter(m=>(m.from==='a'||m.from==='b')&&(m.roomId===q.roomId||!m.roomId));if(!msgs.length){notice('至少交流一句后再结束');return}const stage=Number(data.finishStage)||0;const ownSummary=Boolean(data.summaries?.[sessionRole]?.trim());if(stage===0){data.finishStage=1;data.ended=true;save();}/* 阶段一先让当前一方填写总结；只有已有总结时，第二次点击才算确认结束。 */if(stage===1&&ownSummary&&!data.finishRequested?.[sessionRole]){data.finishRequested[sessionRole]=true;save();if(finalizeIfReady()){renderChat();renderShelf();nav('shelf');notice('双方都已完成总结，成果卡已保存。')}else{renderChat();notice('已确认结束，等待另一端完成总结。')}return}const box=$('key-lines');box.replaceChildren();msgs.forEach(m=>{const l=document.createElement('label');l.className='key-line';l.innerHTML=`<input type="checkbox" data-message-id="${m.id}"><span>${m.from===sessionRole?'我':'对方'}：${esc(m.text)}</span>`;box.append(l)});$('my-summary').value=data.summaries?.[sessionRole]||'';$('finish-dialog').showModal()}
function finalizeIfReady(){const q=active();if(!q)return false;/* 双方均已提交结束确认即可落卡，总结文字和关键句均可留空。 */const ready=Number(data.finishStage)===1&&Boolean(data.finishRequested?.a&&data.finishRequested?.b);if(!ready)return false;const kept=(data.keyLines||[]).map(id=>(data.messages||[]).find(m=>m.id===id)).filter(Boolean).map(m=>(m.from==='a'?'A':'B')+'：'+m.text);const summary='A 总结：'+(data.summaries?.a?.trim()||'（未填写）')+'\nB 总结：'+(data.summaries?.b?.trim()||'（未填写）')+(kept.length?'\n关键句：'+kept.join('；'):'');let card=data.shelf.find(c=>c.roomId===q.roomId);if(!card){card={id:uid(),roomId:q.roomId,category:$('card-category')?.value||q.category||'',title:q.text,summary,createdAt:Date.now()};data.shelf.push(card)}data.finishStage=2;data.ended=true;data.cardSaved=true;awardAchievements(q);save();fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(card)}).catch(()=>{});if(q.creatorProfileId&&q.responderProfileId)fetch('/api/achievements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:q.roomId,asker:q.creatorProfileId,solver:q.responderProfileId,completedAt:Date.now()})}).catch(()=>{});return true}
$('open-create').onclick=()=>{$('create-dialog').showModal()};
$('open-solve').onclick=()=>{if(selectedQuestionId){enterAnonymousSolve();return}nav('board');renderBoard();$('board-list').scrollIntoView({behavior:'smooth',block:'start'});notice(data.questions.length?'请先点击一个问题块选中，再点击“解决问题”。':'当前还没有可加入的问题，请先等待他人发布。')};
$('create-close').onclick=()=>{$('create-dialog').close()};
$('create-form').addEventListener('submit',async e=>{e.preventDefault();sessionRole='a';sessionStorage.setItem('tongpin-role',sessionRole);PROFILE_ID=roleProfile(sessionRole);const draft={category:$('q-category').value,text:$('q-text').value.trim(),name:$('q-name').value.trim(),want:$('q-want').value.trim(),creatorClientId:CLIENT_ID,creatorProfileId:PROFILE_ID};if(!draft.text||!draft.name)return;let q;try{const r=await fetch('/api/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});const body=await r.json();q=body.question}catch{}if(!q)q={...draft,id:uid(),roomId:uid(),createdAt:Date.now(),matched:false};q.creatorClientId=CLIENT_ID;q.creatorProfileId=PROFILE_ID;q.matched=true;data.questions.unshift(q);data.activeId=q.id;data.ended=false;data.finishStage=0;data.cardSaved=false;data.summaries={a:'',b:''};data.finishRequested={a:false,b:false};data.keyLines=[];save();$('create-dialog').close();e.target.reset();await match(q.id);notice('问题已发布并进入匹配，你可以直接交流。')});
 $('chat-form').addEventListener('submit',async e=>{e.preventDefault();const t=$('chat-input').value.trim(),q=active();if(!t||!q||messageBusy||$('chat-input').disabled)return;messageBusy=true;renderChat();try{const role=roomRole(q),body=await requestJSON('/api/messages',{roomId:q.roomId,from:role,senderId:CLIENT_ID,clientId:CLIENT_ID,senderName:role==='a'?q.name:role==='b'?q.responderName:'',text:t});if(!body.message)throw new Error('missing message');if(!data.messages.some(m=>m.id===body.message.id))data.messages.push(body.message);if($('chat-input').value.trim()===t)$('chat-input').value='';save();maybeAI(t,q)}catch{notice('消息发送失败，文字已保留，请重试。')}finally{messageBusy=false;renderChat()}});
$('end-chat').onclick=openFinish;
$('extend-topic').onclick=async()=>{const q=active();if(!q||topicBusy)return;if(topicFor(q)){renderCommunity();nav('community');return}topicBusy=true;renderChat();try{const body=await requestJSON('/api/topics',{roomId:q.roomId,questionId:q.id,clientId:CLIENT_ID,from:CLIENT_ID});if(!body.topic||!body.question)throw new Error('missing topic');useQuestion(body.question);data.topics=[...data.topics.filter(t=>t.roomId!==q.roomId),body.topic];save();await syncServer();renderCommunity();nav('community');notice('问题已进入疑问社区，其他人可点击“加入房间”。')}catch{notice('发布到疑问社区失败，请检查本地服务后重试。')}finally{topicBusy=false;renderChat()}};
const achievementToggle=$('toggle-achievements'),achievementPanel=$('achievement-panel');if(achievementToggle&&achievementPanel)achievementToggle.onclick=()=>{achievementPanel.hidden=!achievementPanel.hidden;achievementToggle.setAttribute('aria-expanded',String(!achievementPanel.hidden));if(!achievementPanel.hidden)renderAchievements()};
const achievementPreviewClose=$('achievement-preview-close'),achievementPreviewDialog=$('achievement-preview-dialog');if(achievementPreviewClose&&achievementPreviewDialog)achievementPreviewClose.onclick=()=>achievementPreviewDialog.close();
const achievementPreviewArt=$('achievement-preview-art');if(achievementPreviewArt&&achievementPreviewDialog)achievementPreviewArt.onclick=()=>{const enlarged=achievementPreviewDialog.classList.toggle('is-enlarged');achievementPreviewArt.setAttribute('aria-expanded',String(enlarged));achievementPreviewArt.setAttribute('aria-label',enlarged?'缩小成就图片':'放大成就图片')};
const unlockDialog=$('achievement-unlock-dialog');if(unlockDialog){const unlockClose=$('achievement-unlock-close');if(unlockClose)unlockClose.onclick=()=>unlockDialog.close()}
const achievementPreviewBody=$('achievement-preview-body');if(achievementPreviewBody)achievementPreviewBody.addEventListener('click',e=>{const button=e.target.closest('[data-preview-stage]');if(button)renderAchievementPreview(achievementPreviewBody.dataset.kind,Number(button.dataset.previewStage))});
for(const dialog of [achievementPreviewDialog,unlockDialog])if(dialog){
  let startedOnBlank=false;
  dialog.addEventListener('pointerdown',e=>{startedOnBlank=e.target===dialog});
  dialog.addEventListener('click',e=>{if(startedOnBlank&&e.target===dialog)dialog.close();startedOnBlank=false});
}
document.addEventListener('close',()=>setTimeout(displayNextAchievementUnlock,0),true);
$('add-category-inline').onclick=()=>{$('category-dialog').showModal();renderCategoryManager()};
$('manage-categories').onclick=()=>{renderCategoryManager();$('category-dialog').showModal()};
$('add-category').onclick=()=>{const input=$('new-category'),name=input.value.trim();if(!name){notice('请输入分类名称');return}if(categories.includes(name)){notice('这个分类已经存在');return}if(categories.length>=30){notice('最多添加 30 个分类');return}categories.push(name);saveCategories();input.value='';renderCategoryControls();renderCategoryManager();renderShelf()};
$('finish-form').addEventListener('submit',e=>{e.preventDefault();const q=active();if(!q)return;const selected=[...document.querySelectorAll('#key-lines input:checked')].map(x=>x.dataset.messageId);data.keyLines=[...new Set([...(data.keyLines||[]),...selected])];const sum=$('my-summary').value.trim();data.summaries[sessionRole]=sum;data.finishStage=1;data.ended=true;/* 总结提交即视为该端确认，允许空总结；双方确认齐备后立即生成卡片。 */data.finishRequested[sessionRole]=true;const completed=Boolean(data.finishRequested.a&&data.finishRequested.b);save();$('finish-dialog').close();if(completed&&finalizeIfReady()){renderChat();renderShelf();nav('shelf');notice('双方已确认结束，成果卡已保存。')}else{renderChat();notice('已保存你的结束确认，等待另一端完成。')}});
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{nav(b.dataset.view);if(b.dataset.view==='shelf')renderShelf();if(b.dataset.view==='chat')renderChat();if(b.dataset.view==='community')renderCommunity();if(b.dataset.view==='friends')window.TongpinFriends?.refresh()});
read();
data.activeId=sessionStorage.getItem(ROOM_SESSION)||new URL(location.href).searchParams.get('question')||null;
readCategories();

readAchievements();observeAchievementProgress(false);
const qParam=new URL(location.href).searchParams.get('question');if(data.activeId)renderChat();renderBoard();renderShelf();
renderCategoryControls();
renderAchievements();
window.TongpinFriends?.init({context:()=>({profileId:PROFILE_ID,clientId:CLIENT_ID,roomId:active()?.roomId||''}),notice});
syncServer();setInterval(syncServer,1200);
})();








