const {app,BrowserWindow,ipcMain,clipboard,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {validate,upgradeConfig}=require('./model.cjs'),{parsePlan,videoArgs,audioArgs}=require('./export.cjs');
if(process.env.CUT_PLAYER_TEST_PROFILE)app.setPath('userData',process.env.CUT_PLAYER_TEST_PROFILE);
let activeChild,analysisController;
app.whenReady().then(()=>{
 const configPath=path.join(app.getPath('userData'),'config.json');
 let state={audio:true};try{state=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{}
 if(state.config)state.config=upgradeConfig(state.config);
 function save(){fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath+'.tmp',JSON.stringify(state,null,2));fs.renameSync(configPath+'.tmp',configPath);}
 const ffmpeg=app.isPackaged?path.join(process.resourcesPath,'ffmpeg','ffmpeg.exe'):require('ffmpeg-static');
 const ffprobe=app.isPackaged?path.join(process.resourcesPath,'ffmpeg','ffprobe.exe'):path.join(path.dirname(ffmpeg),'ffprobe.exe');
 const {analyzeMedia}=require('./analyze.cjs');
 const win=new BrowserWindow({width:1180,height:760,minWidth:850,minHeight:560,backgroundColor:'#10151f',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 let input,busy=false;
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 function handle(channel,fn){ipcMain.handle(channel,(e,...args)=>{if(e.sender!==win.webContents)throw Error('无效调用');return fn(...args);});}
 handle('copy-text',text=>{if(typeof text==='string')clipboard.writeText(text);});
 handle('load-config',()=>({...state,path:configPath}));
 handle('save-config',patch=>{if(patch.config!==undefined){if(!validate(patch.config))throw Error('配置无效');state.config=patch.config;}if(patch.nameList!==undefined){if(!Array.isArray(patch.nameList)||patch.nameList.length>2000||patch.nameList.some(x=>typeof x!=='string'||x.length>200000||/[\r\n,]/.test(x)))throw Error('名称列表无效');state.nameList=patch.nameList;}if(typeof patch.fine==='boolean')state.fine=patch.fine;if(typeof patch.audio==='boolean')state.audio=patch.audio;save();return true;});
 handle('set-input',file=>{if(busy)throw Error('请等待导出完成');if(typeof file!=='string'||!fs.statSync(file).isFile())throw Error('视频路径无效');analysisController?.abort();input=file;return true;});
 handle('analyze-media',async()=>{if(!input)throw Error('请先打开视频');analysisController?.abort();analysisController=new AbortController();return analyzeMedia(ffmpeg,ffprobe,input,analysisController.signal);});
 function run(args,probe=false){return new Promise((resolve,reject)=>{let log='';const child=spawn(ffmpeg,args,{windowsHide:true,shell:false,stdio:['ignore','ignore','pipe']});activeChild=child;child.stderr.on('data',chunk=>log=(log+chunk.toString()).slice(-24000));child.once('error',reject);child.once('close',code=>{activeChild=undefined;if(code===0||probe)resolve(log);else reject(Error('FFmpeg 导出失败：'+log.slice(-1800)));});});}
 handle('export-segments',async text=>{
  if(busy)throw Error('正在导出');if(!input)throw Error('请先打开本地视频');busy=true;let folder;
  try{
   const info=await run(['-hide_banner','-nostdin','-i',input],true);
   const d=/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info);const duration=d?Number(d[1])*3600+Number(d[2])*60+Number(d[3]):NaN;
   const plan=parsePlan(text,duration);const audioCodec=/Audio:\s*([\w]+)/.exec(info)?.[1];const audio=state.audio;
   let parent=process.env.CUT_PLAYER_TEST_OUTPUT;
   if(!parent){const choice=await dialog.showOpenDialog(win,{title:'选择片段输出目录',properties:['openDirectory','createDirectory']});if(choice.canceled)return {canceled:true};parent=choice.filePaths[0];}
   folder=parent;
   const ext=path.extname(input).toLowerCase()||'.mp4';let audioCount=0;
   const targets=plan.flatMap(part=>[path.join(folder,part.name+ext),...(audio&&audioCodec?[path.join(folder,part.name+(audioCodec==='aac'?'.aac':'.mka'))]:[])]);
   if(targets.some(target=>path.resolve(target).toLowerCase()===path.resolve(input).toLowerCase()))throw Error('输出文件与源视频重名，请修改 names 或选择其他目录');
   const existing=targets.filter(target=>fs.existsSync(target));if(existing.length){const choice=await dialog.showMessageBox(win,{type:'question',buttons:['取消','覆盖'],defaultId:0,cancelId:0,message:`所选目录有 ${existing.length} 个同名文件，是否覆盖？`});if(choice.response!==1)return {canceled:true};}

   for(let i=0;i<plan.length;i++){
    const part=plan[i],output=path.join(folder,part.name+ext);
    win.webContents.send('export-progress',`正在导出 ${i+1}/${plan.length}：${part.name}`);
    await run(videoArgs(input,part,output));
    if(audio&&audioCodec){const audioOutput=path.join(folder,part.name+(audioCodec==='aac'?'.aac':'.mka'));await run(audioArgs(output,audioOutput));audioCount++;}
   }
   return {folder,count:plan.length,audioCount,noAudio:audio&&!audioCodec};
  }catch(e){if(folder)e.message+='\n已完成或未完成的文件保留在：'+folder;throw e;}finally{busy=false;}
 });
 win.on('close',e=>{if(busy){e.preventDefault();dialog.showMessageBox(win,{type:'info',message:'正在导出，请等待任务结束后关闭。'});}});
 win.loadFile(path.join(__dirname,'index.html'));
});
app.on('before-quit',()=>{activeChild?.kill();analysisController?.abort();});app.on('window-all-closed',()=>app.quit());
