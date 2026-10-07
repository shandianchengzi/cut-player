const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 onMediaUpdate:fn=>ipcRenderer.on('media-update',(_e,data)=>fn(data)),
 onUpdateState:fn=>ipcRenderer.on('update-state',(_e,text)=>fn(text)),
 analyze:()=>ipcRenderer.invoke('analyze-media'),
 copy:text=>ipcRenderer.invoke('copy-text',text),
 loadConfig:()=>ipcRenderer.invoke('load-config'),
 saveConfig:patch=>ipcRenderer.invoke('save-config',patch),
 setInput:file=>ipcRenderer.invoke('set-input',webUtils.getPathForFile(file)),
 exportSegments:text=>ipcRenderer.invoke('export-segments',text),
 onProgress:fn=>ipcRenderer.on('export-progress',(_e,text)=>fn(text))
});
