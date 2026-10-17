package io.github.shandianchengzi.cutplayer;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
public final class NativeRunner {
 static { System.loadLibrary("cutbridge"); }
 public interface Sink { void onBytes(byte[] bytes); }
 public static native int execute(String executable,String[] args,int inputFd,int outputFd,Sink sink);
 public static native void cancel();
 public static native void reset();
 public static final class Capture implements Sink {
  private final ByteArrayOutputStream text=new ByteArrayOutputStream(),line=new ByteArrayOutputStream();
  private final java.util.function.Consumer<String> progress;
  public Capture(java.util.function.Consumer<String> progress){this.progress=progress;}
  public void onBytes(byte[] bytes){if(text.size()+bytes.length>2*1024*1024)text.reset();text.write(bytes,0,bytes.length);if(progress!=null)for(byte b:bytes){if(b==10){progress.accept(new String(line.toByteArray(),StandardCharsets.UTF_8).trim());line.reset();}else if(line.size()<16384)line.write(b);}}
  public String text(){return new String(text.toByteArray(),StandardCharsets.UTF_8);}
 }
}
