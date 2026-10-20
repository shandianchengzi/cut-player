#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
assets="$base/app/src/androidTest/assets"
mkdir -p "$assets"
ffmpeg -v error -y -f lavfi -i 'testsrc2=size=96x64:rate=10:duration=12' -f lavfi -i 'sine=frequency=440:duration=12' -f lavfi -i 'sine=frequency=880:duration=12' -map 0:v -map 1:a -map 2:a -c:v libx264 -g 10 -bf 2 -pix_fmt yuv420p -c:a aac "$assets/fixture.mp4"
ffmpeg -v error -y -i "$assets/fixture.mp4" -map 0 -c copy "$assets/fixture.mkv"
ffmpeg -v error -y -i "$assets/fixture.mp4" -map 0:v -c copy "$assets/silent.mp4"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
for type in mp4 mkv; do
 source_end=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$assets/fixture.$type")
 for part in 0 1; do
  if [[ "$part" == 0 ]]; then start=0; end=4.137; else start=4.137; end="$source_end"; fi
  ffmpeg -v error -y -i "$assets/fixture.$type" -ss "$start" -to "$end" -map '0:v?' -map '0:a?' -c copy "$temp/part.$type"
  ffprobe -v error -show_packets -show_data_hash sha256 -show_entries 'packet=stream_index,pts,dts,duration,size,data_hash:stream=codec_type,codec_name' -of json "$temp/part.$type" > "$assets/expected-$type-$part.json"
  ffmpeg -v error -y -i "$temp/part.$type" -map 0:a:0 -c copy -vn "$temp/part.aac"
  ffprobe -v error -show_packets -show_data_hash sha256 -show_entries 'packet=stream_index,pts,dts,duration,size,data_hash:stream=codec_type,codec_name' -of json "$temp/part.aac" > "$assets/expected-aac-$type-$part.json"
 done
done
