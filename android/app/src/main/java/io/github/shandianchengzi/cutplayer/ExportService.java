package io.github.shandianchengzi.cutplayer;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.*;
import java.lang.ref.WeakReference;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
public final class ExportService extends Service {
 public interface Listener { void onExportState(); }
 public static final AtomicBoolean busy=new AtomicBoolean(),cancelled=new AtomicBoolean();
 public static volatile String status="就绪",sourceName="";
 public static volatile CompletableFuture<Boolean> decision;
 public static volatile WeakReference<Listener> listener=new WeakReference<>(null);
 private static final String CHANNEL="cut-export";private long lastNotification;private boolean running;
 private void update(String text,boolean force){status=text;Listener l=listener.get();if(l!=null)l.onExportState();long now=System.currentTimeMillis();if(force||now-lastNotification>1000){lastNotification=now;if(Build.VERSION.SDK_INT<33||checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED)getSystemService(NotificationManager.class).notify(1,notification());}}
 private Notification notification(){
  PendingIntent content=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,ExportService.class).setAction("cancel"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  return new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("Cut Player · "+sourceName).setContentText(status).setStyle(new Notification.BigTextStyle().bigText(status)).setContentIntent(content).setOngoing(busy.get()).addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"停止切割",stop).build()).build();
 }
 @Override public void onCreate(){super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"视频无损导出",NotificationManager.IMPORTANCE_LOW));}
 public static void cancelExport(){cancelled.set(true);NativeRunner.cancel();CompletableFuture<Boolean> d=decision;if(d!=null)d.complete(false);}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(intent==null)return START_NOT_STICKY;
  if("cancel".equals(intent.getAction())){cancelExport();if(!busy.get())stopSelf();return START_NOT_STICKY;}
  if(!busy.compareAndSet(false,true))return START_NOT_STICKY;
  running=true;cancelled.set(false);sourceName=intent.getStringExtra("name");status="正在读取原视频信息…";
  if(Build.VERSION.SDK_INT>=29)startForeground(1,notification(),Build.VERSION.SDK_INT>=35?ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING:ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(1,notification());
  final Uri source=Uri.parse(intent.getStringExtra("source")),tree=Uri.parse(intent.getStringExtra("tree"));final String notes=intent.getStringExtra("notes");final boolean audio=intent.getBooleanExtra("audio",true);
  new Thread(()->{
   try{
    ExportEngine.Result result=new ExportEngine(this,cancelled).export(source,tree,notes,audio,s->update("导出 "+sourceName+"\n"+s,false),count->{
     decision=new CompletableFuture<>();update("所选目录有 "+count+" 个同名输出，请返回应用确认覆盖",true);
     try{return decision.get(5,TimeUnit.MINUTES);}catch(TimeoutException e){return false;}finally{decision=null;}
    });
    update("导出 "+sourceName+"\n"+result.summary()+"\n输出目录："+tree,true);
   }catch(Exception e){update((cancelled.get()?"已停止切割":"导出未完成")+" · "+sourceName+"\n"+e.getMessage()+"\n已完成和部分文件保留在所选输出目录",true);}
   finally{new Handler(Looper.getMainLooper()).post(()->{running=false;busy.set(false);decision=null;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf(startId);Listener l=listener.get();if(l!=null)l.onExportState();});}
  },"CutPlayerExport").start();
  return START_NOT_STICKY;
 }
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onDestroy(){if(running)cancelExport();super.onDestroy();}
 @Override public void onTimeout(int startId,int type){cancelExport();stopSelf(startId);}
}
