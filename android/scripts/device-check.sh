#!/usr/bin/env bash
set -euo pipefail
gradle -p android --no-daemon connectedDebugAndroidTest
adb shell am force-stop io.github.shandianchengzi.cutplayer
adb shell am start -W -n io.github.shandianchengzi.cutplayer/.MainActivity
mkdir -p android/dist
adb shell uiautomator dump /sdcard/cut-player-ui.xml
adb pull /sdcard/cut-player-ui.xml android/dist/android-ui.xml
adb exec-out screencap -p > android/dist/android-check.png
python3 - <<'PY'
import xml.etree.ElementTree as E
root=E.parse('android/dist/android-ui.xml')
text=' '.join(n.get('text','') for n in root.iter())
for expected in ['Cut Player','打开视频','无损切割']:
    assert expected in text, text
print('PASS: actual Android activity starts and exposes video / lossless export controls')
PY
