const {test}=require('node:test');const assert=require('node:assert/strict');const {defaults,chord,format,validate}=require('../app/model.cjs');
test('timestamp preserves milliseconds and long hours',()=>{assert.equal(format(3661.234),'01:01:01.234');assert.equal(format(360000),'100:00:00.000');});
test('shortcuts normalize case',()=>assert.equal(chord({key:'v',ctrlKey:true,altKey:true}),'Ctrl+Alt+V'));
test('config rejects duplicate keys and unsupported speeds',()=>{assert.ok(validate(defaults));assert.ok(!validate({...defaults,speeds:[1,2,4,17]}));assert.ok(!validate({...defaults,keys:{...defaults.keys,copy:defaults.keys.stamp}}));});
const {sourceName,segmentName,initialNotes,appendBreakpoint}=require('../app/model.cjs');
test('video calendar offsets and day rollover',()=>{const s=sourceName('video_20260926_202424.mp4');assert.equal(segmentName(s,10),'video_20260926_202434x');assert.equal(segmentName(sourceName('video_20261231_235950.mp4'),20),'video_20270101_000010x');});
test('DJI removes sequence suffix',()=>{const s=sourceName('DJI_20260926202434_0021_D.MP4');assert.equal(segmentName(s),'DJI_20260926202434x');assert.equal(segmentName(s,10),'DJI_20260926202444x');});
test('unix milliseconds and 11 digit seconds preserve surrounding filename',()=>{assert.equal(segmentName(sourceName('clip_1790425464000_end.mp4'),10),'clip_20260926202434000_endx');assert.equal(segmentName(sourceName('clip_01790425464.mp4'),10),'clip_20260926202434000x');});
test('structured notes preserve user names and enforce counts/order',()=>{const s=sourceName('video_20260926_202424.mp4');let text=initialNotes(s);assert.equal(text,'breakpoints:\nnames:video_20260926_202424x');text=appendBreakpoint(text,s,10.9);assert.equal(text,'breakpoints:00:10\nnames:video_20260926_202424x,video_20260926_202434x');text=text.replace('video_20260926_202434x','片段2');assert.match(appendBreakpoint(text,s,83),/names:video_20260926_202424x,片段2,video_20260926_202547x$/);assert.throws(()=>appendBreakpoint(text,s,10));assert.throws(()=>appendBreakpoint('breakpoints:00:10\nnames:one',s,20));});
const {upgradeConfig,importNames,replaceName}=require('../app/model.cjs');
test('space and legacy config migration retain seek preferences',()=>{assert.equal(chord({key:' '}),'Space');const legacy=structuredClone(defaults);delete legacy.keys.toggle;legacy.seek=12;const migrated=upgradeConfig(legacy);assert.ok(validate(migrated));assert.equal(migrated.seek,12);assert.equal(migrated.keys.toggle,'Space');});
test('name lists support whitespace, comma and literal custom delimiters',()=>{assert.deepEqual(importNames('歌1 歌2\n歌3','space'),['歌1','歌2','歌3']);assert.deepEqual(importNames('song one,song two','comma'),['song one','song two']);assert.deepEqual(importNames('a.*b.*a','custom','.*'),['a','b']);assert.throws(()=>importNames('a','custom',''));});
test('replacement keeps breakpoints and name count',()=>assert.equal(replaceName('breakpoints:00:10\nnames:a,b',1,'歌曲'),'breakpoints:00:10\nnames:a,歌曲'));
const {keyframeAt,precisionNotes}=require('../app/model.cjs');
test('keyframe navigation selects safe neighbors and nearest point',()=>{assert.equal(keyframeAt([0,2,4],2,1),4);assert.equal(keyframeAt([0,2,4],2,-1),0);assert.equal(keyframeAt([0,2,4],0,-1),0);assert.equal(keyframeAt([0,2,4],2.9),2);assert.equal(keyframeAt([0,2,4],3.1),4);});
test('fine breakpoints and date names become milliseconds without touching manual names',()=>{const source=sourceName('video_20260926_202424.mp4'),epoch=Date.UTC(2026,8,26,12,24,24);const notes=precisionNotes('breakpoints:00:10\nnames:video_20260926_202424x,自定义',source);assert.equal(notes,`breakpoints:00:10.000\nnames:video_20260926202424000x,自定义`);assert.equal(segmentName(source,.033,true),`video_20260926202424033x`);assert.match(appendBreakpoint(notes,source,10.033,true),/breakpoints:00:10.000,00:10.033/);assert.equal(segmentName(sourceName('01790425464.mp4'),.1,true),'20260926202424100x');});

test('fine calendar naming preserves milliseconds across midnight and parses compact dates',()=>{assert.equal(segmentName(sourceName('DJI_20261231235959_0001_D.MP4'),1.007,true),'DJI_20270101000000007x');assert.equal(segmentName(sourceName('DJI_20261017191600123.mp4'),.01,true),'DJI_20261017191600133x');assert.equal(segmentName(sourceName('DJI_1792236076947.mp4'),0,true),'DJI_20261017192116947x');});

test('Unix base is readable with milliseconds, UTC+8 rollover and whole-second normal offsets',()=>{
 const s=sourceName('other_1790425464947_end.mp4');
 assert.equal(initialNotes(s),'breakpoints:\nnames:other_20260926202424947_endx');
 assert.equal(segmentName(s,10.999),'other_20260926202434947_endx');
 const midnight=Date.UTC(2026,11,31,15,59,59,947);
 assert.equal(segmentName(sourceName('clip_'+midnight+'.mp4'),1),'clip_20270101000000947x');
 assert.equal(segmentName(sourceName('clip_'+midnight+'.mp4'),.053,true),'clip_20270101000000000x');
});
test('old Unix records migrate only exact generated names and preserve manual names',()=>{
 const s=sourceName('clip_1790425464000_end.mp4');
 assert.equal(precisionNotes('breakpoints:00:10\nnames:clip_1790425464000_endx,手动名称',s),'breakpoints:00:10.000\nnames:clip_20260926202424000_endx,手动名称');
 assert.equal(precisionNotes('breakpoints:00:10\nnames:clip_1790425464000_endx,clip_1790425474000_endx',s),'breakpoints:00:10.000\nnames:clip_20260926202424000_endx,clip_20260926202434000_endx');
 assert.equal(precisionNotes('breakpoints:\nnames:clip_01790425464x',sourceName('clip_01790425464.mp4')),'breakpoints:\nnames:clip_20260926202424000x');
 assert.match(appendBreakpoint('breakpoints:\nnames:旧名称',s,10),/names:旧名称,clip_20260926202434000_endx$/);
});
test('generic calendar and unrecognized names retain their existing rules',()=>{
 assert.equal(segmentName(sourceName('other_20260926_202424_end.mp4'),10),'other_20260926_202434_endx');
 assert.equal(segmentName(sourceName('other_20260926202424947_end.mp4'),.053,true),'other_20260926202425000_endx');
 assert.equal(initialNotes(sourceName('旅行.mp4')),'breakpoints:\nnames:旅行x');
 assert.equal(segmentName(sourceName('旅行.mp4'),10),'旅行_0010x');
 assert.equal(segmentName(sourceName('旅行.mp4'),.033,true),'旅行_33x');
});
