"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { FormActionBar } from "@/components/studio/FormActionBar";

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  stylePrefix: string;
  charAnchor: string;
  shotDesc: string;
  sceneDesc: string;
  actionDesc: string;
  emotionDesc: string;
  qualitySuffix: string;
  negativePrompt: string;
  version: number;
  isActive: boolean;
}

interface Props {
  projectId: string;
  template?: PromptTemplate;
  onSaved?: (t: PromptTemplate) => void;
  onCancel?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  image: "图像生成",
  video: "视频生成",
  audio: "音频/TTS",
  script: "剧本拆解",
};

type PromptTemplateFormKey = keyof Omit<PromptTemplate, "id" | "version">;
const FIELDS: Array<{ key: PromptTemplateFormKey; label: string; hint: string }> = [
  { key: "stylePrefix" as PromptTemplateFormKey, label: "风格前缀", hint: "例：cinematic, dramatic lighting, film grain, ultra-detailed" },
  { key: "charAnchor" as PromptTemplateFormKey, label: "角色锚点", hint: "固定角色外貌的核心词，会覆盖角色圣经 basePrompt" },
  { key: "shotDesc" as PromptTemplateFormKey, label: "镜头描述", hint: "景别/机位关键词：close-up shot, low angle, static camera" },
  { key: "sceneDesc" as PromptTemplateFormKey, label: "场景描述", hint: "背景/环境/光线：urban office, daytime, natural light" },
  { key: "actionDesc" as PromptTemplateFormKey, label: "行为描述", hint: "主体动作/姿态描述" },
  { key: "emotionDesc" as PromptTemplateFormKey, label: "情绪描述", hint: "情绪/表情关键词：determined expression, teary eyes" },
  { key: "qualitySuffix" as PromptTemplateFormKey, label: "技术质量后缀", hint: "8K resolution, hyperrealistic, award-winning photography" },
  { key: "negativePrompt" as PromptTemplateFormKey, label: "负面约束", hint: "blurry, deformed hands, watermark, text overlay" },
];

export function PromptTemplateEditor({ projectId, template, onSaved, onCancel }: Props) {
  const isNew = !template;
  const [form, setForm] = useState<Omit<PromptTemplate, "id" | "version">>({
    name: template?.name ?? "",
    category: template?.category ?? "image",
    stylePrefix: template?.stylePrefix ?? "",
    charAnchor: template?.charAnchor ?? "",
    shotDesc: template?.shotDesc ?? "",
    sceneDesc: template?.sceneDesc ?? "",
    actionDesc: template?.actionDesc ?? "",
    emotionDesc: template?.emotionDesc ?? "",
    qualitySuffix: template?.qualitySuffix ?? "",
    negativePrompt: template?.negativePrompt ?? "",
    isActive: template?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const composedPrompt = [
    form.stylePrefix,
    form.charAnchor,
    form.shotDesc,
    form.sceneDesc,
    form.actionDesc,
    form.emotionDesc,
    form.qualitySuffix,
  ]
    .filter(Boolean)
    .join(", ");

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请填写模板名称");
      return;
    }
    setSaving(true);
    try {
      let saved: PromptTemplate;
      if (isNew) {
        const res = await axios.post<PromptTemplate>(
          `/api/projects/${projectId}/templates`,
          form
        );
        saved = res.data;
        toast.success("模板已创建");
      } else {
        const res = await axios.patch<PromptTemplate>(
          `/api/projects/${projectId}/templates/${template.id}`,
          form
        );
        saved = res.data;
        toast.success("模板已更新");
      }
      onSaved?.(saved);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(composedPrompt);
    toast.success("已复制合成 Prompt");
  };

  return (
    <div className="space-y-6">
      {/* 基本信息 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>模板名称 *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例：写实都市近景女主模板"
          />
        </div>
        <div className="space-y-1.5">
          <Label>适用类型</Label>
          <Select
            value={form.category}
            onValueChange={(v) => v && setForm({ ...form, category: v })}
          >
            <SelectTrigger>
              <SelectValue>
                {CATEGORY_LABELS[form.category] ?? form.category}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* 结构化 Prompt 字段 */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/15 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-medium text-muted-foreground">结构化字段（组合后即为完整 Prompt）</p>
          <Button variant="ghost" size="sm" onClick={() => setPreviewMode(!previewMode)}>
            {previewMode ? <EyeOff className="size-4 mr-1.5" /> : <Eye className="size-4 mr-1.5" />}
            {previewMode ? "收起预览" : "预览合成"}
          </Button>
        </div>

        {previewMode && (
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-mono text-muted-foreground flex-1 break-all">
                  {composedPrompt || "(暂无内容)"}
                </p>
                <Button variant="ghost" size="icon" onClick={handleCopyPrompt}>
                  <Copy className="size-4" />
                </Button>
              </div>
              {form.negativePrompt && (
                <p className="type-caption mt-2 font-mono text-destructive/70">
                  Negative: {form.negativePrompt}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm">{label}</Label>
                <span className="type-caption text-muted-foreground">{hint}</span>
              </div>
              <Textarea
                value={(form[key as keyof typeof form] as string) ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                rows={2}
                className="resize-none font-mono text-sm"
                placeholder={hint}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* 版本 + 状态 */}
      {!isNew && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">v{template.version}</Badge>
          <Badge variant={form.isActive ? "default" : "secondary"}>
            {form.isActive ? "启用" : "停用"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
          >
            {form.isActive ? "停用" : "启用"}
          </Button>
        </div>
      )}

      {/* 操作按钮 */}
      <FormActionBar className="px-0 pb-0">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving}>
          <Save className="size-4 mr-1.5" />
          {saving ? "保存中…" : isNew ? "创建模板" : "保存更改"}
        </Button>
      </FormActionBar>
    </div>
  );
}
