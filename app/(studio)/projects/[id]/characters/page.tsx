"use client";

import { use, useEffect, useState } from "react";
import { CharacterBibleEditor, type CharacterBibleData } from "@/components/studio/CharacterBibleEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, User, Loader2, Pencil, Sparkles } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { ProjectPageShell } from "@/components/studio/ProjectPageShell";
import { EmptyState } from "@/components/studio/EmptyState";
import type { CharacterAssetStatus } from "@/lib/studio-contracts";

interface Character {
  id: string;
  name: string;
  gender: string;
  ageRange: string;
  role: string;
  temperamentTags: string;
  basePrompt: string;
  anchorFace: string;
  assetStatus: CharacterAssetStatus;
  assetSnapshot?: {
    completenessRatio: number;
    missingTypes: string[];
    totalAssets: number;
  };
  voiceProfile: { voiceType: string; provider: string } | null;
  assets: { id: string; assetType: string; localPath: string; url: string }[];
}

export default function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [generatingAssetCharId, setGeneratingAssetCharId] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get<Character[]>(`/api/projects/${projectId}/characters`)
      .then((res) => setCharacters(res.data))
      .catch(() => toast.error("加载角色失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = async (data: CharacterBibleData) => {
    if (data.id) {
      // 更新
      const res = await axios.patch(`/api/projects/${projectId}/characters/${data.id}`, data);
      setCharacters((prev) => prev.map((c) => (c.id === data.id ? res.data : c)));
    } else {
      // 新建
      const res = await axios.post<Character>(`/api/projects/${projectId}/characters`, data);
      setCharacters((prev) => [...prev, res.data]);
    }
    setDialogOpen(false);
    setEditingChar(null);
  };

  const handleGenerateAssetPack = async (characterId: string) => {
    setGeneratingAssetCharId(characterId);
    try {
      let assetStatus: CharacterAssetStatus | null = null;

      do {
        const res = await axios.post(`/api/projects/${projectId}/characters/${characterId}/assets/generate`, {
          limit: 1,
        });
        assetStatus = res.data?.assetStatus ?? null;

        if ((res.data?.createdAssets?.length ?? 0) === 0) {
          break;
        }
      } while (assetStatus !== "ready");

      const refreshed = await axios.get<Character[]>(`/api/projects/${projectId}/characters`);
      setCharacters(refreshed.data);
      toast.success(assetStatus === "ready" ? "角色资产包已补齐" : "角色资产已生成部分结果");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        toast.info("角色资产工厂接口尚未接通，当前先保留触发入口。");
      } else {
        toast.error("角色资产生成提交失败");
      }
    } finally {
      setGeneratingAssetCharId(null);
    }
  };

  return (
    <ProjectPageShell
      title="角色资产库"
      description={`${characters.length} 个角色，统一维护角色圣经、声音配置与参考资产。`}
      backHref={`/projects/${projectId}`}
      actions={
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingChar(null); }}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="size-4" />
            新建角色
          </DialogTrigger>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingChar ? "编辑角色圣经" : "新建角色圣经"}</DialogTitle>
            </DialogHeader>
            <CharacterBibleEditor
              projectId={projectId}
              initialData={editingChar ? {
                ...editingChar,
                projectId,
                voiceProfile: editingChar.voiceProfile
                  ? { ageFeeling: "", emotionStyle: "", speechRate: "normal", voiceId: "", ...editingChar.voiceProfile }
                  : undefined
              } : undefined}
              onSave={handleSave}
              onCancel={() => { setDialogOpen(false); setEditingChar(null); }}
            />
          </DialogContent>
        </Dialog>
      }
    >

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : characters.length === 0 ? (
        <EmptyState
          title="还没有角色"
          description="创建角色圣经以保证跨镜头一致性。"
          icon={User}
          action={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button className="gap-2" />}>
                <Plus className="size-4" />
                创建第一个角色
              </DialogTrigger>
              <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新建角色圣经</DialogTitle>
                </DialogHeader>
                <CharacterBibleEditor projectId={projectId} onSave={handleSave} onCancel={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {characters.map((char) => (
            <Card key={char.id} className="hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <User className="size-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => { setEditingChar(char); setDialogOpen(true); }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-base mt-1">{char.name}</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {char.gender && <Badge variant="outline" className="text-xs px-1.5 py-0">{char.gender === "female" ? "女" : char.gender === "male" ? "男" : char.gender}</Badge>}
                  {char.ageRange && <Badge variant="outline" className="text-xs px-1.5 py-0">{char.ageRange}</Badge>}
                  {char.role && <Badge variant="secondary" className="text-xs px-1.5 py-0">{char.role}</Badge>}
                  <Badge
                    variant="outline"
                    className={`text-xs px-1.5 py-0 ${
                      char.assetStatus === "ready"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                        : char.assetStatus === "partial"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                          : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {char.assetStatus === "ready" ? "资产完备" : char.assetStatus === "partial" ? "资产待补齐" : "未建资产包"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">角色资产工厂</p>
                      <p className="text-sm font-medium">
                        {char.assetStatus === "ready" ? "核心一致性包已完整" : char.assetStatus === "partial" ? "建议补齐缺失资产" : "建议先生成核心一致性包"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => handleGenerateAssetPack(char.id)}
                      disabled={generatingAssetCharId === char.id}
                    >
                      {generatingAssetCharId === char.id ? (
                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 size-3.5" />
                      )}
                      生成资产包
                    </Button>
                  </div>
                </div>
                {char.temperamentTags && (
                  <div className="flex flex-wrap gap-1">
                    {char.temperamentTags.split(",").slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between type-meta text-muted-foreground">
                  <span>{char.assets?.length ?? 0} 个资产</span>
                  <span>{Math.round((char.assetSnapshot?.completenessRatio ?? 0) * 100)}% 完整</span>
                  {char.voiceProfile && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      声音已配置
                    </Badge>
                  )}
                </div>
                {char.assetSnapshot?.missingTypes?.length ? (
                  <p className="type-caption text-muted-foreground">
                    缺少 {char.assetSnapshot.missingTypes.length} 类核心角色资产
                  </p>
                ) : null}
                {char.assetSnapshot?.missingTypes?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {char.assetSnapshot.missingTypes.slice(0, 4).map((type) => (
                      <Badge key={type} variant="outline" className="text-xs px-1.5 py-0">
                        缺 {type}
                      </Badge>
                    ))}
                    {char.assetSnapshot.missingTypes.length > 4 ? (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        +{char.assetSnapshot.missingTypes.length - 4}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                {!char.anchorFace && (
                  <p className="type-caption text-amber-500">⚠ 脸部锚点未填写</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ProjectPageShell>
  );
}
