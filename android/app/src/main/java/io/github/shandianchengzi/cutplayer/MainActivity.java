package io.github.shandianchengzi.cutplayer;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.text.*;
import android.text.method.ScrollingMovementMethod;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.lang.ref.WeakReference;
import java.util.*;
import java.util.concurrent.CompletableFuture;
public final class MainActivity extends Activity implements ExportService.Listener {
 private static final int OPEN=10,TREE=11;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private final ArrayList<Tab> tabs=new ArrayList<>();private Tab active;private boolean filling,dragging;
 private VideoView video;private TextView message,clock,folder;private EditText notes;private SeekBar seek;private LinearLayout tabRow,root;private Button cut,stop,play;private CheckBox audio;private Uri tree;
 private JSONObject records=new JSONObject();private Intent pendingExport;private CompletableFuture<Boolean> shownDecision;
 private static final class Tab {Uri uri;String name,notes;int position;Tab(Uri uri,String name,String notes,int position){this.uri=uri;this.name=name;this.notes=notes;this.position=position;}}
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 private TextView label(String text){TextView t=new TextView(this);t.setText(text);t.setTextColor(0xffe4eaf4);t.setPadding(dp(6),dp(6),dp(6),dp(6));return t;}
 private Button button(String text,LinearLayout row,Runnable action){Button b=new Button(this);b.setText(text);b.setAllCaps(false);row.addView(b);b.setOnClickListener(v->action.run());return b;}
 private LinearLayout row(){LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.HORIZONTAL);return r;}
 private void scroller(LinearLayout row){HorizontalScrollView scroll=new HorizontalScrollView(this);scroll.setFillViewport(false);scroll.addView(row);root.addView(scroll);}
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);getWindow().setStatusBarColor(0xff10151f);getWindow().setNavigationBarColor(0xff10151f);
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(10),dp(8),dp(10),dp(12));root.setBackgroundColor(0xff10151f);scroll.addView(root);setContentView(scroll);root.setOnApplyWindowInsetsListener((view,insets)->{int top,bottom;if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());top=bars.top;bottom=bars.bottom;}else{top=insets.getSystemWindowInsetTop();bottom=insets.getSystemWindowInsetBottom();}view.setPadding(dp(10),dp(8)+top,dp(10),dp(12)+bottom);return insets;});
  root.addView(label("Cut Player · Android "+BuildConfig.VERSION_NAME));
  LinearLayout actions=row();button("打开视频",actions,this::chooseVideos);button("输出目录",actions,this::chooseFolder);button("复制",actions,this::copy);button("初始化",actions,this::initialize);button("关于",actions,this::about);scroller(actions);
  folder=label("请选择手机本地输出文件夹");root.addView(folder);
  message=label("就绪 · 视频和音轨采用 -c copy，不重新编码");message.setTextColor(0xffffcf91);message.setMaxLines(7);message.setMovementMethod(new ScrollingMovementMethod());root.addView(message);
  tabRow=row();scroller(tabRow);
  video=new VideoView(this);root.addView(video,new LinearLayout.LayoutParams(-1,dp(getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE?170:230)));
  video.setOnPreparedListener(mp->{if(active!=null){video.seekTo(active.position);seek.setMax(video.getDuration());updateClock();}});video.setOnCompletionListener(mp->{play.setText("播放");updateClock();});video.setOnErrorListener((mp,what,extra)->{say("该编码无法预览或文件已移动。若文件仍可读取，可尝试直接无损导出。");return true;});
  LinearLayout controls=row();play=button("播放",controls,()->{if(active==null)return;if(video.isPlaying()){video.pause();play.setText("播放");}else{video.start();play.setText("暂停");}});button("−1 秒",controls,()->seek(-1000));button("+1 秒",controls,()->seek(1000));button("记录当前时间",controls,this::stamp);scroller(controls);
  clock=label("00:00:00.000 / 00:00:00.000");root.addView(clock);seek=new SeekBar(this);root.addView(seek);seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar b,int n,boolean user){if(user)video.seekTo(n);}public void onStartTrackingTouch(SeekBar b){dragging=true;}public void onStopTrackingTouch(SeekBar b){dragging=false;updateClock();}});
  audio=new CheckBox(this);audio.setText("同时导出独立无损音频（第一音轨）");audio.setTextColor(0xffe4eaf4);audio.setChecked(getPreferences(0).getBoolean("audio",true));root.addView(audio);
  LinearLayout exports=row();cut=button("无损切割",exports,this::beginExport);stop=button("停止切割",exports,()->{ExportService.cancelExport();say("正在停止切割，已生成文件会保留…");});root.addView(exports);
  root.addView(label("时间记录 · 支持粘贴电脑端 breakpoints / names 两行\n切点受关键帧限制；总时长相近不代表每个切点已核验。"));
  notes=new EditText(this);notes.setTextColor(Color.WHITE);notes.setBackgroundColor(0xff182131);notes.setTextSize(14);notes.setTypeface(android.graphics.Typeface.MONOSPACE);notes.setGravity(Gravity.TOP);notes.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);notes.setMinLines(5);root.addView(notes,new LinearLayout.LayoutParams(-1,dp(180)));
  notes.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){if(!filling&&active!=null){active.notes=s.toString();handler.removeCallbacks(saveDraft);handler.postDelayed(saveDraft,500);}}public void afterTextChanged(Editable e){}});
  restore();receive(getIntent());onExportState();handler.post(tick);
 }
 private void say(String s){message.setText(s);}
 private void chooseVideos(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("video/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,OPEN);}
 private void chooseFolder(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,TREE);}
 private void remember(Uri uri,int flags){try{getContentResolver().takePersistableUriPermission(uri,flags&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION));}catch(SecurityException ignored){}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null){if(request==TREE){pendingExport=null;onExportState();}return;}if(request==OPEN){ArrayList<Uri> uris=uris(data);for(Uri uri:uris){remember(uri,data.getFlags());open(uri);}}else if(request==TREE&&data.getData()!=null){tree=data.getData();remember(tree,data.getFlags());getPreferences(0).edit().putString("tree",tree.toString()).apply();folder.setText("输出目录："+ExportEngine.name(getContentResolver(),DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree))));if(pendingExport!=null)startPending();}}
 private ArrayList<Uri> uris(Intent i){ArrayList<Uri> result=new ArrayList<>();if(i.getClipData()!=null)for(int n=0;n<i.getClipData().getItemCount();n++)result.add(i.getClipData().getItemAt(n).getUri());else if(i.getData()!=null)result.add(i.getData());return result;}
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);receive(intent);}
 private void receive(Intent intent){if(intent==null)return;ArrayList<Uri> files=uris(intent);if(Intent.ACTION_SEND.equals(intent.getAction())){Uri uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(uri!=null)files.add(uri);}if(Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())){ArrayList<Uri> many=intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);if(many!=null)files.addAll(many);}for(Uri uri:files)if(uri!=null&&"content".equals(uri.getScheme())){remember(uri,intent.getFlags());open(uri);}}
 private void capture(){if(active!=null){active.notes=notes.getText().toString();int current=video.getCurrentPosition();if(current>0||active.position==0)active.position=current;}}
 private void open(Uri uri){if(uri==null)return;for(Tab tab:tabs)if(tab.uri.equals(uri)){activate(tab);return;}String name=ExportEngine.name(getContentResolver(),uri);JSONObject old=records.optJSONObject(uri.toString());Tab tab=new Tab(uri,name,old==null?NotePlan.initial(name):old.optString("notes",NotePlan.initial(name)),old==null?0:old.optInt("position"));tabs.add(tab);activate(tab);}
 private void activate(Tab tab){capture();video.stopPlayback();active=tab;filling=true;notes.setText(tab.notes);filling=false;play.setText("播放");video.setVideoURI(tab.uri);renderTabs();save();if(!ExportService.busy.get())say("已打开："+tab.name);}
 private void renderTabs(){tabRow.removeAllViews();for(Tab tab:tabs){LinearLayout box=row();Button b=button(tab.name,box,()->activate(tab));b.setMaxWidth(dp(220));b.setSingleLine(true);b.setEllipsize(TextUtils.TruncateAt.MIDDLE);if(tab==active)b.setTextColor(0xff2265a0);button("×",box,()->close(tab));tabRow.addView(box);}}
 private void close(Tab tab){capture();save();int at=tabs.indexOf(tab);tabs.remove(tab);if(active==tab){video.stopPlayback();active=null;if(!tabs.isEmpty())activate(tabs.get(Math.min(at,tabs.size()-1)));else{filling=true;notes.setText("");filling=false;clock.setText("未打开视频");}}renderTabs();save();}
 private void copy(){((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Cut Player",notes.getText().toString()));say("已复制记录");}
 private void initialize(){if(active==null)return;new AlertDialog.Builder(this).setTitle("初始化当前记录？").setMessage("将清空当前视频已填的断点和名称，需要保留请先复制。").setNegativeButton("取消",null).setPositiveButton("初始化",(d,w)->notes.setText(NotePlan.initial(active.name))).show();}
 private void stamp(){if(active==null){say("请先打开视频");return;}try{int seconds=video.getCurrentPosition()/1000;if(seconds>=video.getDuration()/1000)throw new IllegalArgumentException("不能记录视频末尾");notes.setText(NotePlan.stamp(notes.getText().toString(),active.name,seconds));notes.setSelection(notes.length());save();say("已记录 "+NotePlan.breakpoint(seconds));}catch(Exception e){say(e.getMessage());}}
 private void seek(int delta){if(active!=null)video.seekTo(Math.max(0,Math.min(video.getDuration(),video.getCurrentPosition()+delta)));updateClock();}
 private void updateClock(){if(active!=null){int current=video.getCurrentPosition(),duration=video.getDuration();clock.setText(NotePlan.time(current/1000.0)+" / "+NotePlan.time(Math.max(0,duration)/1000.0));if(!dragging)seek.setProgress(current);}}
 private final Runnable tick=new Runnable(){public void run(){updateClock();handler.postDelayed(this,500);}};
 private final Runnable saveDraft=this::save;
 private void save(){if(notes==null)return;capture();try{JSONArray session=new JSONArray();for(Tab tab:tabs){JSONObject value=new JSONObject().put("name",tab.name).put("notes",tab.notes).put("position",tab.position);records.put(tab.uri.toString(),value);session.put(tab.uri.toString());}getPreferences(0).edit().putString("records",records.toString()).putString("tabs",session.toString()).putString("active",active==null?"":active.uri.toString()).putBoolean("audio",audio.isChecked()).apply();}catch(JSONException e){say("暂存失败，请复制记录备份");}}
 private void restore(){try{records=new JSONObject(getPreferences(0).getString("records","{}"));JSONArray session=new JSONArray(getPreferences(0).getString("tabs","[]"));String selected=getPreferences(0).getString("active","");for(int i=0;i<session.length();i++){String key=session.getString(i);JSONObject value=records.optJSONObject(key);if(value!=null)tabs.add(new Tab(Uri.parse(key),value.optString("name","video.mp4"),value.optString("notes"),value.optInt("position")));}if(!tabs.isEmpty()){Tab pick=tabs.get(0);for(Tab t:tabs)if(t.uri.toString().equals(selected))pick=t;activate(pick);}String saved=getPreferences(0).getString("tree","");if(!saved.isEmpty()){tree=Uri.parse(saved);folder.setText("已保存输出目录，可点击「输出目录」更改");}}catch(Exception e){say("记录恢复失败，请重新选择视频。");}}
 private void beginExport(){if(ExportService.busy.get()||pendingExport!=null)return;if(active==null){say("请先打开视频");return;}capture();save();pendingExport=new Intent(this,ExportService.class).putExtra("source",active.uri.toString()).putExtra("name",active.name).putExtra("notes",active.notes).putExtra("audio",audio.isChecked());if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},21);if(tree==null)chooseFolder();else startPending();}
 private void startPending(){if(pendingExport==null||tree==null)return;Intent job=pendingExport.putExtra("tree",tree.toString());pendingExport=null;startForegroundService(job);handler.postDelayed(this::onExportState,100);}
 @Override public void onExportState(){runOnUiThread(()->{boolean busy=ExportService.busy.get();cut.setEnabled(!busy&&pendingExport==null);audio.setEnabled(!busy);stop.setEnabled(busy);if(busy||!"就绪".equals(ExportService.status))say(ExportService.status);CompletableFuture<Boolean> d=ExportService.decision;if(d!=null&&!d.isDone()&&d!=shownDecision){shownDecision=d;new AlertDialog.Builder(this).setTitle("覆盖同名输出？").setMessage(ExportService.status).setNegativeButton("取消",(a,w)->d.complete(false)).setPositiveButton("覆盖",(a,w)->d.complete(true)).setOnCancelListener(a->d.complete(false)).show();}});}
 private void about(){new AlertDialog.Builder(this).setTitle("Cut Player "+BuildConfig.VERSION_NAME).setMessage("作者：shandianchengzi\n应用：PolyForm Noncommercial 1.0.0，许可范围内非商业用途免费；其他商业用途须书面授权。\nAndroid 首版为测试签名 APK，非商店正式签名版本。\nFFmpeg 6.1.1：LGPL 2.1 或更新版本，未启用 GPL / nonfree 编码库。该第三方组件权利不受应用商业限制。\n源码与 FFmpeg 对应源码包：github.com/shandianchengzi/cut-player\n仅本地处理，无网络权限。").setPositiveButton("知道了",null).show();}
 @Override protected void onResume(){super.onResume();ExportService.listener=new WeakReference<>(this);onExportState();}
 @Override protected void onPause(){save();if(ExportService.listener.get()==this)ExportService.listener.clear();video.pause();play.setText("播放");super.onPause();}
 @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);video.stopPlayback();if(ExportService.listener.get()==this)ExportService.listener.clear();super.onDestroy();}
 @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);video.getLayoutParams().height=dp(c.orientation==Configuration.ORIENTATION_LANDSCAPE?170:230);video.requestLayout();}
}
