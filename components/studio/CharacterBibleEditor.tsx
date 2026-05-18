"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Anchor, Shuffle, Volume2, ImageIcon, Plus, Trash2, Save, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { FormActionBar } from "@/components/studio/FormActionBar";
import {
  CHARACTER_ASSET_READY_TYPES,
  normalizeCharacterAssetType,
  type CharacterAssetStatus,
} from "@/lib/studio-contracts";

export interface CharacterBibleData {
  id?: string;
  projectId: string;
  name: string;
  aliases: string;
  gender: string;
  ageRange: string;
  role: string;
  // 稳定描述
  facialFeatures: string;
  hairstyle: string;
  bodyType: string;
  wardrobeBase: string;
  temperamentTags: string;
  typicalExpressions: string;
  typicalActions: string;
  // 不可变锚点
  anchorFace: string;
  anchorHair: string;
  anchorWardrobe: string;
  // 可变范围
  wardrobeVariants: string;
  emotionRange: string;
  sceneOutfits: string;
  // 关系
  relationships: string;
  // AI prompt
  basePrompt: string;
  // 声音
  voiceProfile?: {
    voiceType: string;
    ageFeeling: string;
    emotionStyle: string;
    speechRate: string;
    voiceId: string;
    provider: string;
  };
}

interface Props {
  initialData?: Partial<CharacterBibleData>;
  projectId: string;
  onSave?: (data: CharacterBibleData) => Promise<void>;
  onCancel?: () => void;
}

const defaultVoiceProfile = {
  voiceType: "",
  ageFeeling: "",
  emotionStyle: "",
  speechRate: "normal",
  voiceId: "",
  provider: "doubao-tts",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男",
  female: "女",
  neutral: "中性",
  unknown: "未定义",
};

const AGE_RANGE_LABELS: Record<string, string> = {
  teen: "少年（10-17）",
  "young-adult": "青年（18-28）",
  adult: "成年（29-40）",
  "middle-aged": "中年（41-55）",
  senior: "老年（55+）",
};

const VOICE_TYPE_LABELS: Record<string, string> = {
  crisp: "清脆甜美",
  mature: "成熟低沉",
  magnetic: "磁性男声",
  neutral: "中性",
  childlike: "稚嫩童声",
  cold: "冷艳气场",
};

const SPEECH_RATE_LABELS: Record<string, string> = {
  slow: "缓慢",
  normal: "标准",
  fast: "较快",
};

const TTS_PROVIDER_LABELS: Record<string, string> = {
  "doubao-tts": "豆包语音",
};

export function CharacterBibleEditor({ initialData, projectId, onSave, onCancel }: Props) {
  const [data, setData] = useState<CharacterBibleData>({
    projectId,
    name: "",
    aliases: "",
    gender: "",
    ageRange: "",
    role: "",
    facialFeatures: "",
    hairstyle: "",
    bodyType: "",
    wardrobeBase: "",
    temperamentTags: "",
    typicalExpressions: "",
    typicalActions: "",
    anchorFace: "",
    anchorHair: "",
    anchorWardrobe: "",
    wardrobeVariants: "",
    emotionRange: "",
    sceneOutfits: "",
    relationships: "",
    basePrompt: "",
    voiceProfile: defaultVoiceProfile,
    ...initialData,
  });

  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

  function update<K extends keyof CharacterBibleData>(key: K, value: CharacterBibleData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function updateVoice(key: string, value: string) {
    setData((prev) => ({
      ...prev,
      voiceProfile: { ...(prev.voiceProfile ?? defaultVoiceProfile), [key]: value },
    }));
  }

  function addTemperamentTag() {
    if (!tagInput.trim()) return;
    const current = data.temperamentTags ? data.temperamentTags.split(",").map((t) => t.trim()) : [];
    if (!current.includes(tagInput.trim())) {
      update("temperamentTags", [...current, tagInput.trim()].join(", "));
    }
    setTagInput("");
  }

  function removeTemperamentTag(tag: string) {
    const current = data.temperamentTags.split(",").map((t) => t.trim()).filter((t) => t !== tag);
    update("temperamentTags", current.join(", "));
  }

  async function handleSave() {
    if (!data.name.trim()) {
      toast.error("角色名称不能为空");
      return;
    }
    if (!data.anchorFace.trim() && !data.basePrompt.trim()) {
      toast.error("必须填写脸部锚点或 AI 基础 Prompt");
      return;
    }
    setSaving(true);
    try {
      await onSave?.(data);
      toast.success("角色圣经已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const temperamentTags = data.temperamentTags
    ? data.temperamentTags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* 顶部操作栏 */}
      <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">
            {data.id ? `编辑角色：${data.name}` : "新建角色圣经"}
          </h2>
        </div>
        <p className="type-meta mt-2 text-muted-foreground">填写身份、锚点、可变范围与声音配置，统一角色跨镜头表现。</p>
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 md:grid-cols-5">
          <TabsTrigger value="identity">
            <User className="mr-1.5 h-3.5 w-3.5" />
            身份
          </TabsTrigger>
          <TabsTrigger value="appearance">外貌描述</TabsTrigger>
          <TabsTrigger value="anchor">
            <Anchor className="mr-1.5 h-3.5 w-3.5" />
            不可变锚点
          </TabsTrigger>
          <TabsTrigger value="variants">
            <Shuffle className="mr-1.5 h-3.5 w-3.5" />
            可变范围
          </TabsTrigger>
          <TabsTrigger value="voice">
            <Volume2 className="mr-1.5 h-3.5 w-3.5" />
            声音
          </TabsTrigger>
        </TabsList>

        {/* ─── 身份标签 ─── */}
        <TabsContent value="identity" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>角色名称 *</Label>
              <Input
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="主角名字"
              />
            </div>
            <div className="space-y-1.5">
              <Label>别名 / 绰号</Label>
              <Input
                value={data.aliases}
                onChange={(e) => update("aliases", e.target.value)}
                placeholder="用逗号分隔多个别名"
              />
            </div>
            <div className="space-y-1.5">
              <Label>性别</Label>
              <Select value={data.gender} onValueChange={(v) => v && update("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择性别">
                    {data.gender ? GENDER_LABELS[data.gender] ?? data.gender : "选择性别"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">男</SelectItem>
                  <SelectItem value="female">女</SelectItem>
                  <SelectItem value="neutral">中性</SelectItem>
                  <SelectItem value="unknown">未定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>年龄段</Label>
              <Select value={data.ageRange} onValueChange={(v) => v && update("ageRange", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择年龄段">
                    {data.ageRange ? AGE_RANGE_LABELS[data.ageRange] ?? data.ageRange : "选择年龄段"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teen">少年（10-17）</SelectItem>
                  <SelectItem value="young-adult">青年（18-28）</SelectItem>
                  <SelectItem value="adult">成年（29-40）</SelectItem>
                  <SelectItem value="middle-aged">中年（41-55）</SelectItem>
                  <SelectItem value="senior">老年（55+）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>身份 / 职业</Label>
            <Input
              value={data.role}
              onChange={(e) => update("role", e.target.value)}
              placeholder="如：亿万总裁 / 平民女孩 / 复仇者"
            />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>气质关键词</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTemperamentTag()}
                placeholder="输入关键词，按 Enter 添加"
              />
              <Button variant="outline" size="icon" onClick={addTemperamentTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {temperamentTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => removeTemperamentTag(tag)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>AI 基础 Prompt（英文，供生成使用）</Label>
            <Textarea
              value={data.basePrompt}
              onChange={(e) => update("basePrompt", e.target.value)}
              placeholder="e.g. young Chinese woman, 25 years old, sharp eyes, elegant temperament..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </TabsContent>

        {/* ─── 外貌描述标签 ─── */}
        <TabsContent value="appearance" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {[
            { key: "facialFeatures", label: "五官描述", placeholder: "如：丹凤眼、高鼻梁、樱桃小嘴、瓜子脸" },
            { key: "hairstyle", label: "发型 / 发色", placeholder: "如：乌黑长发、自然卷、常年披肩" },
            { key: "bodyType", label: "身材", placeholder: "如：身材高挑、纤细，168cm" },
            { key: "wardrobeBase", label: "服装主基调", placeholder: "如：职场精英风、深色系、合身剪裁" },
            { key: "typicalExpressions", label: "典型表情", placeholder: "如：冷漠淡然、偶尔嘴角微扬" },
            { key: "typicalActions", label: "典型动作 / 习惯", placeholder: "如：思考时轻触嘴唇、走路步伐沉稳" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Textarea
                value={data[key as keyof CharacterBibleData] as string}
                onChange={(e) => update(key as keyof CharacterBibleData, e.target.value as never)}
                placeholder={placeholder}
                rows={2}
              />
            </div>
            ))}
          </div>
        </TabsContent>

        {/* ─── 不可变锚点标签 ─── */}
        <TabsContent value="anchor" className="mt-4 space-y-4">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-500 flex items-center gap-2">
                <Anchor className="h-4 w-4" />
                锚点是角色识别性的生命线，生成时必须强制保留
              </CardTitle>
            </CardHeader>
          </Card>

          {[
            { key: "anchorFace", label: "脸部不可变特征 *", placeholder: "如：必须是亚洲女性脸型，高颧骨，单眼皮或轻微双眼皮，不能有雀斑" },
            { key: "anchorHair", label: "发色 / 发型锚点 *", placeholder: "如：必须是纯黑长发，不能染色，不能短发" },
            { key: "anchorWardrobe", label: "穿搭锚点", placeholder: "如：职场场景必须有玉佩或金属质感配饰，不能穿运动服" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Textarea
                value={data[key as keyof CharacterBibleData] as string}
                onChange={(e) => update(key as keyof CharacterBibleData, e.target.value as never)}
                placeholder={placeholder}
                rows={3}
                className="border-amber-500/30 focus-visible:ring-amber-500/50"
              />
            </div>
          ))}
        </TabsContent>

        {/* ─── 可变范围标签 ─── */}
        <TabsContent value="variants" className="mt-4 space-y-4">
          {[
            { key: "wardrobeVariants", label: "可换装范围", placeholder: "如：可以有居家便装（白色宽松上衣）、晚礼服（深色系）、运动场景（专业运动装）" },
            { key: "emotionRange", label: "情绪极值范围", placeholder: "如：可以有嚎啕大哭、愤怒爆发，但哭泣时依然保持精致妆容" },
            { key: "sceneOutfits", label: "特定场景装束", placeholder: "如：古装场景允许穿汉服，但发型必须保持黑色盘发" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Textarea
                value={data[key as keyof CharacterBibleData] as string}
                onChange={(e) => update(key as keyof CharacterBibleData, e.target.value as never)}
                placeholder={placeholder}
                rows={3}
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>人物关系</Label>
            <Textarea
              value={data.relationships}
              onChange={(e) => update("relationships", e.target.value)}
              placeholder="如：男主的死对头，表面敌对实为初恋；与配角B是闺蜜关系"
              rows={3}
            />
          </div>
        </TabsContent>

        {/* ─── 声音标签 ─── */}
        <TabsContent value="voice" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>声线类型</Label>
              <Select
                value={data.voiceProfile?.voiceType ?? ""}
                onValueChange={(v) => v && updateVoice("voiceType", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择声线">
                    {data.voiceProfile?.voiceType
                      ? VOICE_TYPE_LABELS[data.voiceProfile.voiceType] ?? data.voiceProfile.voiceType
                      : "选择声线"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crisp">清脆甜美</SelectItem>
                  <SelectItem value="mature">成熟低沉</SelectItem>
                  <SelectItem value="magnetic">磁性男声</SelectItem>
                  <SelectItem value="neutral">中性</SelectItem>
                  <SelectItem value="childlike">稚嫩童声</SelectItem>
                  <SelectItem value="cold">冷艳气场</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>语速偏好</Label>
              <Select
                value={data.voiceProfile?.speechRate ?? "normal"}
                onValueChange={(v) => v && updateVoice("speechRate", v)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {SPEECH_RATE_LABELS[data.voiceProfile?.speechRate ?? "normal"] ?? data.voiceProfile?.speechRate ?? "标准"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">缓慢</SelectItem>
                  <SelectItem value="normal">标准</SelectItem>
                  <SelectItem value="fast">较快</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>TTS Provider</Label>
              <Select
                value={data.voiceProfile?.provider ?? "doubao-tts"}
                onValueChange={(v) => v && updateVoice("provider", v)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {TTS_PROVIDER_LABELS[data.voiceProfile?.provider ?? "doubao-tts"] ?? data.voiceProfile?.provider ?? "豆包语音"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doubao-tts">豆包语音</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Voice ID</Label>
              <Input
                value={data.voiceProfile?.voiceId ?? ""}
                onChange={(e) => updateVoice("voiceId", e.target.value)}
                placeholder="Provider 声音 ID"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>情绪风格 / 语言风格描述</Label>
            <Textarea
              value={data.voiceProfile?.emotionStyle ?? ""}
              onChange={(e) => updateVoice("emotionStyle", e.target.value)}
              placeholder="如：冷静克制、情绪极少外露，但台词力量感强"
              rows={3}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* 资产上传区域 */}
      {data.id && <CharacterAssetUploader projectId={data.projectId} characterId={data.id} />}

      <FormActionBar className="px-0 pb-0">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            取消
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "保存中…" : "保存圣经"}
        </Button>
      </FormActionBar>
    </div>
  );
}

// ─── CharacterAsset 上传管理器 ─────────────────────────────────────────────────

interface CharacterAsset {
  id: string;
  assetType: string;
  localPath: string;
  label: string;
  tags: string;
}

interface CharacterAssetSnapshot {
  assetStatus: CharacterAssetStatus;
  completenessRatio: number;
  presentTypes: string[];
  missingTypes: string[];
  generatedTypes: string[];
  totalAssets: number;
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  "reference-main": "定妆主图",
  "angle-left": "左侧角度",
  "angle-right": "右侧角度",
  "angle-three-quarter": "三分之二角度",
  "expression-neutral": "平静表情",
  "expression-angry": "愤怒表情",
  "expression-sad": "悲伤表情",
  "expression-surprised": "惊讶表情",
  other: "其他",
};

function CharacterAssetUploader({ projectId, characterId }: { projectId: string; characterId: string }) {
  const [assets, setAssets] = useState<CharacterAsset[]>([]);
  const [assetSnapshot, setAssetSnapshot] = useState<CharacterAssetSnapshot | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingPack, setGeneratingPack] = useState(false);
  const [assetType, setAssetType] = useState("reference-main");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [assetsRes, statusRes] = await Promise.all([
        axios.get<CharacterAsset[]>(`/api/projects/${projectId}/characters/${characterId}/assets`),
        axios.get<{ assetSnapshot: CharacterAssetSnapshot }>(`/api/projects/${projectId}/characters/${characterId}/asset-status`),
      ]);

      if (cancelled) return;

      setAssets(assetsRes.data.map((asset) => ({ ...asset, assetType: normalizeCharacterAssetType(asset.assetType) })));
      setAssetSnapshot(statusRes.data.assetSnapshot);
    };

    load().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId, characterId]);

  const refreshAssets = async () => {
    const [assetsRes, statusRes] = await Promise.all([
      axios.get<CharacterAsset[]>(`/api/projects/${projectId}/characters/${characterId}/assets`),
      axios.get<{ assetSnapshot: CharacterAssetSnapshot }>(`/api/projects/${projectId}/characters/${characterId}/asset-status`),
    ]);
    setAssets(assetsRes.data.map((asset) => ({ ...asset, assetType: normalizeCharacterAssetType(asset.assetType) })));
    setAssetSnapshot(statusRes.data.assetSnapshot);
  };

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assetType", assetType);
      formData.append("label", file.name.split(".")[0] ?? "");
      try {
        const res = await axios.post<CharacterAsset>(
          `/api/projects/${projectId}/characters/${characterId}/assets`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        setAssets((prev) => [...prev, { ...res.data, assetType: normalizeCharacterAssetType(res.data.assetType) }]);
        uploaded += 1;
      } catch {
        toast.error(`上传 ${file.name} 失败`);
      }
    }
    await refreshAssets().catch(() => {});
    if (uploaded > 0) toast.success(`已上传 ${uploaded} 张定妆资产`);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (asset: CharacterAsset) => {
    try {
      await axios.delete(`/api/projects/${projectId}/characters/${characterId}/assets/${asset.id}`);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      await refreshAssets().catch(() => {});
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const handleGeneratePack = async () => {
    setGeneratingPack(true);
    try {
      const res = await axios.post<{ createdAssets: CharacterAsset[] }>(
        `/api/projects/${projectId}/characters/${characterId}/assets/generate`
      );
      await refreshAssets();
      toast.success(
        res.data.createdAssets.length > 0
          ? `已补齐 ${res.data.createdAssets.length} 个核心角色资产`
          : "角色核心资产包已完整"
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error ?? "生成失败"
        : "生成失败";
      toast.error(message);
    } finally {
      setGeneratingPack(false);
    }
  };

  const statusTone =
    assetSnapshot?.assetStatus === "ready"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : assetSnapshot?.assetStatus === "partial"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-3">
      <Separator />
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">核心一致性包</span>
              <Badge variant="outline" className={statusTone}>
                {assetSnapshot?.assetStatus === "ready"
                  ? "已完备"
                  : assetSnapshot?.assetStatus === "partial"
                    ? "待补齐"
                    : "未建立"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              覆盖 {assetSnapshot ? `${Math.round(assetSnapshot.completenessRatio * 100)}%` : "0%"}，
              需要 {CHARACTER_ASSET_READY_TYPES.length} 类核心角色资产。
            </p>
            {assetSnapshot && assetSnapshot.missingTypes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {assetSnapshot.missingTypes.map((type) => (
                  <Badge key={type} variant="secondary" className="text-[10px]">
                    缺少 {ASSET_TYPE_LABELS[type] ?? type}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={generatingPack || uploading}
            onClick={handleGeneratePack}
          >
            {generatingPack ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            生成资产包
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">定妆资产库</span>
          <Badge variant="outline" className="text-xs">{assets.length} 张</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={assetType} onValueChange={(v) => v && setAssetType(v)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Upload className="size-3 mr-1" />}
            上传
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>
      </div>

      {assets.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="size-8 mx-auto mb-2 opacity-30" />
          <p>点击或拖拽上传定妆照、多角度图、服装变体</p>
          <p className="text-xs mt-1">支持 JPG/PNG/WEBP，多张同时上传</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="group relative aspect-square rounded-lg overflow-hidden bg-muted border">
              <Image
                src={asset.localPath}
                alt={asset.label || asset.assetType}
                fill
                className="object-cover"
                sizes="120px"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <Button
                  variant="destructive"
                  size="icon"
                  className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(asset)}
                >
                  <X className="size-3" />
                </Button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                <p className="text-[9px] text-white truncate">
                  {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
                </p>
              </div>
            </div>
          ))}
          {/* 添加按钮 */}
          <div
            className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="size-5" />
          </div>
        </div>
      )}
    </div>
  );
}
