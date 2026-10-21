const {_electron}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cut-merge-ui-')),profile=path.join(root,'profile'),output=path.join(root,'output');fs.mkdirSync(output);
 const a=path.join(root,"甲 # 'video.mp4"),b=path.join(root,'乙 video.mp4'),c=path.join(root,'丙 video.mp4'),ffmpeg=require('ffmpeg-static');
 for(const [file,color]of [[a,'red'],[b,'blue'],[c,'green']])execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c='+color+':size=64x64:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-g','1','-bf','0','-pix_fmt','yuv420p','-c:a','aac',file],{windowsHide:true});
 const exe=process.env.CUT_PLAYER_PACKAGED_EXE||require('electron'),prefix=process.env.CUT_PLAYER_PACKAGED_EXE?[]:[path.resolve(__dirname,'..')];
 const app=await _electron.launch({executablePath:exe,args:[...prefix,a,b],env:{...process.env,CUT_PLAYER_TEST_PROFILE:profile,CUT_PLAYER_TEST_OUTPUT:output}});
 let page;try{
  const p=page=await app.firstWindow(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.waitForFunction(()=>document.querySelector('#name').textContent==='乙 video.mp4'&&document.querySelector('video').duration===6);
  await p.locator('#notes').fill('breakpoints:00:03\nnames:B1,B2');await p.locator('#videoTabs [role=tab]').first().click();await p.waitForFunction(()=>document.querySelector('#name').textContent.startsWith('甲'));
  await p.locator('#notes').fill('breakpoints:00:02\nnames:A1,A2');await p.locator('#merge').click();await p.waitForFunction(()=>document.querySelectorAll('#mergeList li').length===4);
  assert.equal(await p.locator('#mergeName').inputValue(),'【合并】A1');
  await p.getByRole('checkbox',{name:'选择 A1',exact:true}).uncheck();await p.getByRole('checkbox',{name:'选择 B2',exact:true}).uncheck();
  await p.getByRole('button',{name:'上移 B1',exact:true}).click();assert.equal(await p.locator('#mergeName').inputValue(),'【合并】B1');
  await p.locator('#mergeName').fill('合并测试结果');await p.getByRole('button',{name:'下移 B1',exact:true}).click();assert.equal(await p.locator('#mergeName').inputValue(),'合并测试结果');await p.getByRole('button',{name:'上移 B1',exact:true}).click();
  fs.mkdirSync(path.resolve(__dirname,'../dist'),{recursive:true});await p.screenshot({path:path.resolve(__dirname,'../dist/merge-check.png')});
  await app.evaluate(({dialog})=>{const folder=process.env.CUT_PLAYER_TEST_OUTPUT;delete process.env.CUT_PLAYER_TEST_OUTPUT;dialog.showSaveDialog=async(_win,options)=>new Promise(resolve=>setTimeout(()=>resolve({canceled:false,filePath:folder+'/'+options.defaultPath.split(/[\\/]/).pop()}),3000));});
  await p.locator('#mergeStart').click();await p.waitForFunction(()=>document.querySelector('#mergeStop').hidden===false);
  await p.locator('#mergeClose').click();await p.locator('#file').setInputFiles(c);await p.waitForFunction(()=>document.querySelector('#name').textContent==='丙 video.mp4'&&document.querySelector('video').duration===6);await p.locator('#notes').fill('breakpoints:\nnames:Cchanged');
  await p.waitForFunction(()=>document.querySelector('#mergeProgress').textContent.startsWith('已无损合并 2 个片段'),{},{timeout:30000});assert.equal(await p.locator('#notes').inputValue(),'breakpoints:\nnames:Cchanged');
  const merged=path.join(output,'合并测试结果.mp4');assert.deepEqual(fs.readdirSync(output),['合并测试结果.mp4']);
  const pixel=time=>execFileSync(ffmpeg,['-v','error','-i',merged,'-ss',String(time),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true});
  const first=pixel(.2),second=pixel(4);assert.ok(first[2]>first[0]+100,'first segment must be blue B1');assert.ok(second[0]>second[2]+100,'second segment must be red A2');
  await p.locator('#merge').click();await p.waitForFunction(()=>document.querySelectorAll('#mergeList li').length===5);await p.locator('#mergeNone').click();assert.equal(await p.locator('#mergeStart').isDisabled(),true);await p.locator('#mergeClose').click();
  await p.locator('#videoTabs [role=tab]').nth(1).click();await p.waitForFunction(()=>document.querySelector('#name').textContent==='乙 video.mp4');await p.locator('#notes').fill('breakpoints:00:03\nnames:missing');await p.locator('#merge').click();await p.waitForFunction(()=>document.querySelector('#mergeErrors').textContent.includes('names 数量'));assert.equal(await p.locator('#mergeList li').count(),3);await p.locator('#mergeClose').click();
  assert.deepEqual(errors,[]);console.log('PASS: cross-tab merge panel, selection/reorder, dynamic default and custom name, save path, fixed snapshot during tab open/edit, decoded output order, no intermediate clips, empty selection and invalid notes');
 }finally{if(page){await page.evaluate(()=>window.desktop.cancelExport()).catch(()=>{});await page.waitForFunction(()=>document.querySelector('#mergeStop').hidden,{},{timeout:5000}).catch(()=>{});}await app.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
