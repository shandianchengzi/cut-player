const test=require('node:test'),assert=require('node:assert/strict');
const {sourceInfoArgs,parseSourceInfo}=require('../app/export-info.cjs');
test('source probe handles first audio codec and silent videos with exact duration',()=>{
 assert.deepEqual(parseSourceInfo('{"format":{"duration":"1935.680000"},"streams":[{"codec_name":"aac"}]}'),{duration:1935.68,audioCodec:'aac'});
 assert.deepEqual(parseSourceInfo('{"format":{"duration":"2.125"},"streams":[]}'),{duration:2.125,audioCodec:undefined});
 assert.equal(sourceInfoArgs('中文 #.mp4').at(-1),'中文 #.mp4');
 assert.equal(sourceInfoArgs('x')[sourceInfoArgs('x').indexOf('-select_streams')+1],'a:0');
 for(const duration of [undefined,'N/A','0','-2'])assert.throws(()=>parseSourceInfo(JSON.stringify({format:{duration}})));
});
