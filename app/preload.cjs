const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{copy:text=>ipcRenderer.invoke('copy-text',text)});
