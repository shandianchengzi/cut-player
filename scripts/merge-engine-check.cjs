const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {createMergeEngine}=require('../app/merge.cjs');
(async()=>{
 const ffmpeg=process.env.CUT_PLAYER_FFMPEG||require('ffmpeg-static'),ffprobe=process.env.CUT_PLAYER_FFPROBE||path.join(path.dirname(ffmpeg),'ffprobe.exe');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cut-merge-engine-')),output=path.join(root,'outputs'),temp=path.join(root,'temp');fs.mkdirSync(output);fs.mkdirSync(temp);
 const a=path.join(root,"甲 # 'source.mp4"),b=path.join(root,'乙 source.mp4'),bad=path.join(root,'different.mp4');
 try{
  for(const [file,color,size]of [[a,'red','64x64'],[b,'blue','64x64'],[bad,'green','128x64']])execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c='+color+':size='+size+':rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-g','1','-bf','0','-pix_fmt','yuv420p','-c:a','aac',file],{windowsHide:true});
  const before=fs.readFileSync(a),engine=createMergeEngine({ffmpeg,ffprobe,tempDir:temp});
  const listing=await engine.list([{path:a,text:'breakpoints:00:02,00:04\nnames:A1,A2,A3'},{path:b,text:'breakpoints:00:01,00:03\nnames:B1,B2,B3'}]);assert.deepEqual(listing.errors,[]);assert.equal(listing.groups.length,2);assert.equal(listing.groups[0].parts.length,3);
  const parts=[{file:a,start:2,end:4,name:'A2'},{file:b,start:1,end:3,name:'B2'},{file:a,start:0,end:1,name:'A1'}],request={name:'【合并】A2',parts,protectFiles:[a,b]};
  let reserved=0;const result=await engine.merge(request,{selectOutput:({name,ext})=>path.join(output,name+ext),claimOutput:()=>{reserved++;return()=>reserved--;}});assert.equal(reserved,0);assert.equal(result.count,3);assert.ok(Math.abs(result.duration-5)<.3);assert.deepEqual(fs.readdirSync(output),['【合并】A2.mp4']);assert.deepEqual(fs.readdirSync(temp),[]);
  // Independent direct concat reference; no intermediate media clips.
  const list=path.join(root,'reference.ffconcat'),expected=path.join(root,'reference.mp4');
  const quote=s=>"'"+s.replaceAll('\\','/').replaceAll("'","'\\''")+"'";
  fs.writeFileSync(list,'ffconcat version 1.0\n'+parts.map(p=>'file '+quote(p.file)+'\ninpoint '+p.start+'\noutpoint '+p.end+'\n').join(''));
  execFileSync(ffmpeg,['-v','error','-y','-vsync','0','-safe','0','-f','concat','-i',list,'-map','0:v?','-map','0:a?','-c','copy',expected],{windowsHide:true});
  const packets=file=>JSON.parse(execFileSync(ffprobe,['-v','error','-show_packets','-show_data_hash','sha256','-show_entries','packet=stream_index,pts,dts,duration,size,data_hash','-of','json',file],{windowsHide:true,maxBuffer:8*1024*1024})).packets;
  assert.deepEqual(packets(result.output),packets(expected));assert.deepEqual(fs.readFileSync(a),before);
  await assert.rejects(engine.merge(request,{selectOutput:()=>a,confirmOverwrite:async()=>true}),/不能覆盖源视频/);assert.deepEqual(fs.readFileSync(a),before);
  let asked=false;await assert.rejects(engine.merge({...request,parts:[parts[0],{file:bad,start:0,end:1,name:'bad'}]},{selectOutput:()=>{asked=true;return path.join(output,'bad.mp4');}}),/不兼容/);assert.equal(asked,false);
  const controller=new AbortController();await assert.rejects(engine.merge({...request,name:'stop'},{signal:controller.signal,selectOutput:()=>path.join(output,'stop.mp4'),progress:text=>{if(text.startsWith('正在无损合并 ·'))controller.abort();}}),/已停止合并/);assert.deepEqual(fs.readdirSync(temp),[]);

  // Real inter-frame footage: old inpoint/outpoint-only concat overlaps the preroll
  // and squeezes dozens of video timestamps onto the join while audio continues.
  const longA=path.join(root,'long A.mp4'),longB=path.join(root,'long B.mp4');
  for(const [file,hue]of [[longA,0],[longB,90]])execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30,hue=h='+hue,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx264','-g','90','-keyint_min','90','-sc_threshold','0','-bf','3','-pix_fmt','yuv420p','-c:a','aac',file],{windowsHide:true});
  const longResult=await engine.merge({name:'long GOP',parts:[{file:longA,start:0,end:4.5,name:'A'},{file:longB,start:7.5,end:10.5,name:'B'}]},{selectOutput:()=>path.join(output,'long.mp4')});
  assert.equal(longResult.requestedDuration,7.5);assert.equal(longResult.expectedDuration,12);
  const videoPackets=file=>JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','v:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts_time,dts_time,flags,data_hash','-of','json',file],{windowsHide:true,maxBuffer:8*1024*1024})).packets;
  const actualPackets=videoPackets(longResult.output),rangePackets=(file,start,end)=>videoPackets(file).filter(p=>Number(p.pts_time)>=start&&Number(p.pts_time)<end);
  const expectedPackets=[...rangePackets(longA,0,6),...rangePackets(longB,6,12)];assert.equal(actualPackets.length,expectedPackets.length);
  // Concat's H.264 auto-converter can insert SPS/PPS in key packets; all other
  // packet bytes must match, and every decoded frame (including keys) must match.
  actualPackets.forEach((p,i)=>{assert.equal(p.flags,expectedPackets[i].flags);if(!p.flags.includes('K'))assert.equal(p.data_hash,expectedPackets[i].data_hash);});
  const decodedHashes=file=>execFileSync(ffmpeg,['-v','error','-i',file,'-map','0:v:0','-f','framemd5','-'],{windowsHide:true,maxBuffer:8*1024*1024}).toString().split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
  assert.deepEqual(decodedHashes(longResult.output),[...decodedHashes(longA).slice(0,180),...decodedHashes(longB).slice(180,360)]);
  assert.ok(actualPackets.every((p,i)=>!i||Number(p.dts_time)>Number(actualPackets[i-1].dts_time)));
  const frames=JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',longResult.output],{windowsHide:true,maxBuffer:8*1024*1024})).frames.map(f=>Number(f.best_effort_timestamp_time));
  assert.equal(frames.length,360);assert.ok(frames.every((t,i)=>!i||t>frames[i-1]&&t-frames[i-1]<.034));
  const decoded=execFileSync(ffmpeg,['-v','error','-xerror','-i',longResult.output,'-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});assert.equal(decoded.length,0);
  const streamTimes=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-of','json',longResult.output],{windowsHide:true})).streams;
  assert.ok(Math.abs(Number(streamTimes[0].duration)-Number(streamTimes[1].duration))<.03);
  const audioPackets=file=>JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts_time,data_hash','-of','json',file],{windowsHide:true,maxBuffer:8*1024*1024})).packets;
  const audioCounts=new Map();for(const p of audioPackets(longResult.output))audioCounts.set(p.data_hash,(audioCounts.get(p.data_hash)||0)+1);
  for(const [file,start,end]of [[longA,0,6],[longB,6,12]])for(const p of audioPackets(file).filter(p=>Number(p.pts_time)>=start&&Number(p.pts_time)<end)){assert.ok(audioCounts.get(p.data_hash)>0,'expanded audio packet must be preserved');audioCounts.set(p.data_hash,audioCounts.get(p.data_hash)-1);}
  const short=await engine.merge({name:'short',parts:[{file:longA,start:.5,end:1.5}]},{selectOutput:()=>path.join(output,'short.mp4')});assert.equal(short.expectedDuration,3);assert.deepEqual(decodedHashes(short.output),decodedHashes(longA).slice(0,90));
  const exact=await engine.merge({name:'exact',parts:[{file:longA,start:3,end:6}]},{selectOutput:()=>path.join(output,'exact.mp4')});assert.equal(exact.expectedDuration,3);assert.deepEqual(decodedHashes(exact.output),decodedHashes(longA).slice(90,180));
  const contiguous=await engine.merge({name:'contiguous',parts:[{file:longA,start:0,end:1.5},{file:longA,start:1.5,end:7.5},{file:longA,start:7.5,end:12}]},{selectOutput:()=>path.join(output,'contiguous.mp4')});
  assert.equal(contiguous.expectedDuration,12);assert.equal(contiguous.count,3);assert.deepEqual(decodedHashes(contiguous.output),decodedHashes(longA));

  const silentFile=path.join(root,'silent.mp4');execFileSync(ffmpeg,['-v','error','-y','-i',longA,'-map','0:v','-c','copy',silentFile],{windowsHide:true});
  const silent=await engine.merge({name:'silent',parts:[{file:silentFile,start:.5,end:1.5}]},{selectOutput:()=>path.join(output,'silent.mp4')});assert.equal(silent.expectedDuration,3);assert.deepEqual(decodedHashes(silent.output),decodedHashes(longA).slice(0,90));
  const alignAbort=new AbortController();let alignOutput=false;await assert.rejects(engine.merge({name:'abort-align',parts:[{file:longA,start:.5,end:1.5}]},{signal:alignAbort.signal,selectOutput:()=>{alignOutput=true;return path.join(output,'abort-align.mp4');},progress:message=>{if(message==='正在核对合并范围…')alignAbort.abort();}}),/已停止合并/);assert.equal(alignOutput,false);assert.deepEqual(fs.readdirSync(temp),[]);
  // HEVC open GOP has CRA frames marked "key" that still reference outside
  // the requested range. Expand to closed random-access points or file edges.
  for(const open of [0,1]){
   const hevc=path.join(root,'hevc-'+open+'.mp4');
   execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x96:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx265','-x265-params','pools=1:frame-threads=1:keyint=90:min-keyint=90:scenecut=0:open-gop='+open+':log-level=error','-pix_fmt','yuv420p','-c:a','aac',hevc],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   const merged=await engine.merge({name:'hevc',parts:[{file:hevc,start:.5,end:4.5},{file:hevc,start:7.5,end:10.5}]},{selectOutput:()=>path.join(output,'hevc-'+open+'.mp4')});
   assert.equal(merged.expectedDuration,open?24:12);
   const reference=decodedHashes(hevc);
   const frameTimes=JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',merged.output],{windowsHide:true,maxBuffer:8*1024*1024})).frames.map(f=>Number(f.best_effort_timestamp_time));
   assert.ok(frameTimes.every((t,i)=>!i||t>frameTimes[i-1]&&t-frameTimes[i-1]<.034));
   assert.deepEqual(decodedHashes(merged.output),open?[...reference,...reference]:reference);
   execFileSync(ffmpeg,['-v','error','-xerror','-i',merged.output,'-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  }
  console.log('PASS: HEVC closed and open GOP: outward independent boundaries, full requested frame coverage, decode without reference errors');
  console.log('PASS: long GOP + B-frame joins: ordered original video packet hashes, 360 decoded frames with no held-frame gap, monotonic timestamps, A/V duration, outward short/exact/tail ranges and adjacent-range passthrough');
  console.log('PASS: direct cross-source reordered stream-copy concat packet hashes/timestamps, no intermediate clips, Unicode/quotes, parameter mismatch, source protection, cancellation and cleanup');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
