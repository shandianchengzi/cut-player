(function(root){
 function parseBatch(text,files,parsePlan){
  const lines=String(text).replace(/\r\n?/g,'\n').split('\n');
  while(lines.length&&lines.at(-1)==='')lines.pop();
  const errors=[],plans=[];
  if(lines.length!==files.length*2)errors.push({line:Math.min(lines.length,files.length*2)+1,message:`需要 ${files.length*2} 行（每个视频两行），当前 ${lines.length} 行`});
  for(let i=0;i<files.length;i++){
   const line=i*2+1,file=files[i],first=lines[i*2]||'',second=lines[i*2+1]||'';
   if(!/^breakpoints[:：]/.test(first)){errors.push({line,message:'应填写 breakpoints:，对应 '+file.name});continue;}
   if(!/^names[:：]/.test(second)){errors.push({line:line+1,message:'应填写 names:，对应 '+file.name});continue;}
   if(!Number.isFinite(file.duration)||file.duration<=0){errors.push({line,message:'无法读取视频时长：'+file.name});continue;}
   const points=first.replace(/^breakpoints[:：]/,'').split(',');
   const excess=points.filter(p=>{const m=/^(\d+):([0-5]\d)(?:\.(\d{3}))?$/.exec(p.trim());return m&&Number(m[1])*60+Number(m[2])+Number(m[3]||0)/1000>=file.duration;});
   if(excess.length){errors.push({line,message:`${file.name}：断点 ${excess.join(', ')} 达到或超过视频时长 ${file.duration.toFixed(3)} 秒`});continue;}
   const notes=first+'\n'+second;
   try{const plan=parsePlan(notes,file.duration);plans.push({path:file.path,text:notes,plan});}catch(e){errors.push({line:/名称|names/.test(e.message)?line+1:line,message:file.name+'：'+e.message});}
  }
  return {errors,plans};
 }
 if(typeof module!=='undefined')module.exports={parseBatch};else root.parseBatch=parseBatch;
})(globalThis);
