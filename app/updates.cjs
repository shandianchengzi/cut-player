const {Menu,app,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
function newer(a,b){const x=a.replace(/^v/,'').split('.').map(Number),y=b.split('.').map(Number);return x.every(Number.isFinite)&&x.some((n,i)=>n!==y[i]&&x.slice(0,i).every((v,j)=>v===y[j])&&n>y[i]);}
function installUpdates(win,isBusy,save){
 let checking=false,pending;
 const say=s=>{if(!win.isDestroyed())win.webContents.send('update-state',s);};
 const portable=process.env.PORTABLE_EXECUTABLE_FILE;
 const {autoUpdater}=require('electron-updater');autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;
 async function finish(){if(!pending)return;if(isBusy()){say('新版已下载，切割结束后自动安装');setTimeout(finish,1000);return;}save();say('正在安装更新并重新启动…');if(!portable){autoUpdater.quitAndInstall(true,true);return;}
 const script=path.join(app.getPath('temp'),'cut-player-update-'+crypto.randomUUID()+'.ps1');
 // Paths are passed as environment variables, never interpolated into PowerShell source.
 fs.writeFileSync(script,`$ErrorActionPreference='Stop'\n$target=$env:CUT_UPDATE_TARGET\n$source=$env:CUT_UPDATE_SOURCE\n$backup=$target+'.update-backup'\n$done=$false\nfor($i=0;$i -lt 180;$i++){\n try {\n  if(Test-Path $backup){Remove-Item -LiteralPath $backup -Force}\n  Move-Item -LiteralPath $target -Destination $backup -Force\n  try {Copy-Item -LiteralPath $source -Destination $target -Force} catch {Move-Item -LiteralPath $backup -Destination $target -Force;throw}\n  $done=$true;break\n } catch {Start-Sleep -Seconds 1}\n}\nif($done){Start-Process -FilePath $target;Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $source -Force -ErrorAction SilentlyContinue}\nRemove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue\n`);
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,CUT_UPDATE_TARGET:portable,CUT_UPDATE_SOURCE:pending}});child.once('spawn',()=>{child.unref();app.quit();});child.once('error',e=>say('启动更新失败：'+e.message));
 }
 autoUpdater.on('error',e=>{checking=false;say('检查更新失败：'+e.message);});autoUpdater.on('update-not-available',()=>{checking=false;say('当前已是最新版 '+app.getVersion());});autoUpdater.on('update-available',()=>say('发现新版，正在后台下载…'));autoUpdater.on('download-progress',p=>say(`正在下载更新：${Math.round(p.percent)}%`));autoUpdater.on('update-downloaded',()=>{checking=false;pending=true;finish();});
 async function check(){if(checking||pending)return;checking=true;say('正在检查更新…');try{
 if(!app.isPackaged){say('开发模式不安装更新');checking=false;return;}
 if(!portable){await autoUpdater.checkForUpdates();return;}
 const response=await fetch('https://api.github.com/repos/shandianchengzi/cut-player/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('GitHub HTTP '+response.status);const release=await response.json();if(!newer(release.tag_name,app.getVersion())){say('当前已是最新版 '+app.getVersion());checking=false;return;}
 const asset=release.assets.find(a=>a.name==='portable-update.json');if(!asset)throw Error('新版缺少更新校验文件');const r=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('更新信息下载失败');const metadata=await r.json();const exe=release.assets.find(a=>a.name===metadata.file);if(!exe||metadata.version!==release.tag_name.replace(/^v/,'')||!/^[a-f0-9]{128}$/.test(metadata.sha512))throw Error('更新信息无效');
 say('发现新版，正在后台下载…');const download=await fetch(exe.browser_download_url,{signal:AbortSignal.timeout(1800000)});if(!download.ok)throw Error('下载失败 HTTP '+download.status);const file=path.join(app.getPath('temp'),'cut-player-'+crypto.randomUUID()+'.exe');const output=fs.createWriteStream(file);let writeError;output.on('error',e=>writeError=e);const hash=crypto.createHash('sha512');let received=0;
 try{for await(const chunk of download.body){if(writeError)throw writeError;hash.update(chunk);received+=chunk.length;if(!output.write(chunk))await new Promise(resolve=>{output.once('drain',resolve);output.once('error',resolve);});say(`正在下载更新：${Math.min(100,Math.round(received/exe.size*100))}%`);}await new Promise((resolve,reject)=>{output.on('error',reject);output.end(resolve);});if(hash.digest('hex')!==metadata.sha512)throw Error('更新文件校验失败');}catch(e){output.destroy();fs.rmSync(file,{force:true});throw e;}
 pending=file;checking=false;finish();
 }catch(e){checking=false;say('更新失败：'+e.message);}}
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'帮助',submenu:[{label:'检查版本更新',click:check},{label:'当前版本 '+app.getVersion(),enabled:false}]}]));
}
module.exports={installUpdates,newer};
