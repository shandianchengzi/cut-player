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
  console.log('PASS: direct cross-source reordered stream-copy concat packet hashes/timestamps, no intermediate clips, Unicode/quotes, parameter mismatch, source protection, cancellation and cleanup');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
