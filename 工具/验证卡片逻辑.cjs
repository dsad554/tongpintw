const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/assets/核心逻辑.js');
test('三种任务创建与往返解析',()=>{for(const id of C.TASK_IDS){const s=C.newSession(id);assert.deepEqual(C.parse(JSON.stringify(s)),s);}});
test('只接受白名单字段、版本与有限大小',()=>{
 const s=C.newSession();assert.throws(()=>C.parse(JSON.stringify({...s,apiKey:'fake-test-value'})));
 assert.throws(()=>C.parse(JSON.stringify({...s,sessionId:123456789123})));
 assert.throws(()=>C.parse('x'.repeat(32769)));
 assert.throws(()=>C.parse(JSON.stringify({...s,revision:2,parentRevision:0})));
 s.participants.a.name='字'.repeat(25);assert.throws(()=>C.validate(s));
});
test('导出版本递增且不修改原始对象',()=>{const s=C.newSession(),e=C.nextExport(s);assert.equal(e.revision,1);assert.equal(e.parentRevision,0);assert.equal(s.revision,0);});
test('模拟两方手动往返',()=>{
 const a=C.newSession();a.participants.a.name='测试A';
 const invite=C.nextExport(a),b=C.parse(JSON.stringify(invite));b.participants.b.name='测试B';
 const response=C.nextExport(b);assert.equal(C.importDecision(invite,response,false).ok,true);assert.equal(response.participants.a.name,'测试A');
});
test('旧版、重复、跳号和有本地修改时拒绝覆盖',()=>{
 const a=C.nextExport(C.newSession()),b=C.nextExport(a),jump=C.nextExport(b);
 assert.equal(C.importDecision(a,a,false).ok,false);
 assert.equal(C.importDecision(b,a,false).ok,false);
 assert.equal(C.importDecision(a,b,true).ok,false);
 assert.equal(C.importDecision(a,jump,false).ok,false);
});
test('其他共创卡必须由界面明确确认替换',()=>{const r=C.importDecision(C.newSession(),C.newSession(),true);assert.equal(r.ok,true);assert.equal(r.replace,true);});
test('同一编号不能变更题目或示例性质',()=>{const s=C.newSession(),n=C.nextExport(s);n.demo=true;assert.equal(C.importDecision(s,n,false).ok,false);});
test('完成要求包含双向贡献和自述确认',()=>{
 const s=C.newSession();assert.equal(C.complete(s),false);
 for(const r of ['a','b']){for(const k of Object.keys(C.limits))s.participants[r][k]='测试内容';s.claims[r]=true;}
 s.result='共同成果';assert.equal(C.complete(s),true);
 s.participants.b.reflection='';assert.equal(C.complete(s),false);
});
test('示例与明文身份边界保留在成果文本',()=>{const s=C.newSession();s.demo=true;assert.match(C.textCard(s,'测试'),/非真实合作记录/);assert.match(C.textCard(s,'测试'),/明文/);});
