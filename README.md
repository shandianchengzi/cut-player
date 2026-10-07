# Cut Player

Windows 视频时间记录小工具：[介绍与下载](https://shandianchengzi.github.io/cut-player/) · [Release](https://github.com/shandianchengzi/cut-player/releases/latest)

## 功能

- 左侧本地视频播放器和原生进度条，右侧可编辑时间记录，默认首行是视频文件名。
- 按钮或 `Ctrl+Alt+V` 追加当前 `HH:MM:SS.mmm` 时间；按钮或 `Ctrl+Alt+C` 复制全部文本。
- ↑/↓ 调节音量，←/→ 快退/快进，默认 5% / 5 秒。
- 1/2/3/4 对应 1/2/4/16 倍速，可配置为 0.25—16。
- 上述十个快捷键均可自定义，冲突校验，设置和记录在本机持久保存。
- 编辑记录时方向键与数字保留文本编辑功能，记录和复制组合键仍有效。快捷键为窗口内快捷键。
- 切换视频会询问是否重置记录；记录时间点，不导出裁剪后的媒体文件。

## 下载与运行

支持 Windows 10/11 x64。Release 包含 nsis 安装版和 portable 免安装版。内置 Electron 运行时，无需打开或安装独立浏览器，无需联网播放本地文件。构建未进行代码签名。

支持 Chromium 可解码的 H.264/AAC MP4、WebM 等。MKV/MOV 是否可播放取决于实际编码；不包含通用 FFmpeg 软解码。极高倍速的音频表现取决于 Chromium。

## 上游代码评估

评估了 [wangrongding/tiny-player](https://github.com/wangrongding/tiny-player) 的 `packages/core/src/index.ts`、事件系统、控制器和 README。其核心基于 HTMLVideoElement，技术上可由 Electron 封装成桌面应用；包元数据标记 MIT，上游根目录无独立 LICENSE 文件。软解码在 README 中仍标记 WIP，不是现成的通用桌面解码器。

本项目围绕本地视频与时间记录需求独立实现同类 HTMLVideoElement 播放方案，未复制上游源码或发布其包，避免引入本任务无需的 HLS、模板及构建依赖。不是 tiny-player 原版的二进制打包。

## 开发与发布

Node.js 22：

```sh
npm ci
npm test
npm start
npm run dist
```

Windows 上构建，输出 `dist/` 下的安装包和免安装 EXE。

- 推送 app/test/package 相关修改到 main，自动执行 Windows 测试、打包、上传 Actions Artifact，并创建或更新 package.json 版本对应 Release。
- 新正式版本修改 package.json 的 version 并同步 package-lock.json；同版本重跑会覆盖该版本安装文件。
- 推送 docs 修改自动部署 GitHub Pages；仓库 Pages Source 应设为 GitHub Actions。
- 两个工作流均支持 workflow_dispatch，无需额外发布 Token，使用仓库 GITHUB_TOKEN。

## 验证

`npm test` 覆盖时间格式、快捷键标准化、设置冲突和倍速边界。Windows Release 工作流验证依赖安装与实际 EXE 构建。Windows CI 另启动真实 Electron，验证视频载入、按钮和快捷键记录、系统剪贴板、倍速、进度、音量与设置持久化，并上传界面截图。
