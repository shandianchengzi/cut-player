const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),{gzipSync}=require('node:zlib');
const {NsisUpdater}=require('electron-updater/out/NsisUpdater'),{DownloadedUpdateHelper}=require('electron-updater/out/DownloadedUpdateHelper'),{GenericProvider}=require('electron-updater/out/providers/GenericProvider'),{HttpExecutor}=require('builder-util-runtime');
const {configureUpdateDownloads}=require('../app/update-mode.cjs');
class Executor extends HttpExecutor{createRequest(options,callback){return http.request(options,callback);}}
const sha=(data,algorithm='sha512')=>crypto.createHash(algorithm).update(data).digest('base64');
const blockSize=65536;
function blockmap(data){const blocks=[];for(let at=0;at<data.length;at+=blockSize)blocks.push(data.subarray(at,at+blockSize));return gzipSync(JSON.stringify({version:'2',files:[{name:'file',offset:0,checksums:blocks.map(b=>sha(b,'sha256')),sizes:blocks.map(b=>b.length)}]}));}
for(const mode of ['differential','missing-cache','range-error','bad-patch','bad-full']){
 test('native NSIS updater '+mode,async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cut-diff-')),old=Buffer.concat(Array.from({length:16},(_,i)=>Buffer.alloc(blockSize,i))),fresh=Buffer.from(old);fresh.fill(77,blockSize*3,blockSize*4);fresh.fill(88,blockSize*11,blockSize*12);
  let networkBytes=0,fullRequests=0,rangeRequests=0,downloaded=0;const messages=[];
  const server=http.createServer((req,res)=>{
   const route=new URL(req.url,'http://localhost').pathname;
   if(route.endsWith('.blockmap')){const map=blockmap(route.includes('1.0.0')?old:fresh);res.writeHead(200,{'content-length':map.length});res.end(map);return;}
   const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
   if(match){rangeRequests++;if(mode==='range-error'){res.writeHead(500).end();return;}const start=Number(match[1]),end=match[2]?Number(match[2]):fresh.length-1;const data=Buffer.from(fresh.subarray(start,end+1));if(mode==='bad-patch'||mode==='bad-full')data[0]^=255;networkBytes+=data.length;res.writeHead(206,{'content-length':data.length,'content-range':`bytes ${start}-${end}/${fresh.length}`});res.end(data);
   }else{fullRequests++;const data=Buffer.from(fresh);if(mode==='bad-full')data[0]^=255;networkBytes+=data.length;res.writeHead(200,{'content-length':data.length});res.end(data);}
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
  try{
   const adapter={version:'1.0.0',name:'Cut Player test',isPackaged:true,userDataPath:root,baseCachePath:root,whenReady:async()=>{},onQuit:()=>{},quit:()=>{}};
   const updater=new NsisUpdater(undefined,adapter);updater.httpExecutor=new Executor();updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.configOnDisk={value:Promise.resolve({})};
   updater.downloadedUpdateHelper=new DownloadedUpdateHelper(path.join(root,'cache'));fs.mkdirSync(updater.downloadedUpdateHelper.cacheDir,{recursive:true});
   if(mode!=='missing-cache')fs.writeFileSync(path.join(updater.downloadedUpdateHelper.cacheDir,'installer.exe'),old);
   configureUpdateDownloads(updater,{cacheDir:path.join(root,'partial'),fallbackBase:url,request:(url,headers)=>http.request(url,{headers}),say:m=>messages.push(m),log:()=>{},delay:async()=>{}});
   assert.equal(updater.disableDifferentialDownload,false);
   const info={version:'1.0.1',files:[{url:'setup-1.0.1.exe',size:fresh.length,sha512:sha(fresh)}]},provider=new GenericProvider({provider:'generic',url},updater,{executor:updater.httpExecutor,platform:'win32',isUseMultipleRangeRequest:false});
   updater.updateInfoAndProvider={info,provider};updater.on('update-downloaded',()=>downloaded++);updater.on('download-progress',()=>{});
   if(mode==='bad-full'){await assert.rejects(updater.downloadUpdate());assert.equal(downloaded,0);}
   else{const [output]=await updater.downloadUpdate();assert.deepEqual(fs.readFileSync(output),fresh);assert.equal(downloaded,1);
    if(mode==='differential'){assert.equal(fullRequests,0);assert.ok(rangeRequests>0);assert.equal(networkBytes,blockSize*2);assert.ok(messages.some(m=>m.startsWith('差分更新：')));}
    else{assert.ok(fullRequests>0);assert.ok(messages.some(m=>m.includes('自动切换完整包')));}
   }
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
 });
}
