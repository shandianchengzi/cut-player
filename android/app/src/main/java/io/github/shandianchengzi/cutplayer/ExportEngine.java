package io.github.shandianchengzi.cutplayer;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.*;
import android.system.Os;
import android.system.OsConstants;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;
public final class ExportEngine {
 public interface Progress { void update(String text); }
 public interface Overwrite { boolean allow(int count) throws Exception; }
 public static final class Result {
  public int count,audioCount;public long videoBytes,sourceBytes;public double duration,sourceDuration;
  public String summary(){return "已导出 "+count+" 段视频、"+audioCount+" 段音频\n视频总大小 "+size(videoBytes)+" / 原视频 "+size(sourceBytes)+"\n视频总时长 "+NotePlan.time(duration)+" / 原视频 "+NotePlan.time(sourceDuration)+"（差值 "+String.format(Locale.ROOT,"%+.3f",duration-sourceDuration)+" 秒）";}
 }
 private final Context context;private final ContentResolver resolver;private final AtomicBoolean cancelled;
 public ExportEngine(Context context,AtomicBoolean cancelled){this.context=context;resolver=context.getContentResolver();this.cancelled=cancelled;}
 public static String size(long bytes){return bytes>=1073741824L?String.format(Locale.ROOT,"%.2f GB",bytes/1073741824.0):String.format(Locale.ROOT,"%.2f MB",bytes/1048576.0);}
 public static String name(ContentResolver resolver,Uri uri){try(Cursor c=resolver.query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst()&&c.getString(0)!=null&&!c.getString(0).isEmpty())return c.getString(0);}return "video.mp4";}
 public long bytes(Uri uri){try(ParcelFileDescriptor fd=resolver.openFileDescriptor(uri,"r")){if(fd!=null&&fd.getStatSize()>=0)return fd.getStatSize();}catch(Exception ignored){}try(Cursor c=resolver.query(uri,new String[]{OpenableColumns.SIZE},null,null,null)){if(c!=null&&c.moveToFirst())return c.getLong(0);}return 0;}
 public String run(String binary,List<String> args,Uri source,Uri output,Progress progress) throws Exception {
  check();NativeRunner.Capture capture=new NativeRunner.Capture(progress==null?null:progress::update);
  try(ParcelFileDescriptor in=resolver.openFileDescriptor(source,"r");ParcelFileDescriptor out=output==null?null:resolver.openFileDescriptor(output,"rwt")){
   if(in==null||output!=null&&out==null)throw new IOException("无法打开文件");
   try{Os.lseek(in.getFileDescriptor(),0,OsConstants.SEEK_SET);if(out!=null)Os.lseek(out.getFileDescriptor(),0,OsConstants.SEEK_SET);}catch(Exception e){throw new IOException("文件提供方不支持无损切割所需的随机读写，请选择手机本地文件和本地文件夹",e);}
   String path=context.getApplicationInfo().nativeLibraryDir+"/lib"+binary+".so";
   int exit=NativeRunner.execute(path,args.toArray(new String[0]),in.getFd(),out==null?-1:out.getFd(),capture);
   check();if(exit!=0)throw new IOException(binary+" 失败（"+exit+"）："+tail(capture.text(),1800));
   return capture.text();
  }
 }
 private static String tail(String text,int length){return text.length()>length?text.substring(text.length()-length):text;}
 public JSONObject info(Uri source) throws Exception {return new JSONObject(run("ffprobe",Arrays.asList("-v","error","-show_entries","format=duration:stream=codec_type,codec_name","-of","json","-fd","3","-i","fd:"),source,null,null));}
 public double duration(Uri source) throws Exception {double d=info(source).getJSONObject("format").getDouble("duration");if(!Double.isFinite(d)||d<=0)throw new IOException("无法读取视频时长");return d;}
 public Result export(Uri source,Uri tree,String text,boolean audio,Progress progress,Overwrite overwrite) throws Exception {
  NativeRunner.reset();check();String filename=name(resolver,source),extension=filename.contains(".")?filename.substring(filename.lastIndexOf('.')).toLowerCase(Locale.ROOT):".mp4";
  String format=switch(extension){case ".mp4",".m4v"->"mp4";case ".mov"->"mov";case ".mkv"->"matroska";case ".webm"->"webm";case ".avi"->"avi";case ".mts",".m2ts",".ts"->"mpegts";default->throw new IOException("暂不支持该输出容器："+extension);};
  JSONObject meta=info(source);Result result=new Result();result.sourceDuration=meta.getJSONObject("format").getDouble("duration");result.sourceBytes=bytes(source);
  JSONArray streams=meta.optJSONArray("streams");String codec=null;if(streams!=null)for(int i=0;i<streams.length();i++)if("audio".equals(streams.getJSONObject(i).optString("codec_type"))){codec=streams.getJSONObject(i).optString("codec_name");break;}
  List<NotePlan.Part> plan=NotePlan.parse(text,result.sourceDuration);String audioExt="aac".equals(codec)?".aac":".mka";
  Map<String,Uri> children=children(tree);List<String> targets=new ArrayList<>();for(NotePlan.Part p:plan){targets.add(p.name+extension);if(audio&&codec!=null)targets.add(p.name+audioExt);}
  int conflicts=0;for(String target:targets){Uri exists=children.get(target.toLowerCase(Locale.ROOT));if(exists!=null){if(sameDocument(source,exists)||target.equalsIgnoreCase(filename))throw new IOException("输出文件与原视频相同或同名，请更改名称或输出文件夹");conflicts++;}}
  if(conflicts>0&&!overwrite.allow(conflicts))throw new CancellationException("已取消覆盖");
  int index=0;
  for(NotePlan.Part part:plan){check();index++;final int current=index;Uri video=create(tree,children,part.name+extension,switch(format){case "mp4"->"video/mp4";case "mov"->"video/quicktime";case "matroska"->"video/x-matroska";case "webm"->"video/webm";case "avi"->"video/x-msvideo";default->"video/mp2t";});
   progress.update("正在导出 "+index+"/"+plan.size()+"："+part.name);double completed=result.duration;long completedBytes=result.videoBytes;long[] written={0};double[] seconds={0};
   List<String> args=new ArrayList<>(Arrays.asList("-hide_banner","-nostdin","-y","-loglevel","error","-progress","pipe:1","-stats_period","1","-nostats","-fd","3","-i","fd:","-ss",Double.toString(part.start),"-to",Double.toString(part.end),"-map","0:v?","-map","0:a?","-c","copy","-fd","4","-f",format,"fd:"));
   run("ffmpeg",args,source,video,line->{if(line.startsWith("total_size="))try{written[0]=Long.parseLong(line.substring(11));}catch(NumberFormatException ignored){}if(line.startsWith("out_time_us="))try{seconds[0]=Math.max(0,Long.parseLong(line.substring(12))/1000000.0);}catch(NumberFormatException ignored){}if(line.startsWith("progress="))progress.update("正在导出 "+current+"/"+plan.size()+"："+part.name+"\n本段 "+String.format(Locale.ROOT,"%.1f",Math.min(99.9,seconds[0]/(part.end-part.start)*100))+"% · 已导出视频 "+size(completedBytes+written[0])+" / 原视频 "+size(result.sourceBytes)+"\n已导出视频总时长 "+NotePlan.time(completed+Math.min(part.end-part.start,seconds[0]))+" / 总时长 "+NotePlan.time(result.sourceDuration));});
   progress.update("视频写入完成，正在核对时长："+part.name);result.videoBytes+=bytes(video);result.duration+=duration(video);result.count++;
   if(audio&&codec!=null){Uri sound=create(tree,children,part.name+audioExt,"aac".equals(codec)?"audio/aac":"audio/x-matroska");progress.update("正在提取音频 "+index+"/"+plan.size()+"："+part.name);
    run("ffmpeg",Arrays.asList("-hide_banner","-nostdin","-y","-v","error","-fd","3","-i","fd:","-map","0:a:0","-c","copy","-vn","-fd","4","-f","aac".equals(codec)?"adts":"matroska","fd:"),video,sound,null);result.audioCount++;
   }
  }
  return result;
 }
 private void check(){if(cancelled.get())throw new CancellationException("已停止切割");}
 private Map<String,Uri> children(Uri tree){Map<String,Uri> files=new HashMap<>();String id=DocumentsContract.getTreeDocumentId(tree);Uri list=DocumentsContract.buildChildDocumentsUriUsingTree(tree,id);try(Cursor c=resolver.query(list,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){if(c!=null)while(c.moveToNext())files.put(c.getString(1).toLowerCase(Locale.ROOT),DocumentsContract.buildDocumentUriUsingTree(tree,c.getString(0)));}return files;}
 private Uri create(Uri tree,Map<String,Uri> children,String name,String mime) throws Exception {Uri existing=children.get(name.toLowerCase(Locale.ROOT));if(existing!=null)return existing;Uri parent=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));Uri output=DocumentsContract.createDocument(resolver,parent,mime,name);if(output==null)throw new IOException("无法创建输出文件："+name);children.put(name.toLowerCase(Locale.ROOT),output);return output;}
 private boolean sameDocument(Uri a,Uri b){if(a.equals(b))return true;if(Objects.equals(a.getAuthority(),b.getAuthority()))try{if(DocumentsContract.getDocumentId(a).equals(DocumentsContract.getDocumentId(b)))return true;}catch(Exception ignored){}try(ParcelFileDescriptor fa=resolver.openFileDescriptor(a,"r");ParcelFileDescriptor fb=resolver.openFileDescriptor(b,"r")){if(fa!=null&&fb!=null){android.system.StructStat sa=Os.fstat(fa.getFileDescriptor()),sb=Os.fstat(fb.getFileDescriptor());return sa.st_ino>0&&sa.st_dev==sb.st_dev&&sa.st_ino==sb.st_ino;}}catch(Exception ignored){}return false;}
}
