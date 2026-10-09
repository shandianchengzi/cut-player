const path=require('node:path'),fs=require('node:fs');
function videoPaths(args,cwd){return args.filter(x=>typeof x==='string'&&!x.startsWith('-')&&/\.(mp4|webm|mkv|mov|m4v|avi|mts|m2ts)$/i.test(x)).map(x=>path.resolve(cwd,x)).filter(x=>{try{return fs.statSync(x).isFile();}catch{return false;}});}
module.exports={videoPaths};
