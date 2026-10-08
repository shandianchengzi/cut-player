function normalizeNotes(text){return text.replace(/^(breakpoints:|names:)([^\r\n]*)/gm,(_all,key,value)=>key+value.trimEnd().replace(/(?:,\s*)+$/,''));}
const defaults={keys:{toggle:'Space',stamp:'Ctrl+Alt+V',copy:'Ctrl+Alt+C',up:'ArrowUp',down:'ArrowDown',back:'ArrowLeft',forward:'ArrowRight',speed0:'1',speed1:'2',speed2:'3',speed3:'4'},speeds:[1,2,4,16],seek:1,volume:5};
function chord(e){let key=e.key;if(key===' ')key='Space'; if(['Control','Alt','Shift','Meta'].includes(key))return ''; if(key.length===1)key=key.toUpperCase();return [e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',key].filter(Boolean).join('+');}
function format(seconds){let ms=Math.floor(Math.max(0,seconds)*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
function validate(s){return s && Array.isArray(s.speeds)&&s.speeds.length===4&&s.speeds.every(x=>Number.isFinite(x)&&x>=0.25&&x<=16)&&Number.isFinite(s.seek)&&s.seek>0&&s.seek<=600&&Number.isFinite(s.volume)&&s.volume>0&&s.volume<=100&&Object.keys(defaults.keys).every(k=>typeof s.keys?.[k]==='string'&&s.keys[k].length>0)&&new Set(Object.values(s.keys)).size===Object.keys(defaults.keys).length;}
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
function segmentName(source,seconds=0,fine=false){
 if(fine){const base=source.kind==='calendar'?source.base-8*3600000:source.base;if(Number.isFinite(base))return source.prefix+String(base+Math.round(seconds*1000))+source.suffix+'x';return source.stem+'_'+Math.round(seconds*1000)+'x';}
 const offset=Math.floor(seconds)*1000;
 if(source.kind==='unix')return source.prefix+String(Math.floor((source.base+offset)/source.scale)).padStart(source.width,'0')+source.suffix+'x';
 if(source.kind==='calendar'){const d=new Date(source.base+offset);const a=[d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()].map((n,i)=>String(n).padStart(i===0?4:2,'0'));return source.prefix+a.slice(0,3).join('')+(source.dji?'':'_')+a.slice(3).join('')+source.suffix+'x';}
 return source.stem+(seconds?'_'+breakpointTime(seconds).replaceAll(':',''):'')+'x';
}
function breakpointTime(seconds,fine=false){if(fine){const ms=Math.round(seconds*1000);return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');}const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function initialNotes(source){return 'breakpoints:\nnames:'+segmentName(source);}
function appendBreakpoint(text,source,seconds,fine=false){
 text=normalizeNotes(text);const m=/^breakpoints:([^\n]*)\r?\nnames:([^\n]*)\s*$/.exec(text);
 if(!m)throw Error('文本须为 breakpoints 和 names 两行。');
 const points=m[1].trim()?m[1].trim().split(',').map(x=>x.trim()):[];
 const names=m[2].trim().split(',').map(x=>x.trim());
 if(names.length!==points.length+1||names.some(x=>!x))throw Error('names 数量必须比 breakpoints 多一个。');
 const times=points.map(x=>{const t=/^(\d+):([0-5]\d)(?:\.(\d{3}))?$/.exec(x);if(!t)throw Error('断点格式须为 MM:SS。');return Number(t[1])*60+Number(t[2])+Number(t[3]||0)/1000;});
 if(times.some((x,i)=>x<=0||(i&&x<=times[i-1])))throw Error('断点须按时间递增。');
 const n=fine?Math.round(seconds*1000)/1000:Math.floor(seconds);if(!Number.isFinite(n)||n<=0||(times.length&&n<=times.at(-1)))throw Error('新断点须晚于已有断点，且不能为 00:00。');
 points.push(breakpointTime(n,fine));names.push(segmentName(source,n,fine));return 'breakpoints:'+points.join(',')+'\nnames:'+names.join(',');
}
if(typeof module!=='undefined')Object.assign(module.exports,{sourceName,segmentName,breakpointTime,initialNotes,appendBreakpoint});

function upgradeConfig(s){if(!s||!s.keys)return s;const next={...s,keys:{...s.keys}};if(!next.keys.toggle)next.keys.toggle=['Space','P','Ctrl+Space','Ctrl+Alt+P'].find(k=>!Object.values(next.keys).includes(k));return next;}
function importNames(text,mode,separator=''){if(typeof text!=='string'||text.length>200000)throw Error('导入文本过长');if(mode==='custom'&&!separator)throw Error('请输入自定义分隔符');const parts=mode==='space'?text.split(/\s+/):text.split(mode==='comma'?',':separator);const names=[...new Set(parts.map(x=>x.trim()).filter(Boolean))];if(!names.length)throw Error('未找到名称');if(names.length>2000)throw Error('最多导入 2000 个名称');if(names.some(x=>/[\r\n,]/.test(x)))throw Error('名称不能包含逗号或换行，请调整分隔符');return names;}
function replaceName(text,index,name){text=normalizeNotes(text);const m=/^breakpoints:([^\n]*)\r?\nnames:([^\n]*)\s*$/.exec(text);if(!m)throw Error('文本须为 breakpoints 与 names 两行');const names=m[2].split(',').map(x=>x.trim());const points=m[1].trim()?m[1].split(','):[];if(names.length!==points.length+1)throw Error('names 数量必须比 breakpoints 多一个');if(!Number.isInteger(index)||index<0||index>=names.length)throw Error('请选择需要修改的片段');if(!name||/[\r\n,]/.test(name))throw Error('名称不能包含逗号或换行');names[index]=name;return 'breakpoints:'+m[1].trim()+'\nnames:'+names.join(',');}
if(typeof module!=='undefined')Object.assign(module.exports,{upgradeConfig,importNames,replaceName});

function frameAt(frames,time,direction=0){if(!frames.length)return time;let low=0,high=frames.length;while(low<high){const mid=(low+high)>>1;if(frames[mid]<time-0.00001)low=mid+1;else high=mid;}if(direction<0)return frames[Math.max(0,low-1)];if(direction>0)return frames[Math.min(frames.length-1,low+(Math.abs((frames[low]??Infinity)-time)<.00001?1:0))];return frames[Math.max(0,Math.min(frames.length-1,low))];}
function precisionNotes(text,source){text=normalizeNotes(text);const m=/^breakpoints:([^\n]*)\r?\nnames:([^\n]*)\s*$/.exec(text);if(!m)return text;const raw=m[1].trim()?m[1].split(','):[];const times=raw.map(t=>{const a=/^(\d+):([0-5]\d)(?:\.(\d{3}))?$/.exec(t.trim());return a?Number(a[1])*60+Number(a[2])+Number(a[3]||0)/1000:NaN;});const names=m[2].split(',');if(names.length!==times.length+1||times.some(t=>!Number.isFinite(t)))return text;[0,...times].forEach((t,i)=>{if(names[i].trim()===segmentName(source,t))names[i]=segmentName(source,t,true);});return 'breakpoints:'+times.map(t=>breakpointTime(t,true)).join(',')+'\nnames:'+names.join(',');}
if(typeof module!=='undefined')Object.assign(module.exports,{frameAt,precisionNotes});

if(typeof module!=='undefined')Object.assign(module.exports,{normalizeNotes});

function editableSegments(text){
 const m=/^breakpoints:([^\n]*)\r?\nnames:([^\n]*)\s*$/.exec(normalizeNotes(text));
 if(!m)throw Error('文本须为 breakpoints 与 names 两行；可用初始化恢复格式。');
 const points=m[1].trim()?m[1].split(',').map(x=>x.trim()):[],names=m[2].split(',').map(x=>x.trim());
 if(names.some(x=>!x)||names.length!==points.length+1)throw Error('names 数量必须比 breakpoints 多一个；可用初始化恢复格式。');
 let previous=0;for(const point of points){const a=/^(\d+):([0-5]\d)(?:\.(\d{3}))?$/.exec(point);const t=a?Number(a[1])*60+Number(a[2])+Number(a[3]||0)/1000:NaN;if(!Number.isFinite(t)||t<=previous)throw Error('断点须为按时间递增的 MM:SS 或 MM:SS.mmm。');previous=t;}
 return {points,names};
}
function deleteSegment(text,index){
 const {points,names}=editableSegments(text);
 if(!Number.isInteger(index)||index<0||index>=names.length)throw Error('请选择需要删除的片段');
 if(names.length===1)throw Error('仅剩一个片段，请使用初始化恢复记录。');
 names.splice(index,1);points.splice(index===0?0:index-1,1);
 return 'breakpoints:'+points.join(',')+'\nnames:'+names.join(',');
}
if(typeof module!=='undefined')Object.assign(module.exports,{editableSegments,deleteSegment});

const defaultNameList=Object.freeze(["开场", "修星星的人", "Try Everything", "串场1 Talk", "光亮", "若梦", "浮光", "借过一下", "串场2 动画", "请我不改＋警报", "来啊", "达拉崩吧", "记忆商店串烧", "串场3 动画", "化身孤岛的鲸", "花开忘忧", "串场4 Talk", "北京限定曲", "小美满＋总有美好在路上", "灯火里的中国", "串场5 Talk", "邓丽君组曲", "串场6 动画", "和光同尘", "云裳羽衣曲", "怜悯", "望", "璀璨冒险人", "串场7 Talk", "奇迹时刻", "好运来", "接财运", "吉量", "想见到气血满满的你", "Wala li longla", "少管我", "点歌1", "点歌2", "感谢工作人员", "我以渺小爱你", "串场8 动画", "起风了", "大鱼", "难忘今宵", "退场"]);
if(typeof module!=='undefined')Object.assign(module.exports,{defaultNameList});
