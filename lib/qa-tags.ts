/**
 * 标准 QA FailTags 字典
 *
 * 所有 image / video / audio QA 都应从此表中选取标签，
 * 保证 consistency report、dashboard、benchmark 可靠消费。
 */

export interface QATag {
  code: string;
  label: string;
  category: "image" | "video" | "audio" | "common";
  severity: "minor" | "major" | "critical";
  /** 是否与角色一致性相关（供 consistency report 消费） */
  isConsistencyTag?: boolean;
}

export const QA_TAGS: QATag[] = [
  // ── 通用 ──
  { code: "blur", label: "模糊/低清", category: "common", severity: "major" },
  { code: "artifact", label: "伪影/噪点", category: "common", severity: "minor" },
  { code: "watermark", label: "水印", category: "common", severity: "critical" },
  { code: "composition", label: "构图异常", category: "common", severity: "minor" },
  { code: "lighting", label: "光线异常", category: "common", severity: "minor" },

  // ── 角色一致性（isConsistencyTag = true）──
  { code: "face-inconsistency", label: "面部不一致", category: "image", severity: "critical", isConsistencyTag: true },
  { code: "wardrobe-drift", label: "服装漂移", category: "image", severity: "major", isConsistencyTag: true },
  { code: "hairstyle-change", label: "发型变化", category: "image", severity: "major", isConsistencyTag: true },
  { code: "body-proportion", label: "体型比例异常", category: "image", severity: "minor", isConsistencyTag: true },
  { code: "extra-limb", label: "多余肢体", category: "image", severity: "critical", isConsistencyTag: true },
  { code: "missing-limb", label: "肢体缺失", category: "image", severity: "critical", isConsistencyTag: true },

  // ── 图像专用 ──
  { code: "wrong-aspect", label: "画幅比例错误", category: "image", severity: "major" },
  { code: "nsfw", label: "违规内容", category: "image", severity: "critical" },
  { code: "text-error", label: "文字错误/乱码", category: "image", severity: "minor" },
  { code: "wrong-style", label: "风格不符", category: "image", severity: "major" },
  { code: "wrong-scene", label: "场景不符", category: "image", severity: "major" },
  { code: "wrong-shot-type", label: "景别错误", category: "image", severity: "minor" },

  // ── 视频专用 ──
  { code: "motion-jitter", label: "运动抖动", category: "video", severity: "minor" },
  { code: "temporal-inconsistency", label: "帧间不一致", category: "video", severity: "major", isConsistencyTag: true },
  { code: "sync-error", label: "口型音画不同步", category: "video", severity: "major" },
  { code: "motion-artifact", label: "运动伪影", category: "video", severity: "major" },
  { code: "wrong-duration", label: "时长不符", category: "video", severity: "minor" },

  // ── 音频专用 ──
  { code: "wrong-voice", label: "声线错误", category: "audio", severity: "major" },
  { code: "noise", label: "背景噪音", category: "audio", severity: "minor" },
  { code: "cut-off", label: "对白截断", category: "audio", severity: "critical" },
  { code: "wrong-emotion", label: "情绪不符", category: "audio", severity: "minor" },
];

/** 所有与角色一致性相关的标签 codes */
export const CONSISTENCY_TAG_CODES = QA_TAGS
  .filter((t) => t.isConsistencyTag)
  .map((t) => t.code);

/** 按 code 查找标签 */
export function findTag(code: string): QATag | undefined {
  return QA_TAGS.find((t) => t.code === code);
}

/** 给定 failTags JSON 字符串，解析并返回 QATag 对象数组 */
export function parseFailTags(json: string): QATag[] {
  try {
    const codes = JSON.parse(json) as string[];
    return codes.map((code) => findTag(code) ?? { code, label: code, category: "common" as const, severity: "minor" as const });
  } catch {
    return [];
  }
}
