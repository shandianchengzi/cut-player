#!/usr/bin/env bash
set -euo pipefail
gradle -p android --no-daemon connectedDebugAndroidTest
adb shell am force-stop io.github.shandianchengzi.cutplayer
adb shell am start -W -n io.github.shandianchengzi.cutplayer/.MainActivity
mkdir -p android/dist
python3 - <<'PY'
import re, subprocess, xml.etree.ElementTree as E
def snapshot(name):
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/cut-player-ui.xml'],check=True)
    path='android/dist/'+name+'.xml'
    subprocess.run(['adb','pull','/sdcard/cut-player-ui.xml',path],check=True)
    with open('android/dist/'+name+'.png','wb') as out:
        subprocess.run(['adb','exec-out','screencap','-p'],stdout=out,check=True)
    return ' '.join(n.get('text','') for n in E.parse(path).iter())
text=snapshot('android-check')
assert 'Cut Player' in text and '打开视频' in text, text
size=subprocess.check_output(['adb','shell','wm','size'],text=True)
width,height=map(int,re.findall(r'(\d+)x(\d+)',size)[-1])
for attempt in range(4):
    if '无损切割' in text:
        break
    subprocess.run(['adb','shell','input','swipe',str(width//2),str(height*4//5),str(width//2),str(height//3),'400'],check=True)
    text=snapshot('android-export-controls')
assert '无损切割' in text, text
print('PASS: actual Android activity starts; video and lossless export controls are reachable')
PY
