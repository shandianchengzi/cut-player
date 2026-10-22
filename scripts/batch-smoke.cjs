const {_electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const watchdog=setTimeout(()=>{console.error('Batch smoke exceeded 120 seconds');process.exit(1);},120000);watchdog.unref();
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cut-batch-')),output=path.join(root,'exports');fs.mkdirSync(output);
 const a=path.join(root,'video_20261017_185251.mp4'),b=path.join(root,'video_20261017_191151.mp4'),ffmpeg=require('ffmpeg-static');
 for(const [file,duration] of [[a,8],[b,12]])execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:size=64x64:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t',String(duration),'-c:v','libx264','-g','10','-pix_fmt','yuv420p','-c:a','aac',file],{windowsHide:true});
 const exe=process.env.CUT_PLAYER_PACKAGED_EXE||require('electron'),prefix=process.env.CUT_PLAYER_PACKAGED_EXE?[]:[path.resolve(__dirname,'..')];
 const app=await _electron.launch({executablePath:exe,args:[...(process.platform==='linux'?['--no-sandbox','--ozone-platform=headless']:[]),...prefix],env:{...process.env,CUT_PLAYER_TEST_PROFILE:path.join(root,'profile'),CUT_PLAYER_TEST_OUTPUT:output}});
 try{console.log('BATCH: launch');const p=await app.firstWindow(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.locator('#batchOpen').click();await p.locator('#batchFiles').setInputFiles([a,b]);await p.waitForFunction(()=>document.querySelector('#batchList').children.length===2);
  console.log('BATCH: imported');assert.match(await p.locator('#batchList').textContent(),/00:00:08.000/);assert.match(await p.locator('#batchList').textContent(),/第 3–4 行/);
  await p.locator('#batchText').fill('breakpoints:00:04.000\nnames:甲一,甲二\nbreakpoints:00:13.000\nnames:乙一,乙二');assert.equal(await p.locator('#batchStart').isDisabled(),true);assert.match(await p.locator('#batchErrors').textContent(),/第 3 行.*超过/);
  await p.locator('#batchErrors button').click();assert.equal(await p.evaluate(()=>document.querySelector('#batchText').selectionStart),('breakpoints:00:04.000\nnames:甲一,甲二\n').length);
  await p.locator('#batchText').fill('breakpoints:00:04.000\nnames:甲一,甲二\nbreakpoints:00:06.000\nnames:乙一,乙二');assert.equal(await p.locator('#batchStart').isDisabled(),false);
  console.log('BATCH: validated');await p.locator('#batchStart').click();await p.waitForFunction(()=>document.querySelector('#batchJobs').children.length===2);await p.locator('#batchClose').click();await p.locator('#batchOpen').click();await p.locator('#batchFiles').setInputFiles(a);await p.waitForFunction(()=>document.querySelector('#batchList').children.length===1);await p.locator('#batchText').fill('breakpoints:\nnames:追加任务');await p.locator('#batchStart').click();
  const deadline=Date.now()+60000;let settled;while(Date.now()<deadline){settled=await p.evaluate(()=>window.desktop.queueState());if(settled.length===3&&settled.every(j=>!['waiting','running'].includes(j.status)))break;await new Promise(r=>setTimeout(r,100));}assert.deepEqual(settled.map(j=>({status:j.status,error:j.error})),[{status:'done',error:undefined},{status:'done',error:undefined},{status:'done',error:undefined}]);
  console.log('BATCH: exports completed');assert.equal(fs.readdirSync(output).filter(f=>f.endsWith('.mp4')).length,5);assert.equal(fs.readdirSync(output).filter(f=>f.endsWith('.aac')).length,5);
  console.log('BATCH: output counts',JSON.stringify(fs.readdirSync(output)));
  // Existing names must fail before enqueue, preserving the draft and showing an actionable message.
  await p.locator('#batchFiles').setInputFiles(a);await p.waitForFunction(()=>document.querySelector('#batchList').children.length===1);console.log('BATCH: collision imported');await p.locator('#batchText').fill('breakpoints:\nnames:甲一');await p.locator('#batchStart').click();console.log('BATCH: collision submitted');await p.waitForFunction(()=>document.querySelector('#batchSummary').textContent.includes('第 2 行'));assert.equal((await p.evaluate(()=>window.desktop.queueState())).length,3);
  // Full-source audio does not depend on notes, split points, or the audio checkbox.
  const opus=path.join(root,'原名 Opus.mkv'),silent=path.join(root,'无音轨.mp4');
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=red:size=64x64:rate=10','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','4','-c:v','libx264','-c:a','libopus',opus],{windowsHide:true});
  execFileSync(ffmpeg,['-v','error','-i',a,'-map','0:v','-c','copy',silent],{windowsHide:true});
  await p.locator('#batchFiles').setInputFiles([b,opus,silent]);await p.waitForFunction(()=>document.querySelector('#batchList').children.length===4);
  const invalidDraft='不是有效时间表';await p.locator('#batchText').fill(invalidDraft);await p.locator('#batchAudio').uncheck();
  assert.equal(await p.locator('#batchStart').isDisabled(),true);assert.equal(await p.locator('#batchOriginalAudio').isDisabled(),false);
  await p.locator('#batchOriginalAudio').click();
  const audioDeadline=Date.now()+60000;let completedAudioJobs=[];while(Date.now()<audioDeadline){completedAudioJobs=await p.evaluate(()=>window.desktop.queueState());if(completedAudioJobs.length===7&&completedAudioJobs.every(j=>!['waiting','running'].includes(j.status)))break;await new Promise(r=>setTimeout(r,100));}
  const audioJobs=completedAudioJobs.slice(3);
  assert.deepEqual(audioJobs.map(j=>j.status),['done','done','done','failed']);assert.match(audioJobs[3].error,/没有音频轨道/);
  assert.ok(audioJobs.slice(0,3).every(j=>j.result.audioOnly&&j.result.count===0&&j.result.audioCount===1));
  assert.equal(await p.locator('#batchText').inputValue(),invalidDraft);assert.equal(await p.locator('#batchList li').count(),4);
  assert.equal(fs.readdirSync(output).filter(f=>f.endsWith('.mp4')).length,5);assert.equal(fs.readdirSync(output).filter(f=>f.endsWith('.aac')).length,7);assert.equal(fs.readdirSync(output).filter(f=>f.endsWith('.mka')).length,1);
  const ffprobe=path.join(path.dirname(ffmpeg),'ffprobe.exe'),audioPackets=file=>JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash','-of','json',file],{windowsHide:true,maxBuffer:8*1024*1024})).packets.map(p=>p.data_hash);
  for(const [index,file]of [a,b,opus].entries()){
   const suffix=index===2?'.mka':'.aac',actual=path.join(output,path.parse(file).name+suffix),reference=path.join(root,'reference-'+index+suffix);
   execFileSync(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-c','copy','-vn',reference],{windowsHide:true});
   assert.deepEqual(audioPackets(actual),audioPackets(reference),'complete original audio packet payloads must match stream-copy reference');
   const duration=Number(execFileSync(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',actual],{windowsHide:true}).toString().trim());
   assert.ok(Math.abs(duration-[8,12,4][index])<.2,'whole source audio duration must be preserved');
  }
  await p.locator('#batchOriginalAudio').click();await p.waitForFunction(()=>document.querySelector('#batchSummary').textContent.includes('输出名称冲突'));assert.equal((await p.evaluate(()=>window.desktop.queueState())).length,7);
  console.log('PASS: original-name full audio button ignores invalid notes/unchecked segment audio, AAC + Opus packet equality and full duration, no video output, retained draft, silent-file isolation and overwrite protection');
  await p.screenshot({path:path.join(root,'batch-panel.png')});assert.deepEqual(errors,[]);await p.locator('#batchClear').click();await p.waitForFunction(()=>document.querySelector('#batchJobs').children.length===0);
  console.log('PASS: multi-import durations, two-line bulk paste, line-number validation, background queue, append while executing, 5 real stream-copy videos and AAC outputs, collision protection');
 }catch(e){console.error('BATCH failure:',e);try{console.error('BATCH state:',await app.windows()[0].evaluate(async()=>({jobs:await window.desktop.queueState(),summary:document.querySelector('#batchSummary').textContent,errors:document.querySelector('#batchErrors').textContent})));}catch{}throw e;}finally{const windows=app.windows();if(windows[0]){try{await windows[0].evaluate(async()=>{for(const job of await window.desktop.queueState())if(['waiting','running'].includes(job.status))await window.desktop.queueCancel(job.id);});for(let i=0;i<50;i++){const jobs=await windows[0].evaluate(()=>window.desktop.queueState());if(jobs.every(j=>!['waiting','running'].includes(j.status)))break;await new Promise(r=>setTimeout(r,100));}}catch{}}const child=app.process();let closeTimer;try{await Promise.race([app.close(),new Promise(resolve=>{closeTimer=setTimeout(()=>{child?.kill();resolve();},5000);})]);}finally{clearTimeout(closeTimer);clearTimeout(watchdog);}try{fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch(e){console.warn('Temporary profile cleanup:',e.message);}}
})().catch(e=>{console.error(e);process.exit(1);});
