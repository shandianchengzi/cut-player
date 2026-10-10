// Node's Windows file handles share read/write/delete, unlike Chromium file:// handles.
// All consumers use this bounded, local range stream so none lock the source file.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
function createMediaSource(){
 let server,starting,selected;
 const streams=new Set();
 async function serve(req,res){
  if(!selected||req.url!==selected.route||req.headers.host!==server.address().address+':'+server.address().port){res.writeHead(404).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  const source=selected;let file;
  try{
   file=await fs.promises.open(source.file,'r');const stat=await file.stat();
   if(selected!==source||!stat.isFile()){await file.close();file=null;res.writeHead(404).end();return;}
   const size=stat.size;let start=0,end=size-1,status=200;
   if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){await file.close();file=null;res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
    if(!match[1])start=Math.max(0,size-Number(match[2]));
    else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){await file.close();file=null;res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
    status=206;
   }
   const types={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.mts':'video/mp2t','.m2ts':'video/mp2t'};
   const headers={'Accept-Ranges':'bytes','Content-Type':types[path.extname(source.file).toLowerCase()]||'application/octet-stream','Content-Length':Math.max(0,end-start+1),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
   if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
   res.writeHead(status,headers);
   if(req.method==='HEAD'||!size||res.destroyed){await file.close();file=null;res.end();return;}
   const stream=file.createReadStream({start,end,highWaterMark:64*1024});file=null;streams.add(stream);
   stream.once('close',()=>streams.delete(stream));stream.once('error',()=>res.destroy());
   res.once('close',()=>stream.destroy());stream.pipe(res);
  }catch(e){if(file)await file.close().catch(()=>{});if(!res.headersSent)res.writeHead(e.code==='ENOENT'||e.code==='ENOTDIR'?404:500).end();else res.destroy();}
 }
 function start(){if(!starting)starting=new Promise((resolve,reject)=>{server=http.createServer((req,res)=>{serve(req,res).catch(()=>res.destroy());});server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});return starting;}
 return {
  async select(file){await start();for(const stream of streams)stream.destroy();selected={file,route:'/'+randomBytes(24).toString('hex')+path.extname(file).toLowerCase()};return `http://127.0.0.1:${server.address().port}${selected.route}`;},
  close(){selected=undefined;for(const stream of streams)stream.destroy();server?.close();server?.closeAllConnections();}
 };
}
module.exports={createMediaSource};
