const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createMediaSource}=require('../app/media-source.cjs');
test('local source supports ranges, excludes other paths, and permits deletion with a stream open',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cut-shared-')),file=path.join(root,'中文 #1.mp4'),media=createMediaSource();let live;
 try{
  const data=Buffer.alloc(16*1024*1024,7);fs.writeFileSync(file,data);const url=await media.select(file);
  let res=await fetch(url,{headers:{Range:'bytes=100-199'}});assert.equal(res.status,206);assert.equal(res.headers.get('content-range'),'bytes 100-199/'+data.length);assert.deepEqual(Buffer.from(await res.arrayBuffer()),data.subarray(100,200));
  res=await fetch(url,{headers:{Range:'bytes=-4'}});assert.equal(res.status,206);assert.equal((await res.arrayBuffer()).byteLength,4);
  res=await fetch(url,{method:'HEAD'});assert.equal(res.headers.get('content-length'),String(data.length));assert.equal((await res.arrayBuffer()).byteLength,0);
  for(const range of ['bytes=999999999-','bytes=2-1','bytes=-0','bytes=1-2,4-5'])assert.equal((await fetch(url,{headers:{Range:range}})).status,416);
  assert.equal((await fetch(url.replace(/\/[a-f0-9]+\.mp4$/,'/not-selected'))).status,404);
  await new Promise((resolve,reject)=>{const req=http.get(url,r=>{live=r;req.on('error',()=>{});r.once('error',()=>{});r.pause();resolve();});req.once('error',reject);});
  // The response remains open and backpressured: this catches deny-delete handles on Windows.
  fs.unlinkSync(file);assert.equal(fs.existsSync(file),false);assert.equal((await fetch(url)).status,404);live.destroy();
  fs.writeFileSync(file,'new');const next=await media.select(file);assert.notEqual(next,url);assert.equal((await fetch(url)).status,404);assert.equal(await (await fetch(next)).text(),'new');
 }finally{live?.destroy();media.close();fs.rmSync(root,{recursive:true,force:true});}
});
