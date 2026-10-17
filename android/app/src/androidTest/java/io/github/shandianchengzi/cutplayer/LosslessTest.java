package io.github.shandianchengzi.cutplayer;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.*;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
@RunWith(AndroidJUnit4.class)
public class LosslessTest {
 private Context app,test;private Uri tree;private ExportEngine engine;
 private Uri doc(String name){return DocumentsContract.buildDocumentUriUsingTree(tree,name);}
 @Before public void setup() throws Exception {InstrumentationRegistry.getInstrumentation().getUiAutomation().adoptShellPermissionIdentity("android.permission.MANAGE_DOCUMENTS");app=InstrumentationRegistry.getInstrumentation().getTargetContext();test=InstrumentationRegistry.getInstrumentation().getContext();tree=DocumentsContract.buildTreeDocumentUri(FixtureProvider.AUTH,"root");engine=new ExportEngine(app,new AtomicBoolean());for(String name:new String[]{"fixture.mp4","fixture.mkv","silent.mp4"}){Uri uri=doc(name);try{DocumentsContract.deleteDocument(app.getContentResolver(),uri);}catch(Exception ignored){}DocumentsContract.createDocument(app.getContentResolver(),doc("root"),"application/octet-stream",name);try(InputStream in=test.getAssets().open(name);OutputStream out=app.getContentResolver().openOutputStream(uri,"wt")){in.transferTo(out);}}}
 @After public void releasePermissions(){InstrumentationRegistry.getInstrumentation().getUiAutomation().dropShellPermissionIdentity();}
 private String asset(String name)throws Exception{try(InputStream in=test.getAssets().open(name)){return new String(in.readAllBytes(),StandardCharsets.UTF_8);}}
 private JSONObject signature(Uri uri)throws Exception{return new JSONObject(engine.run("ffprobe",Arrays.asList("-v","error","-show_packets","-show_data_hash","sha256","-show_entries","packet=stream_index,pts,dts,duration,size,data_hash:stream=codec_type,codec_name","-of","json","-fd","3","-i","fd:"),uri,null,null));}
 private void equalSignature(String expected,Uri actual)throws Exception {JSONObject a=new JSONObject(asset(expected)),b=signature(actual);assertEquals(a.getJSONArray("packets").toString(),b.getJSONArray("packets").toString());assertEquals(a.getJSONArray("streams").toString(),b.getJSONArray("streams").toString());}
 @Test public void mp4AndMkvPacketsMatchDesktop()throws Exception{
  for(String type:new String[]{"mp4","mkv"}){String prefix="android-"+type;List<String> progress=new ArrayList<>();
   ExportEngine.Result result=engine.export(doc("fixture."+type),tree,"breakpoints:00:04.137\nnames:"+prefix+"-a,"+prefix+"-b",true,progress::add,n->true);
   assertEquals(2,result.count);assertEquals(2,result.audioCount);assertTrue(result.videoBytes>0);assertTrue(Math.abs(result.duration-result.sourceDuration)<1.1);assertTrue(progress.stream().anyMatch(s->s.contains("正在导出")));
   equalSignature("expected-"+type+"-0.json",doc(prefix+"-a."+type));equalSignature("expected-"+type+"-1.json",doc(prefix+"-b."+type));
   equalSignature("expected-aac-"+type+"-0.json",doc(prefix+"-a.aac"));equalSignature("expected-aac-"+type+"-1.json",doc(prefix+"-b.aac"));
  }
 }
 @Test public void silentAndSourceOverwriteGuard()throws Exception{
  ExportEngine.Result result=engine.export(doc("silent.mp4"),tree,"breakpoints:\nnames:silent-export",true,s->{},n->true);assertEquals(1,result.count);assertEquals(0,result.audioCount);
  try{engine.export(doc("fixture.mp4"),tree,"breakpoints:\nnames:fixture",false,s->{},n->true);fail("source overwrite allowed");}catch(IOException expected){assertTrue(expected.getMessage().contains("原视频相同"));}
 }
 @Test public void aliasSourceOverwriteGuard()throws Exception {
  long before=engine.bytes(doc("fixture.mp4"));
  try{engine.export(doc("alias.mp4"),tree,"breakpoints:\nnames:fixture",false,s->{},n->true);fail("alias source overwritten");}catch(IOException expected){assertTrue(expected.getMessage().contains("原视频相同"));}
  assertEquals(before,engine.bytes(doc("fixture.mp4")));
 }
 @Test public void cancellationStopsNativeProcess()throws Exception{
  NativeRunner.reset();try(android.os.ParcelFileDescriptor in=app.getContentResolver().openFileDescriptor(doc("fixture.mp4"),"r")){
   int[] code={0};Thread worker=new Thread(()->code[0]=NativeRunner.execute(app.getApplicationInfo().nativeLibraryDir+"/libffmpeg.so",new String[]{"-v","error","-re","-fd","3","-i","fd:","-map","0:v","-c","copy","-f","null","-"},in.getFd(),-1,new NativeRunner.Capture(null)));
   worker.start();Thread.sleep(250);NativeRunner.cancel();worker.join(5000);assertFalse("cancel did not stop FFmpeg",worker.isAlive());assertTrue(code[0]!=0);
  }
 }
}
