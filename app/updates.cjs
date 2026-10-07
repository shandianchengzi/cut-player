const {Menu,app,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path');
function installUpdates(win,isBusy,save){
 let checking=false,pending=false;
 const logPath=path.join(app.getPath('userData'),'updates.log');
 function log(message){try{fs.mkdirSync(path.dirname(logPath),{recursive:true});if(fs.existsSync(logPath)&&fs.statSync(logPath).size>1000000)fs.renameSync(logPath,logPath+'.previous');fs.appendFileSync(logPath,new Date().toISOString()+' '+message+'\n');}catch{}}
 const say=s=>{log(s);if(!win.isDestroyed())win.webContents.send('update-state',s);};
 const {autoUpdater}=require('electron-updater');autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.logger={info:log,warn:log,error:log,debug:()=>{}};
 async function finish(){if(!pending)return;if(isBusy()){say('新版已下载，切割结束后自动安装');setTimeout(finish,1000);return;}try{save();say('正在启动安装程序并重新启动…');autoUpdater.quitAndInstall(true,true);}catch(e){pending=false;checking=false;say('启动安装失败：'+e.message);}}
 autoUpdater.on('error',e=>{checking=false;pending=false;say('更新失败：'+e.message+'（详情：'+logPath+'）');});
 autoUpdater.on('update-not-available',()=>{checking=false;say('当前已是最新版 '+app.getVersion());});
 autoUpdater.on('update-available',()=>say('发现新版安装包，正在后台下载…'));
 autoUpdater.on('download-progress',p=>say(`正在下载更新：${Math.round(p.percent)}%`));
 autoUpdater.on('update-downloaded',()=>{checking=false;pending=true;finish();});
 async function check(){if(checking||pending)return;
 if(process.env.PORTABLE_EXECUTABLE_FILE){say('便携版更新已停用，请手动下载 Setup.exe 安装版；配置和记录会保留。');await dialog.showMessageBox(win,{type:'info',message:'便携版更新已停用',detail:'请从 GitHub Releases 下载最新 Setup.exe 安装版。安装后从新建的开始菜单或桌面快捷方式启动，原便携 exe 不会变成新版本。配置与记录保留在本机。'});return;}
 if(!app.isPackaged){say('开发模式不安装更新');return;}
 checking=true;say('正在检查更新…');try{await autoUpdater.checkForUpdates();}catch(e){checking=false;say('检查更新失败：'+e.message);}}
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'帮助',submenu:[{label:'检查版本更新',click:check},{label:'当前版本 '+app.getVersion(),enabled:false}]}]));
}
module.exports={installUpdates};
