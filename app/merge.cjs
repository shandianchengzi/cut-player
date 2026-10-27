const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {parsePlan}=require('./export.cjs');
const {localInputOptions,progressParser}=require('./ffmpeg-progress.cjs');
const {createMediaSource}=require('./media-source.cjs');
const extensions=new Set(['.mp4','.m4v','.mov','.mkv','.webm','.avi','.ts','.mts','.m2ts']);
function validName(value){
 if(typeof value!=='string'||!value.trim()||value.length>240||/[<>:"/\\|?*\x00-\x1f]/.test(value)||/[. ]$/.test(value)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value))throw Error('输出名称包含 Windows 不允许的字符、保留名称或长度过长');
 return value;
}
function quote(value){if(/[\r\n\0]/.test(value))throw Error('文件路径无效');return "'"+value.replaceAll("'","'\\''")+"'";}
function consecutiveRanges(parts){const ranges=[];for(const part of parts){const last=ranges.at(-1);if(last&&last.url===part.url&&Math.abs(last.end-part.start)<1e-7){last.end=part.end;if('outpoint' in part)last.outpoint=part.outpoint;}else ranges.push({...part});}return ranges;}
function concatScript(parts){parts=consecutiveRanges(parts);return 'ffconcat version 1.0\n'+parts.map(p=>'file '+quote(p.url)+'\n'+(p.url.startsWith('http://')?"option rw_timeout 60000000\n":'')+'inpoint '+p.start+'\noutpoint '+(p.outpoint??p.end)+'\n'+('outpoint' in p?'duration '+(p.end-p.start)+'\n':'')).join('');}

function closedKeyPacket(packet,codec,nalLength=4){
 if(codec!=='h264'&&codec!=='hevc')return true;
 if(typeof packet.data!=='string')return false;
 const hex=packet.data.split('\n').filter(l=>/^[0-9a-f]+:/i.test(l)).map(l=>l.slice(l.indexOf(':')+2,l.indexOf(':')+41).replaceAll(' ','')).join('');
 const data=Buffer.from(hex,'hex'),isVcl=n=>codec==='h264'?n>=1&&n<=5:n<=31;
 const type=i=>codec==='h264'?data[i]&31:(data[i]>>1)&63;
 const safe=n=>codec==='h264'?n===5:n>=16&&n<=20; // IDR/BLA, never open-GOP CRA.
 const startCode=i=>data[i]===0&&data[i+1]===0?(data[i+2]===1?3:data[i+2]===0&&data[i+3]===1?4:0):0;
 if(startCode(0)){
  for(let i=0;i<data.length-3;i++){const n=startCode(i);if(n){const t=type(i+n);if(isVcl(t))return safe(t);i+=n;}}
 }else if(Number.isInteger(nalLength)&&nalLength>=1&&nalLength<=4){
  for(let i=0;i+nalLength<data.length;){const size=data.readUIntBE(i,nalLength);i+=nalLength;if(!size||i+size>data.length)return false;const t=type(i);if(isVcl(t))return safe(t);i+=size;}
 }
 return false;
}
function signature(meta){
 if(!Array.isArray(meta.streams)||!meta.streams.some(s=>s.codec_type==='video'))throw Error('源文件没有视频轨道');
 return meta.streams.map(s=>{
  const keys=s.codec_type==='video'?['codec_name','profile','level','width','height','pix_fmt','field_order','sample_aspect_ratio','r_frame_rate','time_base','extradata_hash']:s.codec_type==='audio'?['codec_name','profile','sample_fmt','sample_rate','channels','channel_layout','time_base','extradata_hash']:['codec_name','time_base'];
  return {type:s.codec_type,...Object.fromEntries(keys.map(k=>[k,s[k]??null]))};
 });
}
function compatible(first,next,name){
 const a=signature(first),b=signature(next);
 if(a.length!==b.length)throw Error(name+'：轨道数量不兼容，不能直接无损合并');
 for(let i=0;i<a.length;i++)for(const key of Object.keys(a[i]))if(a[i][key]!==b[i][key])throw Error(name+'：第 '+(i+1)+' 条轨道的 '+key+' 不兼容，不能直接无损合并');
}
function sourceIdentity(file){try{const s=fs.statSync(file);return {real:fs.realpathSync(file).toLowerCase(),dev:s.dev,ino:s.ino};}catch{return {real:path.resolve(file).toLowerCase()};}}
function protectsSource(output,files){
 const out=sourceIdentity(output);
 return files.some(file=>{const src=sourceIdentity(file);return out.real===src.real||out.ino>0&&out.ino===src.ino&&out.dev===src.dev;});
}
function run(binary,args,{signal,progress,timeout=0,verifyVideoTimestamps=false,maxOutput=4*1024*1024}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(Error('已停止合并'));return;}
  let child,stdout='',stderr='',finished=false,timer,timedOut=false;
  try{child=spawn(binary,args,{windowsHide:true,shell:false,signal,stdio:['ignore','pipe','pipe'],env:{...process.env,http_proxy:'',HTTP_PROXY:'',https_proxy:'',HTTPS_PROXY:'',all_proxy:'',ALL_PROXY:'',no_proxy:'127.0.0.1,localhost',NO_PROXY:'127.0.0.1,localhost'}});}catch(e){reject(e);return;}
  const finish=e=>{if(finished)return;finished=true;clearTimeout(timer);if(e)reject(e);else resolve(stdout);};
  if(progress)child.stdout.on('data',progressParser(progress));else child.stdout.on('data',b=>{stdout+=b.toString();if(stdout.length>maxOutput){child.kill();finish(Error('源文件轨道信息过大'));}});
  child.stderr.on('data',b=>stderr=(stderr+b.toString()).slice(-12000));
  child.once('error',e=>{if(!signal?.aborted||!child.pid)finish(e);});child.once('close',code=>finish(timedOut?Error('读取视频信息超时，请检查源文件与磁盘'):signal?.aborted?Error('已停止合并'):code===0?(verifyVideoTimestamps&&/Non-monoton(?:ous|ic).*?(?:output stream|stream)\s+0:0/i.test(stderr)?Error('合并视频时间戳异常，未通过校验；请检查源视频'):null):Error('FFmpeg 处理失败：'+stderr.slice(-2200))));
  if(timeout)timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
 });
}
function createMergeEngine({ffmpeg,ffprobe,tempDir=os.tmpdir()}){
 async function probe(url,signal){
  const text=await run(ffprobe,['-v','error',...localInputOptions(url),'-show_streams','-show_format','-show_data_hash','sha256','-of','json',url],{signal,timeout:30000});
  const meta=JSON.parse(text),duration=Number(meta.format?.duration);
  if(!Number.isFinite(duration)||duration<=0)throw Error('无法读取视频时长');return {...meta,duration};
 }


 // Resolve whole read ranges before seeking: adjacent original segments stay one range.
 // PTS chooses outward boundaries; the video outpoint uses DTS so B-frame preroll
 // cannot overlap the next range. Audio uses the same PTS interval in a separate list.
 async function align(parts,info,signal,progress,strict=false){
  const ranges=consecutiveRanges(parts),resolvers=new Map();
  for(const data of info.values()){
   const video=data.meta.streams.filter(s=>s.codec_type==='video');
   if(video.length!==1)throw Error('当前无损合并需要单条视频轨道，不能保证多视频轨道的关键帧同时对齐');
   const codec=video[0].codec_name,inspect=['h264','hevc'].includes(codec),cache=new Map(),windows=new Map(),duration=data.meta.duration;
   const read=async(interval,payload=false)=>{
    progress('正在核对合并范围…');
    const text=await run(ffprobe,['-v','error',...localInputOptions(data.url),'-select_streams','v:0','-read_intervals',interval,'-show_packets',...(payload?['-show_data']:[]),'-show_entries','packet=pts_time,dts_time,flags'+(payload?',data':''),'-of','json',data.url],{signal,timeout:60000,maxOutput:32*1024*1024});
    return JSON.parse(text).packets||[];
   };
   const key=async(time)=>{
    const id=time.toFixed(6);if(cache.has(id))return cache.get(id);
    const packet=(await read(id+'%+#1',inspect))[0],pts=Number(packet?.pts_time),dts=Number(packet?.dts_time);
    if(!packet?.flags?.includes('K')||!Number.isFinite(pts)||!Number.isFinite(dts)||pts<-.000001||pts>time+.00002)throw Error('无法确定可独立解码的合并范围，请检查源视频');
    const value={pts:Math.max(0,pts),dts,safe:closedKeyPacket(packet,codec,Number(video[0].nal_length_size||4))};
    cache.set(id,value);cache.set(value.pts.toFixed(6),value);return value;
   };
   const scan=async(lo,hi)=>{
    const id=lo.toFixed(6)+'%'+hi.toFixed(6);if(windows.has(id))return windows.get(id);
    const candidates=(await read(id)).filter(p=>p.flags?.includes('K')).map(p=>Number(p.pts_time)).filter(t=>Number.isFinite(t)&&t>=0);
    windows.set(id,candidates);return candidates;
   };
   const before=async(time)=>{
    if(time<=.00001)return {pts:0};
    const first=await key(time);if(first.safe)return first;
    let cursor=first.pts;
    while(cursor>.00001){
     const lo=Math.max(0,cursor-30),candidates=(await scan(lo,cursor)).filter(t=>t<cursor-.00001).sort((a,b)=>b-a);
     for(const t of candidates){if(t<=.00001)return {pts:0};const k=await key(t+.000001);if(k.safe)return k;}
     cursor=lo;
    }
    return {pts:0};
   };
   const after=async(time)=>{
    if(time>=duration-.00001)return null;
    const first=await key(time);if(first.safe&&Math.abs(first.pts-time)<.00001)return first;
    for(let cursor=time,width=1;cursor<duration;width=Math.min(30,width*2)){
     const hi=Math.min(duration,cursor+width),candidates=(await scan(cursor,hi)).filter(t=>t>=time-.00001&&t<duration-.00001).sort((a,b)=>a-b);
     for(const t of candidates){const k=await key(t+.000001);if(k.safe)return k;}
     cursor=hi;
    }
    return null; // No later closed random-access point: preserve the source tail.
   };
   resolvers.set(data.url,{before,after,duration});
  }
  for(const p of ranges){
   const requestedStart=p.start,requestedEnd=p.end,r=resolvers.get(p.url),start=await r.before(p.start),end=await r.after(p.end);
   if(strict&&(Math.abs(start.pts-requestedStart)>.0006||(end&&Math.abs(end.pts-requestedEnd)>.0006)||(!end&&requestedEnd<r.duration-.0006)))throw Error('选定范围包含不能独立解码的断点，请回到“无损关键帧”模式重新记录');
   p.start=start.pts;p.end=end?end.pts:r.duration;p.outpoint=end?end.dts:r.duration;
   if(p.end<=p.start)throw Error('无法确定完整的合并范围，请检查源视频');
  }
  return ranges;
 }
 async function list(inputs){
  if(!Array.isArray(inputs)||!inputs.length||inputs.length>200)throw Error('请打开 1–200 个视频');
  const groups=[],errors=[];
  for(const input of inputs){
   const source=createMediaSource();
   try{
    if(typeof input?.path!=='string'||typeof input.text!=='string'||input.text.length>2000000)throw Error('视频记录无效');
    const file=path.resolve(input.path);if(!fs.statSync(file).isFile())throw Error('源视频不存在');
    const meta=await probe(await source.select(file));
    groups.push({file,label:path.basename(file),parts:parsePlan(input.text,meta.duration)});
   }catch(e){errors.push((input?.name||path.basename(String(input?.path||'')))+'：'+e.message);}
   finally{source.close();}
  }
  return {groups,errors};
 }
 async function merge(request,{signal,progress=()=>{},selectOutput,claimOutput=()=>()=>{},confirmOverwrite=async()=>false}={}){
  if(!Array.isArray(request?.parts)||!request.parts.length||request.parts.length>2000)throw Error('请选择 1–2000 个片段');
  const name=validName(request.name),sources=[],info=new Map(),parts=[],protectedFiles=request.protectFiles||[];
  if(!Array.isArray(protectedFiles)||protectedFiles.length>200||protectedFiles.some(p=>typeof p!=='string'))throw Error('视频路径无效');
  let folder,output,release=()=>{};
  const check=()=>{if(signal?.aborted)throw Error('已停止合并');};
  try{
   for(const part of request.parts){
    check();if(typeof part?.file!=='string'||!Number.isFinite(part.start)||!Number.isFinite(part.end)||part.start<0||part.end<=part.start)throw Error('片段范围无效');
    const file=path.resolve(part.file),key=file.toLowerCase();
    if(!info.has(key)){
     if(!fs.statSync(file).isFile())throw Error('源视频不存在：'+file);
     progress('检查合并参数：'+path.basename(file));
     const source=createMediaSource();sources.push(source);const url=await source.select(file),meta=await probe(url,signal);
     if(info.size)compatible(info.values().next().value.meta,meta,path.basename(file));else signature(meta);
     info.set(key,{url,meta,file});
    }
    const data=info.get(key);if(part.end>data.meta.duration+.001)throw Error('片段已超出源视频时长：'+path.basename(file));
    parts.push({...part,file,url:data.url});
   }
   check();const ranges=await align(parts,info,signal,progress,request.losslessKeyframes===true);const first=parts[0],ext=path.extname(first.file).toLowerCase();if(!extensions.has(ext))throw Error('暂不支持该输出容器：'+ext);
   output=await selectOutput({name,ext});if(!output)return {canceled:true};
   output=path.resolve(output);if(!path.extname(output))output+=ext;
   if(!extensions.has(path.extname(output).toLowerCase()))throw Error('输出扩展名不受支持');
   if(protectsSource(output,[...parts.map(p=>p.file),...protectedFiles]))throw Error('输出文件不能覆盖源视频');
   release=claimOutput(output);
   if(fs.existsSync(output)&&!await confirmOverwrite(output))return {canceled:true};
   check();folder=fs.mkdtempSync(path.join(tempDir,'cut-player-merge-'));const script=path.join(folder,'merge.ffconcat'),audioScript=path.join(folder,'audio.ffconcat');fs.writeFileSync(script,concatScript(ranges),'utf8');const hasAudio=info.values().next().value.meta.streams.some(s=>s.codec_type==='audio');if(hasAudio)fs.writeFileSync(audioScript,concatScript(ranges.map(p=>({...p,outpoint:p.end}))),'utf8');
   const total=ranges.reduce((n,p)=>n+p.end-p.start,0),requestedDuration=parts.reduce((n,p)=>n+p.end-p.start,0);
   progress('正在无损合并 '+parts.length+' 个片段…');
   await run(ffmpeg,['-hide_banner','-nostdin','-y','-progress','pipe:1','-stats_period','1','-nostats','-vsync','0','-safe','0','-protocol_whitelist','file,http,tcp','-f','concat','-i',script,...(hasAudio?['-safe','0','-protocol_whitelist','file,http,tcp','-f','concat','-i',audioScript]:[]),'-map','0:v?',...(hasAudio?['-map','1:a?']:[]),'-c','copy',output],{signal,verifyVideoTimestamps:true,progress:p=>progress('正在无损合并 · '+Math.min(99.9,p.seconds/total*100).toFixed(1)+'% · '+(p.bytes/1048576).toFixed(2)+' MB'+(p.speed?' · '+p.speed:''))});
   check();progress('合并写入完成，正在核对时长…');const resultSource=createMediaSource();sources.push(resultSource);const actual=await probe(await resultSource.select(output),signal);
   return {output,count:parts.length,bytes:fs.statSync(output).size,duration:actual.duration,expectedDuration:total,requestedDuration};
  }catch(e){if(signal?.aborted)e=Error('已停止合并');if(output)e.message+='\n已生成或部分文件保留在：'+output;throw e;}
  finally{release();for(const source of sources)source.close();if(folder)fs.rmSync(folder,{recursive:true,force:true});}
 }
 return {list,merge};
}
module.exports={createMergeEngine,concatScript,signature,compatible,protectsSource,validName,closedKeyPacket};
