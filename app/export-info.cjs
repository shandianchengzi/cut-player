function sourceInfoArgs(input){return ['-v','error','-select_streams','a:0','-show_entries','format=duration:stream=codec_name','-of','json','-i',input];}
function parseSourceInfo(text){const info=JSON.parse(text),duration=Number(info.format?.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('无法读取视频时长');return {duration,audioCodec:info.streams?.[0]?.codec_name};}
module.exports={sourceInfoArgs,parseSourceInfo};
