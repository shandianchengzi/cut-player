let mergeRows=[],mergeBusy=false,mergeNameEdited=false,mergeLoadToken=0,mergeProtected=[];
const mergeDialog=$('mergeDialog');
function selectedMergeRows(){return mergeRows.filter(row=>row.checked);}
function updateMergeSelection(){
 const chosen=selectedMergeRows(),seconds=chosen.reduce((n,row)=>n+row.end-row.start,0);
 $('mergeSummary').textContent='已选 '+chosen.length+' 段 · 选定时长 '+exportDuration(seconds)+(chosen.length>2000?'（最多 2000 段）':'');
 if(!mergeNameEdited)$('mergeName').value=chosen.length?'【合并】'+chosen[0].name:'';
 $('mergeStart').disabled=mergeBusy||!chosen.length||chosen.length>2000;
}
function renderMergeRows(){
 $('mergeList').replaceChildren();
 mergeRows.forEach((row,index)=>{
  const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small'),order=document.createElement('span');
  check.type='checkbox';check.checked=row.checked;check.disabled=mergeBusy;check.setAttribute('aria-label','选择 '+row.name);check.onchange=()=>{row.checked=check.checked;updateMergeSelection();};
  text.className='merge-label';name.textContent=row.name;detail.textContent=row.label+' · '+exportDuration(row.start)+' — '+exportDuration(row.end);text.append(name,detail);label.append(check,text);order.className='merge-order';
  for(const [delta,arrow,title] of [[-1,'↑','上移'],[1,'↓','下移']]){const b=document.createElement('button');b.type='button';b.textContent=arrow;b.setAttribute('aria-label',title+' '+row.name);b.disabled=mergeBusy||index+delta<0||index+delta>=mergeRows.length;b.onclick=()=>{[mergeRows[index],mergeRows[index+delta]]=[mergeRows[index+delta],mergeRows[index]];renderMergeRows();};order.append(b);}
  li.append(label,order);$('mergeList').append(li);
 });updateMergeSelection();
}
$('merge').onclick=async()=>{
 if(mergeDialog.open)return;if(mergeBusy){mergeDialog.showModal();return;}
 if(exporting||tabBusy){say('当前正在导出或打开视频，请稍后打开合并面板');return;}
 await ready;saveActiveTab();saveTabs();const inputs=tabs.filter(t=>t.path).map(t=>({path:t.path,name:t.name,text:normalizeNotes(t.notes)}));
 if(!inputs.length){say('请先打开需要合并片段的视频');return;}
 const token=++mergeLoadToken;mergeRows=[];mergeNameEdited=false;mergeProtected=inputs.map(x=>x.path);$('mergeErrors').textContent='';$('mergeProgress').textContent='正在读取各标签页的片段…';$('mergeName').value='';renderMergeRows();mergeDialog.showModal();
 try{const result=await window.desktop.mergeList(inputs);if(token!==mergeLoadToken)return;mergeRows=result.groups.flatMap(g=>g.parts.map(p=>({...p,file:g.file,label:g.label,checked:true})));$('mergeErrors').textContent=result.errors.length?'以下视频未加入，请修正记录或重新打开：\n'+result.errors.join('\n'):'';$('mergeProgress').textContent='';renderMergeRows();}
 catch(e){if(token===mergeLoadToken)$('mergeErrors').textContent=e.message;}
};
$('mergeClose').onclick=()=>mergeDialog.close();mergeDialog.addEventListener('close',()=>{mergeLoadToken++;});
$('mergeName').oninput=()=>{mergeNameEdited=true;};
for(const [id,checked]of [['mergeAll',true],['mergeNone',false]])$(id).onclick=()=>{if(mergeBusy)return;mergeRows.forEach(r=>r.checked=checked);renderMergeRows();};
window.desktop.onMergeProgress(text=>{$('mergeProgress').textContent=text;say(text);});
$('mergeStop').onclick=async()=>{if(!mergeBusy)return;$('mergeStop').disabled=true;try{await window.desktop.cancelExport();}catch(e){$('mergeErrors').textContent=e.message;$('mergeStop').disabled=false;}};
$('mergeForm').onsubmit=async e=>{
 e.preventDefault();if(mergeBusy||exporting)return;const chosen=selectedMergeRows();if(!chosen.length)return;
 const request={parts:chosen.map(({file,start,end,name})=>({file,start,end,name})),name:$('mergeName').value,protectFiles:[...mergeProtected]};
 mergeBusy=exporting=true;renderTabs();$('export').disabled=true;$('mergeErrors').textContent='';$('mergeProgress').textContent='准备无损合并…';$('mergeStop').hidden=false;$('mergeStop').disabled=false;
 for(const id of ['mergeAll','mergeNone','mergeName'])$(id).disabled=true;renderMergeRows();
 try{
  const result=await window.desktop.mergeSegments(request);
  const message=result.canceled?'已取消合并':'已无损合并 '+result.count+' 个片段 · '+fileSize(result.bytes)+'\n实际时长 '+exportDuration(result.duration)+' / 选定时长 '+exportDuration(result.expectedDuration)+'（差值 '+(result.duration-result.expectedDuration>=0?'+':'')+(result.duration-result.expectedDuration).toFixed(3)+' 秒）\n文件：'+result.output;
  $('mergeProgress').textContent=message;say(message);
 }catch(e){$('mergeErrors').textContent=e.message;$('mergeProgress').textContent='合并未完成';say(e.message);}
 finally{mergeBusy=exporting=false;renderTabs();$('export').disabled=tabBusy;$('mergeStop').hidden=true;for(const id of ['mergeAll','mergeNone','mergeName'])$(id).disabled=false;renderMergeRows();}
};
