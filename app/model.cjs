const defaults={keys:{stamp:'Ctrl+Alt+V',copy:'Ctrl+Alt+C',up:'ArrowUp',down:'ArrowDown',back:'ArrowLeft',forward:'ArrowRight',speed0:'1',speed1:'2',speed2:'3',speed3:'4'},speeds:[1,2,4,16],seek:5,volume:5};
function chord(e){let key=e.key; if(['Control','Alt','Shift','Meta'].includes(key))return ''; if(key.length===1)key=key.toUpperCase();return [e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',key].filter(Boolean).join('+');}
function format(seconds){let ms=Math.floor(Math.max(0,seconds)*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
function validate(s){return s && Array.isArray(s.speeds)&&s.speeds.length===4&&s.speeds.every(x=>Number.isFinite(x)&&x>=0.25&&x<=16)&&Number.isFinite(s.seek)&&s.seek>0&&s.seek<=600&&Number.isFinite(s.volume)&&s.volume>0&&s.volume<=100&&Object.keys(defaults.keys).every(k=>typeof s.keys?.[k]==='string'&&s.keys[k].length>0)&&new Set(Object.values(s.keys)).size===10;}
if(typeof module!=='undefined')module.exports={defaults,chord,format,validate};

// Calendar filenames retain their written local wall time; Unix values are absolute milliseconds/seconds.
function sourceName(filename){
 const stem=filename.replace(/\.[^.]+$/,'');
 let m=/^DJI_(\d{14})(?:_.*)?$/i.exec(stem);
 if(m)return calendarSource('DJI_',m[1],'',true);
 m=/(\d{8})_(\d{6})/.exec(stem);
 if(m)return calendarSource(stem.slice(0,m.index),m[1]+m[2],stem.slice(m.index+m[0].length),false);
 m=/(?<!\d)(\d{13}|\d{11})(?!\d)/.exec(stem);
 if(m){const scale=m[1].length===13?1:1000;const epoch=Number(m[1])*scale;if(Number.isFinite(new Date(epoch).getTime()))return {kind:'unix',base:epoch,scale,width:m[1].length,prefix:stem.slice(0,m.index),suffix:stem.slice(m.index+m[0].length)};}
 return {kind:'plain',stem};
}
function calendarSource(prefix,digits,suffix,dji){
 const parts=[digits.slice(0,4),digits.slice(4,6),digits.slice(6,8),digits.slice(8,10),digits.slice(10,12),digits.slice(12,14)].map(Number);
 const base=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]);
 const d=new Date(base);
 if(d.getUTCFullYear()!==parts[0]||d.getUTCMonth()+1!==parts[1]||d.getUTCDate()!==parts[2]||d.getUTCHours()!==parts[3]||d.getUTCMinutes()!==parts[4]||d.getUTCSeconds()!==parts[5])return {kind:'plain',stem:prefix+digits+suffix};
 return {kind:'calendar',base,prefix,suffix,dji};
}
function segmentName(source,seconds=0){
 const offset=Math.floor(seconds)*1000;
 if(source.kind==='unix')return source.prefix+String(Math.floor((source.base+offset)/source.scale)).padStart(source.width,'0')+source.suffix+'x';
 if(source.kind==='calendar'){const d=new Date(source.base+offset);const a=[d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()].map((n,i)=>String(n).padStart(i===0?4:2,'0'));return source.prefix+a.slice(0,3).join('')+(source.dji?'':'_')+a.slice(3).join('')+source.suffix+'x';}
 return source.stem+(seconds?'_'+breakpointTime(seconds).replaceAll(':',''):'')+'x';
}
function breakpointTime(seconds){const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function initialNotes(source){return 'breakpoints:\nnames:'+segmentName(source);}
function appendBreakpoint(text,source,seconds){
 const m=/^breakpoints:([^\n]*)\r?\nnames:([^\n]*)\s*$/.exec(text);
 if(!m)throw Error('文本须为 breakpoints 和 names 两行。');
 const points=m[1].trim()?m[1].trim().split(',').map(x=>x.trim()):[];
 const names=m[2].trim().split(',').map(x=>x.trim());
 if(names.length!==points.length+1||names.some(x=>!x))throw Error('names 数量必须比 breakpoints 多一个。');
 const times=points.map(x=>{const t=/^(\d+):([0-5]\d)$/.exec(x);if(!t)throw Error('断点格式须为 MM:SS。');return Number(t[1])*60+Number(t[2]);});
 if(times.some((x,i)=>x<=0||(i&&x<=times[i-1])))throw Error('断点须按时间递增。');
 const n=Math.floor(seconds);if(!Number.isFinite(n)||n<=0||(times.length&&n<=times.at(-1)))throw Error('新断点须晚于已有断点，且不能为 00:00。');
 points.push(breakpointTime(n));names.push(segmentName(source,n));return 'breakpoints:'+points.join(',')+'\nnames:'+names.join(',');
}
if(typeof module!=='undefined')Object.assign(module.exports,{sourceName,segmentName,breakpointTime,initialNotes,appendBreakpoint});
