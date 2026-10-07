const {spawn}=require('node:child_process');
function collect(binary,args,onChunk,signal){return new Promise((resolve,reject)=>{let log='';const p=spawn(binary,args,{windowsHide:true,shell:false,signal,stdio:['ignore','pipe','pipe']});p.stderr.on('data',b=>log=(log+b).slice(-2000));p.stdout.on('data',b=>{try{onChunk(b);}catch(e){p.kill();reject(e);}});p.once('error',reject);p.once('close',code=>code===0?resolve():reject(Error(log||'分析终止')));});}
async function analyzeMedia(ffmpeg,ffprobe,input,signal){
 const peaks=[],frames=[];let remain=Buffer.alloc(0),peak=0,count=0,line='';
 const wave=collect(ffmpeg,['-v','error','-nostdin','-i',input,'-map','0:a:0','-vn','-ac','1','-ar','2000','-c:a','pcm_f32le','-f','f32le','pipe:1'],b=>{const data=Buffer.concat([remain,b]);let i=0;for(;i+4<=data.length;i+=4){peak=Math.max(peak,Math.abs(data.readFloatLE(i)));if(++count===40){peaks.push(peak);peak=0;count=0;if(peaks.length>2000000)throw Error('音频过长');}}remain=data.subarray(i);},signal).then(()=>{if(count)peaks.push(peak);});
 function frameLine(s){const n=Number.parseFloat(s.split(',')[0]);if(Number.isFinite(n))frames.push(n);if(frames.length>2000000)throw Error('帧数超过分析上限');}
 const timing=collect(ffprobe,['-v','error','-threads','1','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','csv=p=0',input],b=>{line+=b.toString();const lines=line.split('\n');line=lines.pop();lines.forEach(frameLine);},signal).then(()=>{if(line)frameLine(line);frames.sort((a,b)=>a-b);});
 const [a,f]=await Promise.allSettled([wave,timing]);return {peaks:a.status==='fulfilled'?peaks:[],peakStep:.02,frames:f.status==='fulfilled'?frames:[],waveError:a.status==='rejected'?a.reason.message:'',frameError:f.status==='rejected'?f.reason.message:''};
}
module.exports={analyzeMedia};
