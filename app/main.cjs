const {app,BrowserWindow,ipcMain,clipboard} = require('electron');
const path = require('node:path');
if(process.env.CUT_PLAYER_TEST_PROFILE)app.setPath('userData',process.env.CUT_PLAYER_TEST_PROFILE);
app.whenReady().then(()=>{
 const win = new BrowserWindow({width:1180,height:760,minWidth:850,minHeight:560,backgroundColor:'#10151f',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate', e=>e.preventDefault());
 ipcMain.handle('copy-text',(event,text)=>{if(event.sender===win.webContents && typeof text==='string') clipboard.writeText(text);});
 win.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>app.quit());
