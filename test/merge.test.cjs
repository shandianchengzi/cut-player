const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {concatScript,compatible,validName,protectsSource}=require('../app/merge.cjs');
const meta=()=>({streams:[{codec_type:'video',codec_name:'h264',width:64,height:64,time_base:'1/10240',extradata_hash:'SHA256:a'},{codec_type:'audio',codec_name:'aac',sample_rate:'48000',channels:2,time_base:'1/48000'}]});
test('concat script repeats sources with in/out bounds, escapes quotes and contains no clip outputs',()=>{
 const text=concatScript([{url:"C:/a'b.mp4",start:2,end:5},{url:'http://127.0.0.1:1/x.mp4',start:0,end:3},{url:"C:/a'b.mp4",start:8,end:9}]);
 assert.ok(text.startsWith('ffconcat version 1.0\n'));assert.ok(text.includes("file 'C:/a'\\''b.mp4'"));assert.equal((text.match(/^file /gm)||[]).length,3);assert.ok(text.includes('inpoint 8\noutpoint 9\n'));assert.ok(text.includes("option rw_timeout 60000000"));assert.throws(()=>concatScript([{url:"bad\nfile evil",start:0,end:1}]),/路径无效/);
});
test('stream copy compatibility checks track layout, decoder parameters and time bases',()=>{
 compatible(meta(),meta(),'ok');for(const change of [m=>m.streams.pop(),m=>m.streams[0].width=128,m=>m.streams[1].sample_rate='44100',m=>m.streams[0].extradata_hash='SHA256:b',m=>m.streams[0].time_base='1/90000']){const other=meta();change(other);assert.throws(()=>compatible(meta(),other,'other.mp4'),/不兼容/);}
 assert.throws(()=>compatible({streams:[]},meta(),'none'),/没有视频/);
});
test('output names and source aliases are protected',()=>{
 assert.equal(validName('【合并】第一段'),'【合并】第一段');for(const name of ['../source','CON','bad:clip','','tail.','x'.repeat(241)])assert.throws(()=>validName(name));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'merge-guard-'));try{const source=path.join(root,'source.mp4'),alias=path.join(root,'alias.mp4');fs.writeFileSync(source,'original');fs.linkSync(source,alias);assert.equal(protectsSource(alias,[source]),true);assert.equal(protectsSource(source,[source]),true);assert.equal(protectsSource(path.join(root,'new.mp4'),[source]),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('consecutive adjacent segments of one source share one read range without changing order',()=>{
 const text=concatScript([{url:'a.mp4',start:0,end:2},{url:'a.mp4',start:2,end:4},{url:'b.mp4',start:0,end:1},{url:'a.mp4',start:4,end:6}]);
 assert.equal((text.match(/^file /gm)||[]).length,3);assert.ok(text.includes("file 'a.mp4'\ninpoint 0\noutpoint 4\n"));assert.ok(text.endsWith("file 'a.mp4'\ninpoint 4\noutpoint 6\n"));
});