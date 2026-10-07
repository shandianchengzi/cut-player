const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 copy:text=>ipcRenderer.invoke('copy-text',text),
 loadConfig:()=>ipcRenderer.invoke('load-config'),
 saveConfig:patch=>ipcRenderer.invoke('save-config',patch),
 setInput:file=>ipcRenderer.invoke('set-input',webUtils.getPathForFile(file)),
 exportSegments:text=>ipcRenderer.invoke('export-segments',text),
 onProgress:fn=>ipcRenderer.on('export-progress',(_e,text)=>fn(text))
});
