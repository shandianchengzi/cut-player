// One independent analysis per file; keep completed results in the disk cache, not this queue.
class AnalysisQueue {
 constructor(capacity=()=>2){this.capacity=capacity;this.jobs=new Map();this.pending=[];this.active=0;this.closed=false;}
 run(key,execute){
  if(this.closed)return Promise.reject(Error('分析已停止'));
  const existing=this.jobs.get(key);if(existing)return existing.promise;
  const job={key,execute,controller:new AbortController()};
  job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  this.jobs.set(key,job);this.pending.push(job);this.pump();return job.promise;
 }
 pump(){
  while(!this.closed&&this.pending.length&&this.active<Math.max(1,this.capacity())){
   const job=this.pending.shift();this.active++;
   Promise.resolve().then(()=>job.execute(job.controller.signal)).then(job.resolve,job.reject).finally(()=>{
    if(this.jobs.get(job.key)===job)this.jobs.delete(job.key);
    this.active--;this.pump();
   });
  }
 }
 close(){
  this.closed=true;for(const job of this.jobs.values())job.controller.abort();
  for(const job of this.pending.splice(0)){this.jobs.delete(job.key);job.reject(Error('分析已停止'));}
 }
}
module.exports={AnalysisQueue};
