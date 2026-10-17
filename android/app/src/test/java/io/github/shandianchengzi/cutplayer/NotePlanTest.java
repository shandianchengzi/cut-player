package io.github.shandianchengzi.cutplayer;
import org.junit.Test;
import static org.junit.Assert.*;
public class NotePlanTest {
 @Test public void partitionsAndMilliseconds(){var p=NotePlan.parse("breakpoints:00:04.137,\nnames:甲,乙,",12);assertEquals(2,p.size());assertEquals(4.137,p.get(0).end,1e-9);assertEquals(4.137,p.get(1).start,1e-9);assertEquals(12,p.get(1).end,1e-9);}
 @Test public void rejectsBadPlans(){for(String text:new String[]{"breakpoints:\nnames:../x","breakpoints:00:04\nnames:A,a","breakpoints:00:13\nnames:a,b","breakpoints:00:04,00:03\nnames:a,b,c","breakpoints:\nnames:CON"}){try{NotePlan.parse(text,12);fail(text);}catch(IllegalArgumentException expected){}}}
 @Test public void sourceNamesAndStamp(){assertEquals("DJI_20260927202651x",NotePlan.initialName("DJI_20260927202651_0032_D.MP4",0));assertEquals("DJI_20260927202836x",NotePlan.initialName("DJI_20260927202651_0032_D.MP4",105));assertEquals("breakpoints:00:03\nnames:ax,a_3x",NotePlan.stamp(NotePlan.initial("a.mp4"),"a.mp4",3));}
 @Test public void longDuration(){assertEquals("01:02:03.004",NotePlan.time(3723.004));}
}
