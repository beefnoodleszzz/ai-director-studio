import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { WORKSPACE_DIR, getLocalPath } from "./asset";

export interface AssembleOptions {
  scenes: Array<{
    sceneId: string;
    localVideo?: string | null;
    localImage?: string | null;
    localAudio?: string | null;
    duration?: number;
  }>;
  outputFilename: string;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function imageToVideo(
  imagePath: string,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(["-loop 1"])
      .videoCodec("libx264")
      .outputOptions([
        "-t", String(duration),
        "-pix_fmt", "yuv420p",
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

async function mergeVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(["-c:v copy", "-c:a aac", "-shortest"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

async function concatVideos(
  inputPaths: string[],
  outputPath: string
): Promise<void> {
  const listFile = path.join(WORKSPACE_DIR, `concat_${Date.now()}.txt`);
  const lines = inputPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listFile, lines);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outputPath)
      .on("end", () => {
        fs.unlinkSync(listFile);
        resolve();
      })
      .on("error", (err) => {
        if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
        reject(err);
      })
      .run();
  });
}

export async function assembleEpisode(options: AssembleOptions): Promise<string> {
  const { scenes, outputFilename } = options;
  ensureDir(WORKSPACE_DIR);

  const tempVideos: string[] = [];

  for (const scene of scenes) {
    const tempOut = path.join(WORKSPACE_DIR, `scene_${scene.sceneId}_merged.mp4`);
    const videoDuration = scene.duration ?? 5;

    let videoPath: string;

    if (scene.localVideo) {
      videoPath = getLocalPath(scene.localVideo);
    } else if (scene.localImage) {
      const staticVideo = path.join(WORKSPACE_DIR, `scene_${scene.sceneId}_static.mp4`);
      await imageToVideo(getLocalPath(scene.localImage), videoDuration, staticVideo);
      videoPath = staticVideo;
    } else {
      continue;
    }

    if (scene.localAudio) {
      await mergeVideoAudio(videoPath, getLocalPath(scene.localAudio), tempOut);
      tempVideos.push(tempOut);
    } else {
      tempVideos.push(videoPath);
    }
  }

  const outputPath = path.join(WORKSPACE_DIR, outputFilename);
  if (tempVideos.length === 1) {
    fs.copyFileSync(tempVideos[0], outputPath);
  } else {
    await concatVideos(tempVideos, outputPath);
  }

  return `/workspace/${outputFilename}`;
}
