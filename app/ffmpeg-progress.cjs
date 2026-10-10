function progressParser(onProgress){
 let pending='',block={};
 return chunk=>{pending+=chunk.toString();const lines=pending.split('\n');pending=lines.pop();if(pending.length>8192)pending='';
  for(const raw of lines){const line=raw.trim(),index=line.indexOf('=');if(index<1)continue;const key=line.slice(0,index),value=line.slice(index+1);block[key]=value;if(key==='progress'){
   const time=Number(block.out_time_us??block.out_time_ms),bytes=Number(block.total_size);
   onProgress({seconds:Number.isFinite(time)?Math.max(0,time/1000000):0,bytes:Number.isFinite(bytes)?Math.max(0,bytes):0,speed:block.speed||'',ended:value==='end'});block={};
  }}
 };
}
function localInputOptions(url){return typeof url==='string'&&url.startsWith('http://127.0.0.1:')?['-http_proxy','','-rw_timeout','60000000']:[];}
module.exports={progressParser,localInputOptions};
