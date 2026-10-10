const {app,BrowserWindow,ipcMain,clipboard,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {validate,upgradeConfig}=require('./model.cjs'),{parsePlan,videoArgs,audioArgs}=require('./export.cjs');
if(process.env.CUT_PLAYER_TEST_PROFILE)app.setPath('userData',process.env.CUT_PLAYER_TEST_PROFILE);
let activeChild,analysisController,mainWindow;
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
 function requireInput(){if(!input)throw Error('请先打开本地视频');try{if(!fs.statSync(input).isFile())throw Error();}catch{throw Error('源视频文件不存在（可能已被删除或移动），请重新打开视频');}}
 require('./updates.cjs').installUpdates(win,()=>busy,save);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 function handle(channel,fn){ipcMain.handle(channel,(e,...args)=>{if(e.sender!==win.webContents)throw Error('无效调用');return fn(...args);});}
 handle('take-open-files',()=>pendingFiles.splice(0));
 handle('copy-text',text=>{if(typeof text==='string')clipboard.writeText(text);});
 handle('load-config',()=>({...state,path:configPath}));
 handle('save-config',patch=>{if(patch.config!==undefined){if(!validate(patch.config))throw Error('配置无效');state.config=patch.config;}if(patch.nameList!==undefined){if(!Array.isArray(patch.nameList)||patch.nameList.length>2000||patch.nameList.some(x=>typeof x!=='string'||x.length>200000||/[\r\n,]/.test(x)))throw Error('名称列表无效');state.nameList=patch.nameList;}if(typeof patch.fine==='boolean')state.fine=patch.fine;if(typeof patch.audio==='boolean')state.audio=patch.audio;save();return true;});
 handle('set-input',async file=>{if(busy)throw Error('请等待导出完成');if(typeof file!=='string'||!fs.statSync(file).isFile())throw Error('视频路径无效');analysisController?.abort();inputUrl=await mediaSource.select(file);input=file;return {url:inputUrl,name:path.basename(file)};});
 handle('input-status',()=>{let exists=false;try{exists=!!input&&fs.statSync(input).isFile();}catch{}return {url:inputUrl,exists};});
 handle('analyze-media',async token=>{requireInput();analysisController?.abort();analysisController=new AbortController();const selected=input,controller=analysisController;const sent=new Set();const result=await analyzeMedia(ffmpeg,ffprobe,input,analysisController.signal,part=>{if(input===selected&&!controller.signal.aborted&&!win.isDestroyed()){for(const key of ['peaks','frames'])if(part[key])sent.add(key);win.webContents.send('media-update',{...part,token});}},path.join(app.getPath('userData'),'analysis-cache'),inputUrl);for(const key of sent)delete result[key];return result;});
 function run(args,probe=false){return new Promise((resolve,reject)=>{let log='';const child=spawn(ffmpeg,args,{windowsHide:true,shell:false,stdio:['ignore','ignore','pipe']});activeChild=child;child.stderr.on('data',chunk=>log=(log+chunk.toString()).slice(-24000));child.once('error',reject);child.once('close',code=>{activeChild=undefined;if(code===0||probe)resolve(log);else reject(Error('FFmpeg 导出失败：'+log.slice(-1800)));});});}
 handle('export-segments',async text=>{
  if(busy)throw Error('正在导出');requireInput();busy=true;let folder;
  try{
   const info=await run(['-hide_banner','-nostdin','-i',inputUrl],true);
   const d=/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info);const duration=d?Number(d[1])*3600+Number(d[2])*60+Number(d[3]):NaN;
   const plan=parsePlan(text,duration);const audioCodec=/Audio:\s*([\w]+)/.exec(info)?.[1];const audio=state.audio;
   let parent=process.env.CUT_PLAYER_TEST_OUTPUT;
   if(!parent){const choice=await dialog.showOpenDialog(win,{title:'选择片段输出目录',properties:['openDirectory','createDirectory']});if(choice.canceled)return {canceled:true};parent=choice.filePaths[0];}
   folder=parent;
   const ext=path.extname(input).toLowerCase()||'.mp4';let audioCount=0,videoBytes=0;const sourceBytes=fs.statSync(input).size;const size=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(2)+' MB';
   const targets=plan.flatMap(part=>[path.join(folder,part.name+ext),...(audio&&audioCodec?[path.join(folder,part.name+(audioCodec==='aac'?'.aac':'.mka'))]:[])]);
   if(targets.some(target=>path.resolve(target).toLowerCase()===path.resolve(input).toLowerCase()))throw Error('输出文件与源视频重名，请修改 names 或选择其他目录');
   const existing=targets.filter(target=>fs.existsSync(target));if(existing.length){const choice=await dialog.showMessageBox(win,{type:'question',buttons:['取消','覆盖'],defaultId:0,cancelId:0,message:`所选目录有 ${existing.length} 个同名文件，是否覆盖？`});if(choice.response!==1)return {canceled:true};}

   for(let i=0;i<plan.length;i++){
    const part=plan[i],output=path.join(folder,part.name+ext);
    win.webContents.send('export-progress',`正在导出 ${i+1}/${plan.length}：${part.name} · 已导出视频 ${size(videoBytes)} / 原视频 ${size(sourceBytes)}`);
    requireInput();await run(videoArgs(inputUrl,part,output));videoBytes+=fs.statSync(output).size;win.webContents.send('export-progress',`已导出视频 ${i+1}/${plan.length} · 视频总大小 ${size(videoBytes)} / 原视频 ${size(sourceBytes)}`);
    if(audio&&audioCodec){const audioOutput=path.join(folder,part.name+(audioCodec==='aac'?'.aac':'.mka'));await run(audioArgs(output,audioOutput));audioCount++;}
   }
   return {folder,count:plan.length,audioCount,videoBytes,sourceBytes,noAudio:audio&&!audioCodec};
  }catch(e){try{requireInput();}catch(missing){e=missing;}if(folder)e.message+='\n已完成或未完成的文件保留在：'+folder;throw e;}finally{busy=false;}
 });
 win.on('close',e=>{if(busy){e.preventDefault();dialog.showMessageBox(win,{type:'info',message:'正在导出，请等待任务结束后关闭。'});}});
 win.loadFile(path.join(__dirname,'index.html'));
});
app.on('before-quit',()=>{activeChild?.kill();analysisController?.abort();mediaSource.close();});app.on('window-all-closed',()=>app.quit());
