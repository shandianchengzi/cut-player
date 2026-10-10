# Cut Player 开发与维护

对应 **v1.5.11**。[README](../README.md) · [使用指南](USER_GUIDE.md)

## 环境与本地运行

使用 Node.js 22。发行目标为 Windows 10 / 11 x64，Windows 打包及安装测试由现有 GitHub Actions 完成。

```sh
npm ci
npm test
npm start
npm run dist
```

`npm ci` 安装 Electron、FFmpeg 等依赖。FFprobe 不由 ffmpeg-static 自动提供；在 Windows 上另下载与 FFmpeg 6.1.1 匹配的 x64 FFprobe 到 `node_modules/ffmpeg-static/ffprobe.exe`。与发布工作流相同的 PowerShell 命令：

```powershell
Invoke-WebRequest 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-win32-x64' -OutFile node_modules/ffmpeg-static/ffprobe.exe
```

`npm run dist` 输出 NSIS 安装包 `dist/Cut-Player-<版本>-x64-Setup.exe`、blockmap、latest.yml 及测试用解包目录 `dist/win-unpacked/`。仅发布安装包，不再生成便携发行版。Electron 运行时、FFmpeg / FFprobe 与第三方声明随包提供。

## 代码入口

| 文件 | 职责 |
| --- | --- |
| app/main.cjs | 窗口、单实例文件转发、配置落盘、IPC、分析和导出调度 |
| app/open-files.cjs | 从启动参数提取有效视频路径 |
| app/preload.cjs | contextBridge 白名单接口 |
| app/renderer.js / index.html / style.css | 播放控制、波形、编辑记录、对话框及名称按钮 |
| app/model.cjs | 快捷键、时间格式、文件名时间、记录校验 / 删除 / 默认名称 |
| app/export.cjs | 分段计划及 FFmpeg 原码流复制参数 |
| app/analyze.cjs | 音量采样、视频帧时间、缓存与分析取消 |
| app/media-source.cjs | 本机随机令牌 HTTP 范围流，使用支持删除共享的 Node 文件读取 |
| app/updates.cjs / update-download.cjs | 更新菜单、重试 / 源切换 / 续传 / 校验 |
| docs/ | 介绍页、使用指南、故障排查、开发说明 |
| release-notes/ | 每个正式版本的发布说明 |

渲染进程禁用 Node 集成，启用 contextIsolation 和 sandbox；主进程 IPC 校验调用窗口。源视频使用仅监听 127.0.0.1 的随机令牌地址，支持 GET / HEAD 和单范围请求，不将整个文件读入内存。浏览器、FFmpeg、FFprobe 读取该流，源路径另用于名称、大小、存在性及缓存检查。相关代码不要改回直接播放 file://，以免重新出现 Windows 占用问题。

## 必须保持的行为

- 所有视频 / 音频导出均使用 `-c copy`；精细模式不能悄悄切换成重编码。
- 删除记录合并时间范围，初始化恢复当前视频初始结构；不得在这两个操作里删除源文件。
- 打开新视频采用页面异步确认，取消保留原内容；单实例打开遵循同一确认流程。
- 播放 / 暂停在松键触发；快进 / 快退允许键盘重复；编辑输入时保留正常文本按键。
- 波形定位保持原播放状态；精细模式开启与方向逐帧操作暂停。
- 分析结果含 token，旧视频分析不能覆盖新视频；波形 / 帧大数组避免重复传输。
- 视频源允许删除共享；后续操作检查缺失文件并保留记录。
- 更新失败保留已下载数据，安装前校验；安装等待切割结束。

## 验证

`npm test` 使用 Node 内置测试运行器。当前版本 23 项测试覆盖配置、时间与名称、记录编辑、分段计划、分析、更新下载，以及源文件范围读取和占用期间删除。

Windows 桌面验证：

```powershell
New-Item -ItemType Directory -Force dist
node scripts/smoke.cjs
node scripts/open-file-smoke.cjs
$env:CUT_PLAYER_PACKAGED_EXE = Join-Path $PWD 'dist/win-unpacked/Cut Player.exe'
node scripts/smoke.cjs
node scripts/open-file-smoke.cjs
```

`smoke.cjs` 验证实际 Electron 播放、焦点、快捷键、文本、波形、配置落盘、视频 / 音频输出与更新下载。 `open-file-smoke.cjs` 验证启动参数、原窗口接收文件、中文 / 空格 / # 路径、取消保留记录以及播放时删除源文件后的提示。CI 还静默安装实际 NSIS 安装包后再运行两套测试。

`scripts/benchmark.cjs` 比较启动和内存表现，发布 CI 对比 v1.5.6 基线，并输出 `performance-before.json` / `performance-after.json`；界面截图为 `dist/app-check.png`。测试结果与产物从对应 Actions 运行查看，不把不同设备的结果当成固定性能承诺。

测试专用环境变量：`CUT_PLAYER_TEST_PROFILE` 隔离用户目录、`CUT_PLAYER_TEST_OUTPUT` 跳过导出目录选择、`CUT_PLAYER_PACKAGED_EXE` 选择待测程序。

## 版本发布

继续使用 [.github/workflows/release.yml](../.github/workflows/release.yml)，不需要另建发布工作流。

1. 更新 `package.json` 和 `package-lock.json` 中应用版本。
2. 新建 `release-notes/v<版本>.md`，写清本版实际变化，并同步 README、CHANGELOG 与介绍页。
3. 推送 main 的 app、test、scripts、release-notes、package 或 release 工作流相关修改。
4. Windows CI 依次测试、比较基线、构建、验证解包程序与实际安装、上传产物、创建 / 更新该版本 Release。
5. 发布 `Setup.exe`、`latest.yml`、`blockmap`，再把安装包与 latest.yml 同步至 Pages 的 `updates/`。

同版本重跑会覆盖该版本发布文件；正式功能修复应发布新版本。工作流使用仓库 GITHUB_TOKEN，无需额外个人发布 Token。包未签名，签名不是现有流水线步骤。

## 文档与 Pages

继续使用 [.github/workflows/pages.yml](../.github/workflows/pages.yml)。推送 docs 或该工作流会部署介绍页；仓库 Pages Source 设为 GitHub Actions。

介绍页部署前从当前最新 Release 下载 Setup.exe 和 latest.yml 到 `docs/updates/`，再上传整份 Pages 产物，避免纯文档部署覆盖备用更新下载。文档改动不必重打安装包或递增应用版本。两条现有工作流均支持 workflow_dispatch。

维护文档时核对以下内容：当前版本、仅安装版下载、按钮文案、默认键、时间命名规则、精细导出的关键帧限制、名称插入与恢复默认、删除 / 初始化语义、数据目录、更新故障提示，以及备用下载入口。历史 release-notes 记录各版当时行为，不用改写成当前说明。

## 许可证与上游

应用代码 MIT；FFmpeg 6.1.1 对应许可证、源码及构建信息见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。项目独立实现 HTMLVideoElement 桌面播放器，未使用 tiny-player 源码或发布其包。
