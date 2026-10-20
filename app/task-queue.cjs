const os=require('node:os');
function autoConcurrency({cpus=os.availableParallelism?.()||os.cpus().length,free=os.freemem(),total=os.totalmem(),load=0}={}){
 if(free<1.5*1024**3||free/total<.12||load>.85)return 1;
 return Math.max(1,Math.min(3,Math.floor(cpus/2),Math.floor(free/(2*1024**3))));
}
class TaskQueue{
 constructor(execute,notify,capacity=autoConcurrency){this.execute=execute;this.notify=notify;this.capacity=capacity;this.jobs=[];this.serial=0;this.timer=null;}
 snapshot(){return this.jobs.map(({id,name,status,progress,error,result})=>({id,name,status,progress,error,result}));}
 get busy(){return this.jobs.some(j=>j.status==='waiting'||j.status==='running');}
 emit(){this.notify(this.snapshot());}
 add(items){if(this.jobs.length+items.length>200)throw Error('队列最多保留 200 个任务，请先清除已结束任务');const added=items.map(item=>({...item,id:++this.serial,status:'waiting',progress:'等待执行',controller:new AbortController()}));this.jobs.push(...added);this.emit();this.pump();return added.map(j=>j.id);}
 pump(){clearTimeout(this.timer);this.timer=null;const active=this.jobs.filter(j=>j.status==='running').length;let slots=Math.max(0,this.capacity()-active);
  for(const job of this.jobs){if(!slots||job.status!=='waiting')continue;slots--;job.status='running';job.progress='开始切割';this.emit();Promise.resolve().then(()=>this.execute(job,text=>{job.progress=text;this.emit();})).then(result=>{job.result=result;job.status=job.controller.signal.aborted?'canceled':'done';job.progress=job.status==='done'?'切割完成':'已取消';},e=>{job.status=job.controller.signal.aborted?'canceled':'failed';job.error=e.message;job.progress=job.status==='failed'?'切割失败':'已取消';}).finally(()=>{this.emit();this.pump();});}
  if(this.jobs.some(j=>j.status==='waiting')){this.timer=setTimeout(()=>this.pump(),1500);this.timer.unref?.();}
 }
 cancel(id){const job=this.jobs.find(j=>j.id===id);if(!job||!['waiting','running'].includes(job.status))return false;job.controller.abort();if(job.status==='waiting'){job.status='canceled';job.progress='已取消';}this.emit();this.pump();return true;}
 clear(){this.jobs=this.jobs.filter(j=>['waiting','running'].includes(j.status));this.emit();}
}
module.exports={TaskQueue,autoConcurrency};
