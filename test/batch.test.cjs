const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseBatch}=require('../app/batch-plan.cjs'),{parsePlan}=require('../app/export.cjs');
const {TaskQueue,autoConcurrency}=require('../app/task-queue.cjs');
const files=[{path:'a.mp4',name:'a.mp4',duration:12},{path:'b.mp4',name:'b.mp4',duration:5}];
test('batch maps pairs by file order, preserves physical line numbers and millisecond boundaries',()=>{
 const text='breakpoints:00:10.001\r\nnames:a,b\r\nbreakpoints:00:05.001\r\nnames:c,d';
 const invalid=parseBatch(text,files,parsePlan);assert.equal(invalid.errors.length,1);assert.equal(invalid.errors[0].line,3);assert.match(invalid.errors[0].message,/00:05.001/);
 const valid=parseBatch(text.replace('00:05.001','00:04.999'),files,parsePlan);assert.deepEqual(valid.errors,[]);assert.equal(valid.plans[1].path,'b.mp4');assert.equal(valid.plans[1].plan[1].end,5);
 assert.ok(parseBatch('breakpoints:\nnames:a\n\nbreakpoints:\nnames:b',files,parsePlan).errors.length);
 assert.ok(parseBatch('breakpoints:\nnames:a',files,parsePlan).errors.length);
 assert.equal(parseBatch('breakpoints:\nnames:a\nbreakpoints:\nnames:CON',files,parsePlan).errors[0].line,4);
});
test('automatic concurrency falls back under resource pressure',()=>{assert.equal(autoConcurrency({cpus:16,free:16*1024**3,total:32*1024**3}),3);assert.equal(autoConcurrency({cpus:2,free:16*1024**3,total:32*1024**3}),1);assert.equal(autoConcurrency({cpus:16,free:1024**3,total:32*1024**3}),1);assert.equal(autoConcurrency({cpus:16,free:16*1024**3,total:32*1024**3,load:.9}),1);});
test('queue runs independent jobs concurrently, accepts additions, isolates failure/cancel, resumes at reduced capacity',async()=>{
 let cap=2;const pending=new Map();let active=0,max=0;const q=new TaskQueue((job,report)=>new Promise((resolve,reject)=>{active++;max=Math.max(max,active);report('working');pending.set(job.id,{resolve:()=>{active--;resolve({count:1});},reject:()=>{active--;reject(Error('bad'));}});job.controller.signal.addEventListener('abort',()=>{active--;reject(Error('stopped'));},{once:true});}),()=>{},()=>cap);
 const tick=()=>new Promise(r=>setImmediate(r));
 q.add([{name:'a'},{name:'b'},{name:'c'}]);await tick();assert.equal(active,2);q.add([{name:'d'}]);assert.equal(q.snapshot()[3].status,'waiting');assert.equal(q.cancel(4),true);
 cap=1;pending.get(1).reject();await tick();assert.equal(active,1);assert.equal(q.snapshot()[2].status,'waiting');pending.get(2).resolve();await tick();assert.equal(active,1);q.cancel(3);await tick();assert.equal(q.busy,false);assert.equal(max,2);assert.deepEqual(q.snapshot().map(j=>j.status),['failed','done','canceled','canceled']);q.clear();assert.deepEqual(q.snapshot(),[]);
});

test('audio-only jobs retain queue cancellation and report audio-specific completion',async()=>{
 let finish;const q=new TaskQueue(()=>new Promise(resolve=>{finish=resolve;}),()=>{},()=>1);
 q.add([{name:'原名.mp4',audioOnly:true}]);await new Promise(r=>setImmediate(r));assert.equal(q.snapshot()[0].progress,'开始导出原始音频');
 finish({audioOnly:true,count:0,audioCount:1});await new Promise(r=>setImmediate(r));
 assert.equal(q.snapshot()[0].status,'done');assert.equal(q.snapshot()[0].progress,'原始音频导出完成');
});
