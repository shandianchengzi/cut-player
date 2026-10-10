# Bundled FFmpeg

FFmpeg is invoked as a separate executable with stream copy only. The ffmpeg-static 5.3.0 package distributes FFmpeg binaries under GPL-3.0-or-later; its LICENSE is included next to the executable. Starting with v1.5.12, Cut Player application code is offered under PolyForm Noncommercial 1.0.0, with separately negotiated paid commercial licensing. Previously MIT-released versions retain their original rights. See LICENSE-NOTICE.md. This application policy does not relicense FFmpeg or restrict the rights granted by its GPL license.

Binary release and corresponding source/build material:
https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
https://github.com/eugeneware/ffmpeg-static
https://www.gyan.dev/ffmpeg/builds/
https://github.com/FFmpeg/FFmpeg/commit/e38092ef93
https://ffmpeg.org/

No changes are made to the FFmpeg executable. The bundled FFmpeg-README includes the exact upstream source revision, build configuration and external library versions. FFmpeg-LICENSE contains the binary distribution license.

The noncommercial / paid commercial policy applies only to rights held by the Cut Player author. Electron, Chromium, FFprobe and other dependencies remain under their respective licenses and notices. Bundled Electron/Chromium notices and npm dependency license files must be preserved when redistributing. Separate-process invocation is not a claim to ownership of those components; their distribution requirements continue to apply.
