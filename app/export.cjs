(function(root){
const normalize=typeof module!=='undefined'?require('./model.cjs').normalizeNotes:normalizeNotes;
function parsePlan(text,duration){
 text=normalize(text);
 const m=/^breakpoints:([^\n]*)\r?\nnames:([^\n]*)\s*$/.exec(text);
 if(!m)throw Error('文本必须为 breakpoints 与 names 两行');
 const raw=m[1].trim()?m[1].trim().split(','):[];
 const names=m[2].trim().split(',').map(x=>x.trim());
 if(names.length!==raw.length+1)throw Error('names 数量必须比 breakpoints 多一个');
 const used=new Set();for(const n of names){if(!n||n.length>180||/[<>:"/\\|?*\x00-\x1f]/.test(n)||/[. ]$/.test(n)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(n))throw Error('片段名称包含 Windows 不允许的字符或保留名称');const k=n.toLowerCase();if(used.has(k))throw Error('片段名称不能重复');used.add(k);}
 const points=raw.map(t=>{const v=/^(\d+):([0-5]\d)(?:\.(\d{3}))?$/.exec(t.trim());if(!v)throw Error('断点须使用 MM:SS');return Number(v[1])*60+Number(v[2])+Number(v[3]||0)/1000;});
 if(!Number.isFinite(duration)||duration<=0)throw Error('无法读取视频时长');
 if(points.some((n,i)=>n<=0||n>=duration||(i&&n<=points[i-1])))throw Error('断点必须严格递增并小于视频总时长');
 const bounds=[0,...points,duration];return names.map((name,i)=>({name,start:bounds[i],end:bounds[i+1]}));
}
function videoArgs(input,part,output){return ['-hide_banner','-nostdin','-y','-i',input,'-ss',String(part.start),'-to',String(part.end),'-map','0:v?','-map','0:a?','-c','copy',output];}
function audioArgs(input,output){return ['-hide_banner','-nostdin','-y','-i',input,'-map','0:a:0','-c','copy','-vn',output];}
function validateKeyframePlan(plan,keyframes,tolerance=.0006){
 if(!Array.isArray(keyframes)||!keyframes.length)throw Error('关键帧时间轴尚未准备好，请等待分析完成');
 const points=plan.slice(1).map(part=>part.start);
 for(const point of points)if(!keyframes.some(key=>Math.abs(key-point)<=tolerance))throw Error('断点 '+point.toFixed(3)+' 秒不是无损关键帧，请在“无损关键帧”模式下重新定位并记录');
 return true;
}
if(typeof module!=='undefined')module.exports={parsePlan,videoArgs,audioArgs,validateKeyframePlan};else Object.assign(root,{parsePlan,validateKeyframePlan});
})(globalThis);
