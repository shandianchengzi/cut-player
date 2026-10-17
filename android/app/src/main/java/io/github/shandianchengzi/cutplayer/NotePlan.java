package io.github.shandianchengzi.cutplayer;
import java.util.*;
import java.util.regex.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
public final class NotePlan {
 public static final class Part {
  public final String name;public final double start,end;
  Part(String name,double start,double end){this.name=name;this.start=start;this.end=end;}
 }
 public static List<Part> parse(String text,double duration){
  if(!Double.isFinite(duration)||duration<=0)throw new IllegalArgumentException("无法读取视频时长");
  String[] lines=text.trim().split("\\r?\\n",-1);
  if(lines.length!=2||!lines[0].startsWith("breakpoints:")||!lines[1].startsWith("names:"))throw new IllegalArgumentException("文本必须为 breakpoints 与 names 两行");
  String points=clean(lines[0].substring(12)),labels=clean(lines[1].substring(6));
  String[] times=points.isEmpty()?new String[0]:points.split(",",-1),names=labels.split(",",-1);
  if(names.length!=times.length+1)throw new IllegalArgumentException("names 数量必须比 breakpoints 多一个");
  List<Part> plan=new ArrayList<>();Set<String> used=new HashSet<>();double previous=0;
  double[] bounds=new double[names.length+1];bounds[names.length]=duration;
  for(int i=0;i<times.length;i++){Matcher m=Pattern.compile("^(\\d+):([0-5]\\d)(?:\\.(\\d{3}))?$").matcher(times[i].trim());if(!m.matches())throw new IllegalArgumentException("断点须使用 MM:SS 或 MM:SS.mmm");double t=Double.parseDouble(m.group(1))*60+Integer.parseInt(m.group(2))+(m.group(3)==null?0:Integer.parseInt(m.group(3))/1000.0);if(t<=previous||t>=duration)throw new IllegalArgumentException("断点必须严格递增并小于视频时长");bounds[i+1]=t;previous=t;}
  for(int i=0;i<names.length;i++){String n=names[i].trim();if(n.isEmpty()||n.length()>180||n.matches(".*[<>:\"/\\\\|?*\\x00-\\x1f].*")||n.endsWith(".")||n.endsWith(" ")||n.matches("(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\..*)?$")||!used.add(n.toLowerCase(Locale.ROOT)))throw new IllegalArgumentException("名称无效、重复或包含保留字符");plan.add(new Part(n,bounds[i],bounds[i+1]));}
  return plan;
 }
 private static String clean(String s){return s.trim().replaceFirst("(?:,\\s*)+$","");}
 public static String time(double seconds){long ms=Math.max(0,Math.round(seconds*1000));return String.format(Locale.ROOT,"%02d:%02d:%02d.%03d",ms/3600000,ms/60000%60,ms/1000%60,ms%1000);}
 public static String breakpoint(int seconds){return String.format(Locale.ROOT,"%02d:%02d",seconds/60,seconds%60);}
 public static String initialName(String file,int seconds){
  String stem=file.replaceFirst("\\.[^.]+$","");Matcher dji=Pattern.compile("^DJI_(\\d{14})").matcher(stem);
  if(dji.find())try{return "DJI_"+LocalDateTime.parse(dji.group(1),DateTimeFormatter.ofPattern("yyyyMMddHHmmss")).plusSeconds(seconds).format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))+"x";}catch(Exception ignored){}
  Matcher date=Pattern.compile("(\\d{8})_(\\d{6})").matcher(stem);
  if(date.find())try{String name=LocalDateTime.parse(date.group(1)+date.group(2),DateTimeFormatter.ofPattern("yyyyMMddHHmmss")).plusSeconds(seconds).format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));return stem.substring(0,date.start())+name+"x";}catch(Exception ignored){}
  return stem+(seconds>0?"_"+seconds:"")+"x";
 }
 public static String initial(String file){return "breakpoints:\nnames:"+initialName(file,0);}
 public static String stamp(String text,String file,int seconds){
  List<Part> old=parse(text,Double.MAX_VALUE);if(seconds<=0||seconds<=old.get(old.size()-1).start)throw new IllegalArgumentException("新断点须大于前一个断点");
  String[] lines=text.trim().split("\\r?\\n");String points=clean(lines[0].substring(12)),names=clean(lines[1].substring(6));
  return "breakpoints:"+points+(points.isEmpty()?"":",")+breakpoint(seconds)+"\nnames:"+names+","+initialName(file,seconds);
 }
}
