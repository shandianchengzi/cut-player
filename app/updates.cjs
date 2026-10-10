const {Menu,app,dialog,shell,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
function installUpdates(win,isBusy,save){
 let checking=false,pending=false;
 const logPath=path.join(app.getPath('userData'),'updates.log');
 function log(message){try{fs.mkdirSync(path.dirname(logPath),{recursive:true});if(fs.existsSync(logPath)&&fs.statSync(logPath).size>1000000)fs.renameSync(logPath,logPath+'.previous');fs.appendFileSync(logPath,new Date().toISOString()+' '+message+'\n');}catch{}}
 const say=s=>{log(s);if(!win.isDestroyed())win.webContents.send('update-state',s);};
 let autoUpdater;
 const backup='https://shandianchengzi.github.io/cut-player/updates/';
 function ensureUpdater(){if(autoUpdater)return;
 autoUpdater=require('electron-updater').autoUpdater;autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.logger={info:log,warn:log,error:log,debug:()=>{}};
 autoUpdater.disableDifferentialDownload=true;autoUpdater.httpExecutor.cachedSession=win.webContents.session;
 const {resumableDownload}=require('./update-download.cjs');
 autoUpdater.httpExecutor.download=(url,destination,options)=>resumableDownload(url,destination,options,{cacheDir:path.join(app.getPath('userData'),'update-downloads'),fallback:backup+path.basename(new URL(String(url)).pathname),say,request:(url,headers)=>net.request({url,headers,session:win.webContents.session})});

 autoUpdater.on('error',e=>log('updater error: '+e.message));
 autoUpdater.on('update-not-available',()=>{checking=false;say('当前已是最新版 '+app.getVersion());});
 autoUpdater.on('update-available',()=>say('发现新版安装包，准备后台下载…'));
 autoUpdater.on('download-progress',p=>say(`正在下载更新：${Math.round(p.percent)}%`));
 autoUpdater.on('update-downloaded',()=>{checking=false;pending=true;finish();});
 }
 async function failure(e){checking=false;pending=false;say('更新失败：'+e.message+'（详情：'+logPath+'）');const choice=await dialog.showMessageBox(win,{type:'warning',message:'网络更新失败',detail:'已下载部分已保留，下次检查会尝试续传。也可通过浏览器下载安装包覆盖安装，配置会保留。',buttons:['稍后重试','浏览器下载','备用下载页'],defaultId:0,cancelId:0});if(choice.response===1)await shell.openExternal('https://github.com/shandianchengzi/cut-player/releases/latest');if(choice.response===2)await shell.openExternal('https://shandianchengzi.github.io/cut-player/updates/');}
 async function finish(){if(!pending)return;if(isBusy()){say('新版已下载，切割结束后自动安装');setTimeout(finish,1000);return;}try{save();say('正在启动安装程序并重新启动…');autoUpdater.quitAndInstall(true,true);}catch(e){pending=false;checking=false;say('启动安装失败：'+e.message);}}
 async function check(){if(checking||pending)return;
 if(process.env.PORTABLE_EXECUTABLE_FILE){say('便携版更新已停用，请手动下载 Setup.exe 安装版；配置和记录会保留。');await dialog.showMessageBox(win,{type:'info',message:'便携版更新已停用',detail:'请从 GitHub Releases 下载最新 Setup.exe 安装版。安装后从新建的开始菜单或桌面快捷方式启动，原便携 exe 不会变成新版本。配置与记录保留在本机。'});return;}
 if(!app.isPackaged){say('开发模式不安装更新');return;}
 checking=true;say('正在检查更新…');try{ensureUpdater();let result,last;for(let i=0;i<4;i++){try{autoUpdater.setFeedURL(i%2?{provider:'generic',url:backup}:{provider:'github',owner:'shandianchengzi',repo:'cut-player'});result=await autoUpdater.checkForUpdates();break;}catch(e){last=e;if(i<3){say('检查连接失败，切换下载源并重试 '+(i+1)+'/3');await new Promise(r=>setTimeout(r,1000*2**i));}}}if(!result)throw last;if(require('semver').gt(result.updateInfo.version,app.getVersion())){checking=true;await autoUpdater.downloadUpdate();}}catch(e){await failure(e);}finally{checking=false;}}
 async function showAbout(){
  const choice=await dialog.showMessageBox(win,{type:'info',title:'关于 Cut Player',message:'Cut Player '+app.getVersion(),detail:'作者：shandianchengzi\nCopyright (c) 2026 shandianchengzi\n\n应用许可：PolyForm Noncommercial 1.0.0\n许可范围内非商业用途免费；其他商业用途须另行付费并取得书面授权。商用许可不等于项目版权转让，收购另行协商。\n自 v1.5.12 起采用新许可；此前按 MIT 发布的版本保留原有权利。第三方组件继续遵循各自许可证。\n\n项目源码：https://github.com/shandianchengzi/cut-player\n许可与商业授权：https://github.com/shandianchengzi/cut-player/blob/main/COMMERCIAL-LICENSE.md\n随包许可文件位于安装目录 resources/licensing/。',buttons:['关闭','查看源码','许可与商业授权'],defaultId:0,cancelId:0,noLink:true});
  if(choice.response===1)await shell.openExternal('https://github.com/shandianchengzi/cut-player');
  if(choice.response===2)await shell.openExternal('https://github.com/shandianchengzi/cut-player/blob/main/COMMERCIAL-LICENSE.md');
 }
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'帮助',submenu:[{label:'检查版本更新',click:check},{label:'浏览器下载最新版',click:()=>shell.openExternal('https://github.com/shandianchengzi/cut-player/releases/latest')},{label:'备用下载页',click:()=>shell.openExternal('https://shandianchengzi.github.io/cut-player/updates/')},{label:'当前版本 '+app.getVersion(),enabled:false}]},{label:'关于',submenu:[{label:'关于 Cut Player',click:showAbout},{label:'项目源码',click:()=>shell.openExternal('https://github.com/shandianchengzi/cut-player')},{label:'许可与商业授权',click:()=>shell.openExternal('https://github.com/shandianchengzi/cut-player/blob/main/COMMERCIAL-LICENSE.md')}]}]));
}
module.exports={installUpdates};
