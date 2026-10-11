// Real stream-copy regression and bounded localhost I/O benchmark.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto'),{performance}=require('node:perf_hooks');
const {createMediaSource}=require('../app/media-source.cjs'),{videoArgs,audioArgs}=require('../app/export.cjs'),{localInputOptions}=require('../app/ffmpeg-progress.cjs'),{sourceInfoArgs,parseSourceInfo}=require('../app/export-info.cjs');
const ffmpeg=process.argv[2]||require('ffmpeg-static'),ffprobe=process.argv[3]||path.join(path.dirname(ffmpeg),'ffprobe.exe'),destination=process.argv[4]||'dist/export-performance.json';
function run(exe,args,probe=false){return new Promise((resolve,reject)=>{const at=args.indexOf('-i');if(at>=0)args=[...args.slice(0,at),...localInputOptions(args[at+1]),...args.slice(at)];const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err=(err+c).slice(-24000));child.once('error',reject);child.once('close',code=>code===0||probe&&code===1?resolve(probe?err:out):reject(Error(err)));});}
function hash(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function median(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}
function drain(url){return new Promise((resolve,reject)=>{const req=http.get(url,res=>{let bytes=0;res.on('data',chunk=>bytes+=chunk.length);res.once('end',()=>resolve(bytes));res.once('error',reject);});req.once('error',reject);});}
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'cut-export-benchmark-')),servers=[createMediaSource({highWaterMark:64*1024}),createMediaSource()],result={transport:{},export:{},verifiedOutputs:0};
try{
 const raw=path.join(root,'transport.bin'),fd=fs.openSync(raw,'w');fs.ftruncateSync(fd,128*1024*1024);fs.closeSync(fd);
 const urls=await Promise.all(servers.map(s=>s.select(raw))),transport=[[],[]];
 for(let round=0;round<4;round++)for(const which of round%2?[1,0]:[0,1]){const start=performance.now();assert.equal(await drain(urls[which]),128*1024*1024);if(round)transport[which].push(performance.now()-start);}
 result.transport={bytes:128*1024*1024,baselineMs:median(transport[0]),optimizedMs:median(transport[1])};
 const video=path.join(root,'fixture.mp4');
 await run(ffmpeg,['-hide_banner','-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=18','-f','lavfi','-i','sine=frequency=440:duration=18','-f','lavfi','-i','sine=frequency=880:duration=18','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-preset','ultrafast','-crf','18','-g','60','-bf','2','-c:a','aac',video]);
 const mkv=path.join(root,'fixture.mkv'),silent=path.join(root,'silent.mp4');
 await run(ffmpeg,['-v','error','-y','-i',video,'-map','0','-c','copy',mkv]);
 await run(ffmpeg,['-v','error','-y','-i',video,'-map','0:v','-c','copy',silent]);
 const timings=[[],[]];
 for(const file of [video,mkv,silent]){
  const inputs=await Promise.all(servers.map(s=>s.select(file)));
  const info=await run(ffprobe,sourceInfoArgs(inputs[1]));const metadata=parseSourceInfo(info);
  assert.equal(metadata.audioCodec,file===silent?undefined:'aac');
  const partList=[{start:0,end:3.137},{start:3.137,end:11.467},{start:11.467,end:metadata.duration}];
  for(let round=0;round<3;round++){
  const files=[[],[]];
  for(const which of round%2?[1,0]:[0,1]){const start=performance.now();
   if(which===0){await run(ffmpeg,['-hide_banner','-nostdin','-i',inputs[which]],true);await run(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1','-i',inputs[which]]);}
   else await run(ffprobe,sourceInfoArgs(inputs[which]));
   for(let i=0;i<partList.length;i++){const output=path.join(root,which+'-'+path.basename(file)+'-'+i+path.extname(file));await run(ffmpeg,videoArgs(inputs[which],partList[i],output));files[which].push(output);
    await run(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1','-i',output]);
    if(metadata.audioCodec){const audio=output+'.aac';await run(ffmpeg,audioArgs(output,audio));files[which].push(audio);}
   }timings[which].push(performance.now()-start);
  }
  for(let i=0;i<files[0].length;i++){if(path.extname(files[0][i])==='.mkv'){const signature=async file=>JSON.parse(await run(ffprobe,['-v','error','-show_packets','-show_data_hash','sha256','-show_entries','packet=stream_index,pts,dts,duration,size,data_hash:format=duration:stream=codec_type,codec_name','-of','json','-i',file]));assert.deepEqual(await signature(files[0][i]),await signature(files[1][i]),'Packet or timing changed');}else assert.equal(hash(files[0][i]),hash(files[1][i]),'Export changed: '+files[0][i]);result.verifiedOutputs++;}
  }
 }
 result.export={fixtureBytes:fs.statSync(video).size,baselineMs:timings[0],optimizedMs:timings[1]};
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{for(const server of servers)server.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
