# Android APK

Android 首版为测试签名安装包，Android 8.0+，实体手机先提供 arm64-v8a。x86_64 包用于模拟器验证。无联网权限，原生 VideoView 预览，内置独立 FFmpeg / FFprobe 6.1.1。

## 使用

1. 打开视频，系统选择器支持多选；文件管理器也可分享 / 打开视频到 Cut Player。
2. 播放、拖动时间轴并记录断点，或粘贴电脑端 breakpoints / names 两行。
3. 选择手机本地输出子文件夹（Android 不允许授权整个 Download 根目录，请在其中新建文件夹）。
4. 点击无损切割。所有视频 / 音轨使用 -c copy，无重新编码。视频保留原容器和全部视频、音频轨道；额外提取第一音轨，AAC 为 .aac，其余为 .mka。
5. 导出显示大小、实际总时长与原片对比；同名先确认，不允许覆盖源视频。停止保留完成和部分文件。
6. 前台服务支持切换应用后继续导出，通知可停止；系统强制停止 / 厂商省电可能中断。
7. 多视频标签分别暂存记录和位置，导出固定原视频 / 记录，期间可编辑下一个。记录重要时请复制备份。

无损指不重编码，不保证任意帧精确切点；与 Windows 一样受关键帧限制。时长相近也不能证明切点完全一致。

首版是移动端核心工作流，不含 Windows 波形、逐帧分析、桌面快捷键和差分自动更新。预览编码取决于手机系统解码器，预览失败不等于无法流复制。文件提供方必须支持可定位的文件描述符；云端虚拟流不支持时请先下载到本地。不会先把整个大视频复制进应用缓存。

## 构建和验证

使用 JDK 17、Gradle 8.9、AGP 8.7.3、SDK 35、NDK 28.0.13004108、CMake 3.22.1。导出引擎通过 JNI fork/exec 执行 APK 内受信任 nativeLibraryDir 中的独立二进制，文件描述符使用 FFmpeg fd: 协议，保持 SAF 授权和随机读写。未使用已停止维护的 FFmpegKit 在线依赖。

设置 ANDROID_NDK_HOME，执行 bash android/scripts/build-ffmpeg.sh，再运行 gradle -p android assembleDebug testDebugUnitTest lintDebug。make-fixtures.sh 生成带 B 帧、双音轨和毫秒切点的主机参考输出，Android 仪器测试比较每个媒体包 SHA256、轨道和时间戳，并检查无音轨、源覆盖保护和真实进程取消。APK native ELF 采用 16 KB 页对齐。

Android 测试 APK 使用调试签名，不是商店正式私有签名发行版；构建缓存尽量沿用测试证书，但不保证后续所有测试包都可覆盖安装。正式签名更换时可能需卸载，卸载会清除应用记录，请先复制备份。

## 第三方许可

应用许可仍为 PolyForm Noncommercial 1.0.0，旧版及第三方权利不变。Android FFmpeg 未启用 --enable-gpl / --enable-nonfree；为独立 LGPL 2.1+ 程序，应用许可不限制该组件权利。发布同一版本对应的官方 FFmpeg 源码归档、构建脚本和配置，未经修改；可自行重建或替换组件后重打包。许可文本随 APK 放在 assets/licenses 中。原始源码：https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz 。
