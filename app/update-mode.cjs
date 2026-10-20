const path=require('node:path');
const {resumableDownload}=require('./update-download.cjs');
const backupFeed=url=>({provider:'generic',url,useMultipleRangeRequest:false});
function configureUpdateDownloads(updater,{cacheDir,fallbackBase,request,say,log,delay}){
 let differential=false;
 updater.disableDifferentialDownload=false;
 updater.disableWebInstaller=true;
 updater.logger={
  info:message=>{log(message);const match=/^Full: (.*), To download: (.*)$/.exec(String(message));if(match){differential=true;say('差分更新：完整包 '+match[1]+'，需下载 '+match[2]);}},
  warn:log,
  error:message=>{log(message);if(String(message).startsWith('Cannot download differentially')){differential=false;say('差分更新不可用，自动切换完整包下载（支持断点续传）');}},
  debug:()=>{}
 };
 // Native differential requests bypass download(); this override handles only full-package fallback.
 updater.httpExecutor.download=(url,destination,options)=>resumableDownload(url,destination,options,{
  cacheDir,fallback:String(url).startsWith(fallbackBase)?'https://github.com/shandianchengzi/cut-player/releases/download/v'+updater.updateInfoAndProvider.info.version+'/'+path.basename(new URL(String(url)).pathname):fallbackBase+path.basename(new URL(String(url)).pathname),request,say,delay
 });
 return ()=>differential?'差分更新':'完整更新';
}
module.exports={configureUpdateDownloads,backupFeed};
