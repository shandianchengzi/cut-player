const {app,BrowserWindow,ipcMain,clipboard,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {validate,upgradeConfig}=require('./model.cjs'),{parsePlan,videoArgs,audioArgs}=require('./export.cjs');
if(process.env.CUT_PLAYER_TEST_PROFILE)app.setPath('userData',process.env.CUT_PLAYER_TEST_PROFILE);
let analysisController,mainWindow;
const {videoPaths}=require('./open-files.cjs');
const mediaSource=require('./media-source.cjs').createMediaSource();
const pendingFiles=videoPaths(process.argv.slice(process.defaultApp?2:1),process.cwd());
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
app.on('second-instance',(_event,argv,cwd)=>{pendingFiles.push(...videoPaths(argv.slice(process.defaultApp?2:1),cwd));if(mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();mainWindow.webContents.send('open-files-pending');}});

app.whenReady().then(()=>{if(!primary)return;
 const configPath=path.join(app.getPath('userData'),'config.json');
 let state={audio:true};try{state=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{}
 if(state.config)state.config=upgradeConfig(state.config);
 if(state.seekDefaultVersion!==2){if(state.config?.seek===5)state.config.seek=1;state.seekDefaultVersion=2;}
 let savedConfig;try{savedConfig=fs.readFileSync(configPath,'utf8');}catch{}
 function save(){const content=JSON.stringify(state,null,2);if(content===savedConfig)return;fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath+'.tmp',content);fs.renameSync(configPath+'.tmp',configPath);savedConfig=content;}
 const ffmpeg=app.isPackaged?path.join(process.resourcesPath,'ffmpeg','ffmpeg.exe'):require('ffmpeg-static');
 const ffprobe=app.isPackaged?path.join(process.resourcesPath,'ffmpeg','ffprobe.exe'):path.join(path.dirname(ffmpeg),'ffprobe.exe');
 const {analyzeMedia}=require('./analyze.cjs');
 const win=new BrowserWindow({width:1180,height:760,minWidth:850,minHeight:560,backgroundColor:'#10151f',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 mainWindow=win;
 let input,inputUrl,busy=false;
 const {progressParser,localInputOptions}=require('./ffmpeg-progress.cjs');
 const {sourceInfoArgs,parseSourceInfo}=require('./export-info.cjs');
 const liveTargets=new Set();
 const exportLog=path.join(app.getPath('userData'),'exports.log');
 function logExport(text){try{fs.mkdirSync(path.dirname(exportLog),{recursive:true});if(fs.existsSync(exportLog)&&fs.statSync(exportLog).size>1000000)fs.renameSync(exportLog,exportLog+'.previous');fs.appendFileSync(exportLog,new Date().toISOString()+' '+text+'\n');}catch{}}
 function requireFile(file){if(!file)throw Error('请先打开本地视频');try{if(!fs.statSync(file).isFile())throw Error();}catch{throw Error('源视频文件不存在（可能已被删除或移动），请重新打开视频');}}
 function requireInput(){requireFile(input);}
 require('./updates.cjs').installUpdates(win,()=>busy||queue.busy,save);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 function handle(channel,fn){ipcMain.handle(channel,(e,...args)=>{if(e.sender!==win.webContents)throw Error('无效调用');return fn(...args);});}
 handle('take-open-files',()=>pendingFiles.splice(0));
 handle('copy-text',text=>{if(typeof text==='string')clipboard.writeText(text);});
 handle('load-config',()=>({...state,path:configPath}));
 handle('save-config',patch=>{if(patch.config!==undefined){if(!validate(patch.config))throw Error('配置无效');state.config=patch.config;}if(patch.nameList!==undefined){if(!Array.isArray(patch.nameList)||patch.nameList.length>2000||patch.nameList.some(x=>typeof x!=='string'||x.length>200000||/[\r\n,]/.test(x)))throw Error('名称列表无效');state.nameList=patch.nameList;}if(typeof patch.fine==='boolean')state.fine=patch.fine;if(typeof patch.audio==='boolean')state.audio=patch.audio;save();return true;});
 handle('describe-inputs',files=>{if(!Array.isArray(files)||files.length>200)throw Error('一次最多打开 200 个视频');return files.map(file=>{try{if(typeof file!=='string'||!fs.statSync(file).isFile())throw Error();const resolved=path.resolve(file);return {path:resolved,name:path.basename(resolved)};}catch{return {error:'视频文件不存在或无法打开：'+String(file)};}});});
 handle('clear-input',()=>{analysisController?.abort();input=undefined;inputUrl=undefined;return true;});
 handle('set-input',async file=>{if(typeof file!=='string'||!fs.statSync(file).isFile())throw Error('视频路径无效');analysisController?.abort();inputUrl=await mediaSource.select(file);input=file;return {url:inputUrl,name:path.basename(file)};});
 handle('input-status',()=>{let exists=false;try{exists=!!input&&fs.statSync(input).isFile();}catch{}return {url:inputUrl,exists};});
 handle('analyze-media',async token=>{requireInput();analysisController?.abort();analysisController=new AbortController();const selected=input,controller=analysisController;const sent=new Set();const result=await analyzeMedia(ffmpeg,ffprobe,input,analysisController.signal,part=>{if(input===selected&&!controller.signal.aborted&&!win.isDestroyed()){for(const key of ['peaks','frames'])if(part[key])sent.add(key);win.webContents.send('media-update',{...part,token});}},path.join(app.getPath('userData'),'analysis-cache'),inputUrl);for(const key of sent)delete result[key];return result;});
 handle('cancel-export',()=>{if(busy){legacyController?.abort();return true;}return false;});
 async function executeExport(text,file,options={}){
  let activeChild,cancelRequested=false;
  const abort=()=>{cancelRequested=true;activeChild?.kill();};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
 function run(args,probe=false,onProgress,executable=ffmpeg){return new Promise((resolve,reject)=>{
  if(cancelRequested){reject(Error('已停止切割'));return;}
  const at=args.indexOf('-i');if(at>=0)args=[...args.slice(0,at),...localInputOptions(args[at+1]),...args.slice(at)];
  if(onProgress)args=['-progress','pipe:1','-stats_period','1','-nostats',...args];
  let log='',stdout='',finished=false;const runStarted=Date.now();const child=spawn(executable,args,{windowsHide:true,shell:false,stdio:['ignore',onProgress||executable===ffprobe?'pipe':'ignore','pipe']});activeChild=child;
  if(onProgress)child.stdout.on('data',progressParser(onProgress));
  else if(executable===ffprobe)child.stdout.on('data',chunk=>stdout=(stdout+chunk.toString()).slice(-8192));
  child.stderr.on('data',chunk=>log=(log+chunk.toString()).slice(-24000));
  function done(error){if(finished)return;finished=true;if(activeChild===child)activeChild=undefined;logExport((error?error.message:(executable===ffprobe?'FFprobe 完成':'FFmpeg 完成'))+' · 耗时 '+((Date.now()-runStarted)/1000).toFixed(3)+' 秒\n'+log);if(error)reject(error);else resolve(executable===ffprobe?stdout:log);}
  child.once('error',e=>done(e));child.once('close',code=>done(cancelRequested?Error('已停止切割'):code===0||probe?null:Error('FFmpeg 导出失败：'+log.slice(-1800))));
 });}
 async function readDuration(file){const value=await run(['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1','-i',file],false,undefined,ffprobe);const seconds=Number(value.trim());if(!value.trim()||!Number.isFinite(seconds)||seconds<=0)throw Error('无法核对视频时长：'+file);return seconds;}
  const progress=text=>{if(!win.isDestroyed()){if(options.progress)options.progress(text);else win.webContents.send('export-progress',text);}};
  const exportInput=typeof file==='string'?file:input;requireFile(exportInput);let folder;const claimed=[];const exportSource=require('./media-source.cjs').createMediaSource();let exportUrl;
  logExport('开始切割 · 版本 '+app.getVersion()+' · 源文件 '+exportInput);
  try{
   exportUrl=await exportSource.select(exportInput);
   const {duration:sourceDuration,audioCodec}=parseSourceInfo(await run(sourceInfoArgs(exportUrl),false,undefined,ffprobe));const plan=parsePlan(text,sourceDuration);const audio=options.audio??state.audio;
   let parent=options.folder||process.env.CUT_PLAYER_TEST_OUTPUT;
   if(!parent){const choice=await dialog.showOpenDialog(win,{title:'选择片段输出目录',properties:['openDirectory','createDirectory']});if(choice.canceled)return {canceled:true};parent=choice.filePaths[0];}
   if(cancelRequested)throw Error('已停止切割');folder=parent;
   const ext=path.extname(exportInput).toLowerCase()||'.mp4';let audioCount=0,videoBytes=0,videoDuration=0;const sourceBytes=fs.statSync(exportInput).size;const size=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(2)+' MB';
   const time=n=>{const ms=Math.round(n*1000);return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
   const durationStatus=current=>' · 已导出视频总时长 '+time(videoDuration+current)+' / 总时长 '+time(sourceDuration);
   const targets=plan.flatMap(part=>[path.join(folder,part.name+ext),...(audio&&audioCodec?[path.join(folder,part.name+(audioCodec==='aac'?'.aac':'.mka'))]:[])]);
   if(targets.some(target=>path.resolve(target).toLowerCase()===path.resolve(exportInput).toLowerCase()))throw Error('输出文件与源视频重名，请修改 names 或选择其他目录');
   for(const target of targets){const key=path.resolve(target).toLowerCase();if(liveTargets.has(key)||(!options.batch&&queue.jobs.some(j=>['waiting','running'].includes(j.status)&&j.targets.includes(key))))throw Error('输出名称与队列中的任务冲突：'+path.basename(target));}
   const existing=targets.filter(target=>fs.existsSync(target));if(existing.length){if(options.batch)throw Error('输出文件已存在，请修改 names 或更换输出目录：'+path.basename(existing[0]));const choice=await dialog.showMessageBox(win,{type:'question',buttons:['取消','覆盖'],defaultId:0,cancelId:0,message:`所选目录有 ${existing.length} 个同名文件，是否覆盖？`});if(choice.response!==1)return {canceled:true};}

   for(const target of targets){const key=path.resolve(target).toLowerCase();liveTargets.add(key);claimed.push(key);}
   for(let i=0;i<plan.length;i++){
    const part=plan[i],output=path.join(folder,part.name+ext);
    progress(`正在导出 ${i+1}/${plan.length}：${part.name} · 已导出视频 ${size(videoBytes)} / 原视频 ${size(sourceBytes)}`+durationStatus(0));
    requireFile(exportInput);
    const started=Date.now();let measured={seconds:0,bytes:0,speed:''},lastAdvance=started,lastBytes=0,lastTime=0;
    const report=()=>{let written=0;try{written=fs.statSync(output).size;}catch{}written=Math.max(written,measured.bytes);if(written!==lastBytes||measured.seconds!==lastTime){lastAdvance=Date.now();lastBytes=written;lastTime=measured.seconds;}
     const elapsed=Math.floor((Date.now()-started)/1000),length=part.end-part.start,percent=Math.min(99.9,measured.seconds/length*100);
     progress(`正在导出 ${i+1}/${plan.length}：${part.name} · 本段 ${percent.toFixed(1)}% / ${size(written)} · 已导出视频 ${size(videoBytes+written)} / 原视频 ${size(sourceBytes)}`+durationStatus(Math.min(length,measured.seconds))+` · 已用 ${elapsed} 秒`+(measured.ended?' · FFmpeg 已报告媒体输出结束，等待进程退出':measured.seconds>=length*.999?' · 已到本段末尾，等待 FFmpeg 完成写入':'')+(Date.now()-lastAdvance>=30000?' · 30 秒未观察到写入或时间推进，FFmpeg 仍在运行':'')+(measured.speed?' · '+measured.speed:''));
    };
    const timer=setInterval(report,1000);try{await run(videoArgs(exportUrl,part,output),false,data=>{measured=data;if(data.ended)report();});}finally{clearInterval(timer);}videoBytes+=fs.statSync(output).size;progress(`视频写入完成 ${i+1}/${plan.length}：${part.name} · 正在核对文件时长`+durationStatus(0));const actualDuration=await readDuration(output);videoDuration+=actualDuration;logExport('片段时长 · '+part.name+' · '+actualDuration+' 秒');progress(`已导出视频 ${i+1}/${plan.length} · 视频总大小 ${size(videoBytes)} / 原视频 ${size(sourceBytes)}`+durationStatus(0));
    if(audio&&audioCodec){const audioOutput=path.join(folder,part.name+(audioCodec==='aac'?'.aac':'.mka'));await run(audioArgs(output,audioOutput),false,data=>progress(`正在提取音频 ${i+1}/${plan.length}：${part.name} · ${size(data.bytes)} · 视频总大小 ${size(videoBytes)} / 原视频 ${size(sourceBytes)}`+durationStatus(0)));audioCount++;}
   }
   logExport('导出核对 · 视频总时长 '+videoDuration+' 秒 / 原视频 '+sourceDuration+' 秒 · 差值 '+(videoDuration-sourceDuration)+' 秒');
   return {folder,count:plan.length,audioCount,videoBytes,sourceBytes,videoDuration,sourceDuration,noAudio:audio&&!audioCodec};
  }catch(e){logExport('切割终止：'+e.message);try{requireFile(exportInput);}catch(missing){e=missing;}if(folder)e.message+='\n已完成或未完成的文件保留在：'+folder;e.message+='\n诊断日志：'+exportLog;throw e;}finally{for(const target of claimed)liveTargets.delete(target);exportSource.close();options.signal?.removeEventListener('abort',abort);}
 }
 let legacyController;
 handle('export-segments',async(text,file)=>{if(busy)throw Error('正在导出');busy=true;legacyController=new AbortController();try{return await executeExport(text,file,{signal:legacyController.signal});}finally{busy=false;legacyController=undefined;queue.pump();}});

 const {TaskQueue,autoConcurrency}=require('./task-queue.cjs');
 const {parseBatch}=require('./batch-plan.cjs');
 let previousCpu;
 function capacity(){const os=require('node:os'),cores=os.cpus();const current=cores.reduce((s,c)=>({idle:s.idle+c.times.idle,total:s.total+Object.values(c.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});const delta=previousCpu?current.total-previousCpu.total:0;const load=delta>0?1-(current.idle-previousCpu.idle)/delta:0;previousCpu=current;return Math.max(0,autoConcurrency({load})-(busy?1:0));}
 const queue=new TaskQueue((job,progress)=>executeExport(job.text,job.path,{folder:job.folder,audio:job.audio,batch:true,signal:job.controller.signal,progress}),jobs=>{if(!win.isDestroyed())win.webContents.send('queue-update',jobs);},capacity);
 const imported=new Map();
 function probeFile(file){return new Promise((resolve,reject)=>{const child=spawn(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{windowsHide:true,shell:false});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('读取时长超时'));},30000);child.stdout.on('data',b=>output=(output+b).slice(-8192));child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);const duration=Number(output.trim());if(code!==0||!Number.isFinite(duration)||duration<=0)reject(Error('无法读取视频时长'));else resolve(duration);});});}
 handle('queue-import',async files=>{if(!Array.isArray(files)||!files.length||files.length>200)throw Error('请选择 1–200 个视频');const result=[];for(const file of files){try{if(typeof file!=='string')throw Error('视频路径无效');requireFile(file);const resolved=path.resolve(file),duration=await probeFile(resolved),info={path:resolved,name:path.basename(resolved),duration};imported.set(resolved,info);result.push(info);}catch(e){result.push({path:typeof file==='string'?file:'',name:path.basename(String(file)),error:e.message});}}return result;});
 handle('queue-state',()=>queue.snapshot());
 handle('queue-cancel',id=>queue.cancel(id));
 handle('queue-clear',()=>queue.clear());
 handle('queue-add',async request=>{
  if(!request||!Array.isArray(request.paths)||request.paths.length<1||request.paths.length>200)throw Error('请选择视频');
  const files=request.paths.map(p=>{const info=imported.get(p);if(!info)throw Error('请重新导入视频');requireFile(p);return info;});
  const checked=parseBatch(request.text,files,parsePlan);if(checked.errors.length)throw Error(checked.errors.map(e=>'第 '+e.line+' 行：'+e.message).join('\n'));
  const audio=!!request.audio;let folder=process.env.CUT_PLAYER_TEST_OUTPUT;
  if(!folder){const choice=await dialog.showOpenDialog(win,{title:'选择批量切割输出目录',properties:['openDirectory','createDirectory']});if(choice.canceled)return {canceled:true};folder=choice.filePaths[0];}
  // Reserve names for both video and possible audio outputs before any worker starts.
  const reserved=new Set(liveTargets);for(const job of queue.jobs.filter(j=>['waiting','running'].includes(j.status)))for(const target of job.targets)reserved.add(target);
  const items=checked.plans.map((p,i)=>{const ext=path.extname(p.path).toLowerCase()||'.mp4',targets=[];for(const part of p.plan){for(const suffix of [ext,...(audio?['.aac','.mka']:[])]){const target=path.resolve(folder,part.name+suffix).toLowerCase();if(reserved.has(target)||fs.existsSync(path.join(folder,part.name+suffix)))throw Error('第 '+(i*2+2)+' 行：输出名称冲突或文件已存在：'+part.name+suffix);if(files.some(f=>path.resolve(f.path).toLowerCase()===target))throw Error('输出文件不能覆盖源视频');reserved.add(target);targets.push(target);}}return {...p,name:files[i].name,folder,audio,targets};});
  return {ids:queue.add(items)};
 });
 win.on('close',e=>{if(busy||queue.busy){e.preventDefault();dialog.showMessageBox(win,{type:'info',message:'正在导出，请等待任务结束后关闭。'});}});
 win.loadFile(path.join(__dirname,'index.html'));
});
app.on('before-quit',()=>{analysisController?.abort();mediaSource.close();});app.on('window-all-closed',()=>app.quit());
