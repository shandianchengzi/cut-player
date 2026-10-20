const test=require('node:test'),assert=require('node:assert/strict');
const {AnalysisQueue}=require('../app/analysis-queue.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('analysis starts unseen files, deduplicates in-flight paths and bounds concurrency',async()=>{
 const queue=new AnalysisQueue(()=>2),started=[],finish=new Map();
 const work=name=>signal=>{assert.equal(signal.aborted,false);started.push(name);return new Promise(resolve=>finish.set(name,resolve));};
 const a=queue.run('a',work('a')),duplicate=queue.run('a',()=>{throw Error('duplicate ran');}),b=queue.run('b',work('b')),c=queue.run('c',work('c'));
 assert.equal(a,duplicate);await tick();assert.deepEqual(started,['a','b']);
 finish.get('b')('B');assert.equal(await b,'B');await tick();assert.deepEqual(started,['a','b','c']);
 finish.get('a')('A');finish.get('c')('C');assert.deepEqual(await Promise.all([a,c]),['A','C']);await tick();
 assert.equal(queue.active,0);assert.equal(queue.jobs.size,0);
 // A later open can reload its disk cache without retaining full arrays in the queue.
 assert.equal(await queue.run('a',async()=>42),42);
});
test('analysis failure drains the queue and shutdown aborts running and pending work',async()=>{
 const queue=new AnalysisQueue(()=>1);const failed=queue.run('broken',async()=>{throw Error('missing file');});
 const next=queue.run('valid',async()=>7);await assert.rejects(failed,/missing file/);assert.equal(await next,7);await tick();
 const running=queue.run('long',signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true})));
 let launched=false;const pending=queue.run('pending',async()=>{launched=true;});
 const settled=Promise.allSettled([running,pending]);await tick();queue.close();
 assert.deepEqual((await settled).map(x=>x.status),['rejected','rejected']);assert.equal(launched,false);
 await assert.rejects(queue.run('after',async()=>0),/分析已停止/);await tick();assert.equal(queue.jobs.size,0);
});
