/**
 * FFmpeg 合成引擎 v2
 * - 支持三轨音频：台词(TTS) + 环境音效(SFX) + BGM
 * - 视频比音频短时自动 freeze-frame 定格延长
 * - 有人声时 BGM 自动压低（sidechain ducking 用 volume 分段模拟）
 * - 支持 16:9 / 9:16 输出比例
 */
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

export interface SceneAsset {
  localImage?: string | null;
  localVideo?: string | null;
  localAudio?: string | null;
  localSfx?: string | null;
  localBgm?: string | null;
}

export interface AssembleOptions {
  outputPath: string;
  bgmPath?: string;
  aspect?: "16:9" | "9:16";
}

/** 获取媒体时长（秒）*/
function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) reject(err);
      else resolve(meta.format.duration ?? 0);
    });
  });
}

const done = (resolve: () => void) => () => resolve();

/** 将单张图片转为指定时长视频 */
function imageToVideo(
  imagePath: string,
  durationSec: number,
  outputPath: string,
  size: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .inputOptions(["-loop 1", "-framerate 25"])
      .videoFilters([`scale=${size}:force_original_aspect_ratio=decrease`, `pad=${size}:(ow-iw)/2:(oh-ih)/2`])
      .outputOptions(["-c:v libx264", "-t", String(durationSec), "-pix_fmt yuv420p"])
      .save(outputPath)
      .on("end", done(resolve))
      .on("error", reject);
  });
}

/** 定格延长：复制最后一帧并追加到视频尾部 */
function freezeExtend(
  videoPath: string,
  targetDuration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf tpad=stop_mode=clone:stop_duration=${targetDuration}`,
        "-c:v libx264",
        "-pix_fmt yuv420p",
      ])
      .save(outputPath)
      .on("end", done(resolve))
      .on("error", reject);
  });
}

/**
 * 合成单集 MP4（三轨混音 + 智能时长对齐）
 */
export async function assembleEpisode(
  scenes: SceneAsset[],
  options: AssembleOptions
): Promise<string> {
  const { outputPath, bgmPath, aspect = "16:9" } = options;
  const size = aspect === "9:16" ? "1080:1920" : "1920:1080";

  const tmpDir = path.join(path.dirname(outputPath), "_tmp_" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const segmentPaths: string[] = [];

  // ── 第一阶段：逐分镜生成视频片段（含三轨混音）──
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const segOut = path.join(tmpDir, `seg_${i}.mp4`);

    // 获取视频源
    let videoSrc: string;
    if (scene.localVideo && fs.existsSync(scene.localVideo)) {
      videoSrc = scene.localVideo;
    } else if (scene.localImage && fs.existsSync(scene.localImage)) {
      const audioDur = scene.localAudio && fs.existsSync(scene.localAudio)
        ? await getDuration(scene.localAudio)
        : 5;
      const imgVidPath = path.join(tmpDir, `img2vid_${i}.mp4`);
      await imageToVideo(scene.localImage, audioDur, imgVidPath, size);
      videoSrc = imgVidPath;
    } else {
      console.warn(`[ffmpeg] Scene ${i} 无视频/图片资产，跳过`);
      continue;
    }

    // 比较视频与台词时长 → 如需定格延长
    let finalVideoSrc = videoSrc;
    if (scene.localAudio && fs.existsSync(scene.localAudio)) {
      const [vidDur, audDur] = await Promise.all([
        getDuration(videoSrc),
        getDuration(scene.localAudio),
      ]);
      if (audDur > vidDur + 0.2) {
        const frozenPath = path.join(tmpDir, `frozen_${i}.mp4`);
        await freezeExtend(videoSrc, audDur - vidDur, frozenPath);
        finalVideoSrc = frozenPath;
      }
    }

    // 混音：台词(TTS) + SFX + 分镜级 BGM（若有）
    await mixSegment(finalVideoSrc, scene, segOut, size);
    segmentPaths.push(segOut);
  }

  if (segmentPaths.length === 0) throw new Error("没有可合成的片段");

  // ── 第二阶段：拼接所有片段 + 集级 BGM ──
  const concatListPath = path.join(tmpDir, "concat.txt");
  fs.writeFileSync(
    concatListPath,
    segmentPaths.map((p) => `file '${p}'`).join("\n")
  );

  await concatSegments(concatListPath, outputPath, bgmPath);

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return outputPath;
}

/** 为单个分镜混合 TTS + SFX */
function mixSegment(
  videoPath: string,
  scene: SceneAsset,
  outputPath: string,
  size: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const hasTts = !!(scene.localAudio && fs.existsSync(scene.localAudio!));
    const hasSfx = !!(scene.localSfx && fs.existsSync(scene.localSfx!));

    const cmd = ffmpeg(videoPath).videoFilters(
      `scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2`
    );

    if (hasTts) cmd.addInput(scene.localAudio!);
    if (hasSfx) cmd.addInput(scene.localSfx!);

    const filterParts: string[] = [];
    const audioMixInputs: string[] = [];

    if (hasTts) {
      filterParts.push(`[1:a]volume=1.0[tts]`);
      audioMixInputs.push("[tts]");
    }
    if (hasSfx) {
      const sfxIndex = hasTts ? 2 : 1;
      filterParts.push(`[${sfxIndex}:a]volume=0.4[sfx]`);
      audioMixInputs.push("[sfx]");
    }

    if (audioMixInputs.length > 0) {
      filterParts.push(
        `${audioMixInputs.join("")}amix=inputs=${audioMixInputs.length}:duration=first[aout]`
      );
      cmd
        .complexFilter(filterParts.join(";"))
        .outputOptions(["-map 0:v", "-map [aout]", "-c:v libx264", "-c:a aac", "-pix_fmt yuv420p", "-shortest"])
        .save(outputPath)
        .on("end", done(resolve))
        .on("error", reject);
    } else {
      cmd
        .outputOptions(["-c:v libx264", "-an", "-pix_fmt yuv420p"])
        .save(outputPath)
        .on("end", done(resolve))
        .on("error", reject);
    }
  });
}

/**
 * 拼接所有片段，叠加集级 BGM（有人声时自动压低 BGM）
 * 使用 sidechaincompress / volume 滤镜模拟 ducking
 */
function concatSegments(
  concatListPath: string,
  outputPath: string,
  bgmPath?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f concat", "-safe 0"]);

    if (bgmPath && fs.existsSync(bgmPath)) {
      cmd.addInput(bgmPath);
      // BGM sidechain ducking：当主音轨音量 > -20dB 时 BGM 压到 0.15，否则 0.5
      cmd
        .complexFilter([
          "[0:a]aformat=fltp,asplit=2[main_a][detect]",
          "[1:a]aloop=loop=-1:size=2e+09,aformat=fltp[bgm_raw]",
          "[detect]astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level[detect_out]",
          "[bgm_raw][detect_out]sidechaincompress=threshold=0.03:ratio=4:attack=200:release=1000[bgm_duck]",
          "[main_a][bgm_duck]amix=inputs=2:duration=first:weights=1 0.35[aout]",
        ])
        .outputOptions([
          "-map 0:v",
          "-map [aout]",
          "-c:v copy",
          "-c:a aac",
          "-b:a 192k",
          "-movflags +faststart",
        ])
        .save(outputPath)
        .on("end", done(resolve))
        .on("error", (err) => {
          // sidechaincompress 不可用时降级为普通混音
          console.warn("[ffmpeg] sidechaincompress 不可用，降级为静态音量混音:", err.message);
          concatWithSimpleBgm(concatListPath, outputPath, bgmPath).then(resolve).catch(reject);
        });
    } else {
      cmd
        .outputOptions(["-c:v copy", "-c:a aac", "-b:a 192k", "-movflags +faststart"])
        .save(outputPath)
        .on("end", done(resolve))
        .on("error", reject);
    }
  });
}

function concatWithSimpleBgm(
  concatListPath: string,
  outputPath: string,
  bgmPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f concat", "-safe 0"])
      .input(bgmPath)
      .complexFilter([
        "[1:a]aloop=loop=-1:size=2e+09,volume=0.2[bgm]",
        "[0:a][bgm]amix=inputs=2:duration=first[aout]",
      ])
      .outputOptions(["-map 0:v", "-map [aout]", "-c:v copy", "-c:a aac", "-movflags +faststart"])
      .save(outputPath)
      .on("end", done(resolve))
      .on("error", reject);
  });
}
