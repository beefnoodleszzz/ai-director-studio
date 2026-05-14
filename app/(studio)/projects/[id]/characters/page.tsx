"use client";

import { use, useEffect, useState } from "react";
import { CharacterBibleEditor, type CharacterBibleData } from "@/components/studio/CharacterBibleEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, User, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";

interface Character {
  id: string;
  name: string;
  gender: string;
  ageRange: string;
  role: string;
  temperamentTags: string;
  basePrompt: string;
  anchorFace: string;
  voiceProfile: { voiceType: string; provider: string } | null;
  assets: { id: string; assetType: string; localPath: string; url: string }[];
}

export default function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChar, setEditingChar] = useState<Character | null>(null);

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">角色资产库</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{characters.length} 个角色</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingChar(null); }}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="size-4" />
            新建角色
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : characters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="size-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
              <User className="size-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">还没有角色</p>
              <p className="text-sm text-muted-foreground mt-1">创建角色圣经以保证跨镜头一致性</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button className="gap-2" />}>
                <Plus className="size-4" />
                创建第一个角色
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新建角色圣经</DialogTitle>
                </DialogHeader>
                <CharacterBibleEditor projectId={projectId} onSave={handleSave} onCancel={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((char) => (
            <Card key={char.id} className="hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <User className="size-5 text-primary" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => { setEditingChar(char); setDialogOpen(true); }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
                <CardTitle className="text-base mt-1">{char.name}</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {char.gender && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{char.gender === "female" ? "女" : char.gender === "male" ? "男" : char.gender}</Badge>}
                  {char.ageRange && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{char.ageRange}</Badge>}
                  {char.role && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{char.role}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {char.temperamentTags && (
                  <div className="flex flex-wrap gap-1">
                    {char.temperamentTags.split(",").slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{char.assets?.length ?? 0} 个资产</span>
                  {char.voiceProfile && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      声音已配置
                    </Badge>
                  )}
                </div>
                {!char.anchorFace && (
                  <p className="text-[10px] text-amber-500">⚠ 脸部锚点未填写</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
