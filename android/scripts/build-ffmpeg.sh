#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
ndk="$ANDROID_NDK_HOME"
toolchain="$ndk/toolchains/llvm/prebuilt/linux-x86_64"
work="$base/.ffmpeg-build"
mkdir -p "$work" "$base/app/src/main/jniLibs" "$base/app/src/main/assets/licenses" "$base/dist"
source_archive="$base/dist/ffmpeg-6.1.1-source.tar.xz"
if [[ ! -s "$source_archive" ]]; then curl --fail --location --retry 4 https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz --output "$source_archive"; fi
tar -xf "$source_archive" -C "$work"
source_dir="$work/ffmpeg-6.1.1"
cp "$source_dir/COPYING.LGPLv2.1" "$base/app/src/main/assets/licenses/FFmpeg-LGPL-2.1.txt"
cp "$base/../LICENSE" "$base/app/src/main/assets/licenses/LICENSE"
cp "$base/../LICENSE-NOTICE.md" "$base/app/src/main/assets/licenses/LICENSE-NOTICE.md"
cp "$base/../COMMERCIAL-LICENSE.md" "$base/app/src/main/assets/licenses/COMMERCIAL-LICENSE.md"
for abi in arm64-v8a x86_64; do
 if [[ "$abi" == arm64-v8a ]]; then arch=aarch64; triple=aarch64-linux-android; else arch=x86_64; triple=x86_64-linux-android; fi
 output="$base/app/src/main/jniLibs/$abi"
 mkdir -p "$output" "$work/$abi"
 if [[ -s "$output/libffmpeg.so" && -s "$output/libffprobe.so" ]]; then continue; fi
 cd "$work/$abi"
 "$source_dir/configure" --target-os=android --arch="$arch" --enable-cross-compile \
  --cc="$toolchain/bin/$triple""26-clang" --cxx="$toolchain/bin/$triple""26-clang++" \
  --ar="$toolchain/bin/llvm-ar" --nm="$toolchain/bin/llvm-nm" --ranlib="$toolchain/bin/llvm-ranlib" --strip="$toolchain/bin/llvm-strip" \
  --sysroot="$toolchain/sysroot" --enable-pic --enable-static --disable-shared \
  --disable-autodetect --disable-network --enable-zlib --enable-small --disable-doc --disable-debug \
  --disable-avdevice --disable-postproc --disable-encoders --disable-hwaccels --disable-filters \
  --disable-x86asm --extra-cflags="-fPIC" --extra-ldflags="-pie -Wl,-z,max-page-size=16384"
 make -j2 ffmpeg ffprobe
 "$toolchain/bin/llvm-strip" ffmpeg ffprobe
 cp ffmpeg "$output/libffmpeg.so"
 cp ffprobe "$output/libffprobe.so"
 cp config.h "$base/dist/ffmpeg-$abi-config.h"
 cp ffbuild/config.mak "$base/dist/ffmpeg-$abi-config.mak"
done
cd "$base"
cp scripts/build-ffmpeg.sh dist/build-ffmpeg.sh
sha256sum dist/ffmpeg-6.1.1-source.tar.xz > dist/ffmpeg-source.sha256
