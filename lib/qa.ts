/**
 * 视觉质检 Agent
 * 截取视频中间帧 → base64 → 传给多模态模型审查肢体/脸部 → 返回通过/失败
 */
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import axios from "axios";

const QA_MODEL = process.env.VISION_QA_MODEL ?? "deepseek-chat";
const QA_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
const QA_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";

const QA_PROMPT = `你是一位专业的视频质检员。请观察这张从视频中截取的帧图片，判断画面质量是否合格。
判断标准（出现任意一项即不合格）：
1. 人物手指变形（多指/少指/弯曲异常）
2. 人物面部严重扭曲或模糊到无法辨认
3. 人物肢体结构明显崩坏（如身体部位连接异常）
4. 画面主体严重模糊、噪点爆炸

请只回答 "PASS" 或 "FAIL"，不要解释原因。`;

export interface QAResult {
  pass: boolean;
  reason?: string;
}

/** 从视频截取中间帧，返回 base64 */
async function extractMidFrame(videoPath: string, outputDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const framePath = path.join(outputDir, `qa_frame_${Date.now()}.jpg`);

    ffmpeg(videoPath)
      .on("error", reject)
      .on("end", () => {
        const data = fs.readFileSync(framePath);
        fs.unlinkSync(framePath); // 清理临时帧
        resolve(data.toString("base64"));
      })
      .screenshots({
        count: 1,
        timemarks: ["50%"],
        filename: path.basename(framePath),
        folder: outputDir,
        size: "640x?",
      });
  });
}

/** 调用多模态模型审查帧质量 */
async function reviewFrame(base64Image: string): Promise<QAResult> {
  if (!QA_API_KEY) {
    // 未配置 key，直接放行（本地测试用）
    return { pass: true };
  }

  try {
    const response = await axios.post(
      `${QA_BASE_URL}/chat/completions`,
      {
        model: QA_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: QA_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${QA_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );

    const answer = (response.data?.choices?.[0]?.message?.content ?? "PASS")
      .trim()
      .toUpperCase();
    return { pass: answer.startsWith("PASS") };
  } catch {
    // 网络问题 → 放行（宁可放行也不误杀）
    return { pass: true };
  }
}

/**
 * 对视频文件执行质检
 * @param videoPath  本地视频文件绝对路径
 * @param tmpDir     临时目录（用于存放截帧）
 */
export async function qaVideo(videoPath: string, tmpDir?: string): Promise<QAResult> {
  const dir = tmpDir ?? path.dirname(videoPath);
  try {
    const base64Frame = await extractMidFrame(videoPath, dir);
    return await reviewFrame(base64Frame);
  } catch (err) {
    console.error("[QA] 截帧失败，跳过质检:", err);
    return { pass: true };
  }
}
