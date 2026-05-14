"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Palette, Camera, AlertTriangle, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface StyleBibleData {
  id?: string;
  projectId: string;
  genreTag: string;
  visualStyle: string;
  colorStrategy: string;
  shotPreference: string;
  imageDensity: string;
  eraAesthetic: string;
  setConstraints: string;
  propConstraints: string;
  negativeKeywords: string;
  mangaLayoutStyle: string;
}

interface Props {
  initialData?: Partial<StyleBibleData>;
  projectId: string;
  onSave?: (data: StyleBibleData) => Promise<void>;
}

const VISUAL_STYLES = [
  "写实电影级",
  "韩剧清新风",
  "悬疑暗调",
  "古风水墨",
  "赛博朋克",
  "日系漫改",
  "欧美漫画",
  "国风仙侠",
];

const ERA_AESTHETICS = ["现代都市", "近现代民国", "古代（唐宋）", "古代（明清）", "架空古代", "未来科幻", "异世界"];

export function StyleBibleEditor({ initialData, projectId, onSave }: Props) {
  const [data, setData] = useState<StyleBibleData>({
    projectId,
    genreTag: "",
    visualStyle: "",
    colorStrategy: "",
    shotPreference: "",
    imageDensity: "",
    eraAesthetic: "",
    setConstraints: "",
    propConstraints: "",
    negativeKeywords: "",
    mangaLayoutStyle: "",
    ...initialData,
  });

  const [saving, setSaving] = useState(false);
  const [negInput, setNegInput] = useState("");

  function update<K extends keyof StyleBibleData>(key: K, value: StyleBibleData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function addNegKeyword() {
    if (!negInput.trim()) return;
    const current = data.negativeKeywords
      ? data.negativeKeywords.split(",").map((t) => t.trim())
      : [];
    if (!current.includes(negInput.trim())) {
      update("negativeKeywords", [...current, negInput.trim()].join(", "));
    }
    setNegInput("");
  }

  function removeNegKeyword(kw: string) {
    const current = data.negativeKeywords
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== kw);
    update("negativeKeywords", current.join(", "));
  }

  async function handleSave() {
    if (!data.visualStyle.trim() && !data.genreTag.trim()) {
      toast.error("至少填写视觉流派或题材标签");
      return;
    }
    setSaving(true);
    try {
      await onSave?.(data);
      toast.success("风格圣经已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const negKeywords = data.negativeKeywords
    ? data.negativeKeywords
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">风格圣经</h2>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>

      {/* ─── 基础定性 ─── */}
      <section className="space-y-4">
        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wider flex items-center gap-2">
          <Palette className="h-3.5 w-3.5" />
          基础定性
        </h3>

        <div className="space-y-1.5">
          <Label>题材标签</Label>
          <Input
            value={data.genreTag}
            onChange={(e) => update("genreTag", e.target.value)}
            placeholder="如：霸总甜宠 / 复仇爽剧 / 悬疑惊悚"
          />
        </div>

        <div className="space-y-2">
          <Label>视觉流派</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {VISUAL_STYLES.map((style) => (
              <Badge
                key={style}
                variant={data.visualStyle === style ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => update("visualStyle", data.visualStyle === style ? "" : style)}
              >
                {style}
              </Badge>
            ))}
          </div>
          <Input
            value={data.visualStyle}
            onChange={(e) => update("visualStyle", e.target.value)}
            placeholder="或自定义填写"
          />
        </div>

        <div className="space-y-2">
          <Label>参考时代气质</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {ERA_AESTHETICS.map((era) => (
              <Badge
                key={era}
                variant={data.eraAesthetic === era ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => update("eraAesthetic", data.eraAesthetic === era ? "" : era)}
              >
                {era}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* ─── 视觉规则 ─── */}
      <section className="space-y-4">
        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wider flex items-center gap-2">
          <Camera className="h-3.5 w-3.5" />
          视觉规则
        </h3>

        {[
          {
            key: "colorStrategy",
            label: "色彩策略",
            placeholder: "如：低饱和度冷色调为主，强调场景用暖色点缀，禁用高饱和原色",
          },
          {
            key: "shotPreference",
            label: "镜头偏好",
            placeholder: "如：情感戏偏好 CU/ECU 特写，动作戏使用 FS 全身，偶尔空镜 ELS",
          },
          {
            key: "imageDensity",
            label: "画面密度 / 构图偏好",
            placeholder: "如：留白多，不堆砌元素；人物始终在画面黄金比例位置",
          },
          {
            key: "setConstraints",
            label: "布景约束",
            placeholder: "如：室内场景必须有高档装修质感，不出现廉价道具；室外优先使用城市CBD或自然风光",
          },
          {
            key: "propConstraints",
            label: "道具约束",
            placeholder: "如：手机必须是高端品牌；不出现明显品牌logo；古装场景禁止现代器物",
          },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <Label>{label}</Label>
            <Textarea
              value={data[key as keyof StyleBibleData] as string}
              onChange={(e) => update(key as keyof StyleBibleData, e.target.value as never)}
              placeholder={placeholder}
              rows={2}
            />
          </div>
        ))}
      </section>

      <Separator />

      {/* ─── 负面词库 ─── */}
      <section className="space-y-3">
        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          负面词库（生成时自动注入 negative prompt）
        </h3>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              这些词会在每次图像/视频生成时自动添加到 negative prompt，无需手动填写。
            </p>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Input
            value={negInput}
            onChange={(e) => setNegInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNegKeyword()}
            placeholder="输入负面关键词，按 Enter 添加（英文效果更佳）"
          />
          <Button variant="outline" size="icon" onClick={addNegKeyword}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {negKeywords.map((kw) => (
            <Badge key={kw} variant="destructive" className="gap-1 opacity-80">
              {kw}
              <button onClick={() => removeNegKeyword(kw)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {negKeywords.length === 0 && (
            <span className="text-sm text-muted-foreground">暂无负面词，建议至少添加：watermark, text, blurry, ugly, deformed hands</span>
          )}
        </div>
      </section>

      <Separator />

      {/* ─── 漫剧模式 ─── */}
      <section className="space-y-3">
        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
          漫剧模式排版风格（可选）
        </h3>
        <Textarea
          value={data.mangaLayoutStyle}
          onChange={(e) => update("mangaLayoutStyle", e.target.value)}
          placeholder="如：竖版格子，主要对白用圆形气泡，旁白用矩形框，强情绪镜头使用全页大图，封面使用深色底+金色标题"
          rows={3}
        />
      </section>
    </div>
  );
}
