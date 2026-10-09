const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 takeOpenFiles:()=>ipcRenderer.invoke('take-open-files'),
 onOpenFiles:fn=>ipcRenderer.on('open-files-pending',()=>fn()),
 onMediaUpdate:fn=>ipcRenderer.on('media-update',(_e,data)=>fn(data)),
 onUpdateState:fn=>ipcRenderer.on('update-state',(_e,text)=>fn(text)),
 analyze:token=>ipcRenderer.invoke('analyze-media',token),
 copy:text=>ipcRenderer.invoke('copy-text',text),
 loadConfig:()=>ipcRenderer.invoke('load-config'),
 saveConfig:patch=>ipcRenderer.invoke('save-config',patch),
 setInput:file=>ipcRenderer.invoke('set-input',typeof file==='string'?file:webUtils.getPathForFile(file)),
 exportSegments:text=>ipcRenderer.invoke('export-segments',text),
 onProgress:fn=>ipcRenderer.on('export-progress',(_e,text)=>fn(text))
});
