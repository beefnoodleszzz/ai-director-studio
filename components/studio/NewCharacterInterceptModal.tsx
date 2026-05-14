"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  UserPlus,
  RefreshCw,
  ChevronRight,
  User,
} from "lucide-react";
import type { NewCharacterDraft } from "@/types";

interface CharacterSetupState {
  draft: NewCharacterDraft;
  generatingImage: boolean;
  previewImage: string | null;
  localPath: string | null;
  saved: boolean;
}

interface Props {
  open: boolean;
  projectId: string;
  newCharacters: NewCharacterDraft[];
  onAllSaved: (savedCharacters: { name: string; prompt: string; refImageUrl: string }[]) => void;
  onCancel: () => void;
}

export function NewCharacterInterceptModal({
  open,
  projectId,
  newCharacters,
  onAllSaved,
  onCancel,
}: Props) {
  const [states, setStates] = useState<CharacterSetupState[]>(() =>
    newCharacters.map((draft) => ({
      draft,
      generatingImage: false,
      previewImage: null,
      localPath: null,
      saved: false,
    }))
  );
  const [savingAll, setSavingAll] = useState(false);

  const savedCount = states.filter((s) => s.saved).length;
  const allSaved = savedCount === states.length;

  const handleGenerateImage = async (index: number) => {
    const item = states[index];
    setStates((prev) =>
      prev.map((s, i) => (i === index ? { ...s, generatingImage: true } : s))
    );
    try {
      const res = await axios.post<{ results: Array<{ localPath?: string }> }>(
        "/api/generate/image",
        {
          prompt: item.draft.description,
          style: "portrait photography, professional costume, character reference sheet, high quality",
        }
      );
      const localPath = res.data.results?.[0]?.localPath ?? null;
      setStates((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, generatingImage: false, previewImage: localPath, localPath }
            : s
        )
      );
      toast.success(`「${item.draft.name}」定妆照已生成`);
    } catch {
      setStates((prev) =>
        prev.map((s, i) => (i === index ? { ...s, generatingImage: false } : s))
      );
      toast.error("生成失败，请重试");
    }
  };

  const handleConfirmCharacter = async (index: number) => {
    const item = states[index];
    if (!item.localPath) {
      toast.error("请先生成定妆照");
      return;
    }
    try {
      await axios.post(`/api/projects/${projectId}/characters`, {
        name: item.draft.name,
        prompt: item.draft.description,
        refImageUrl: item.localPath,
      });
      setStates((prev) =>
        prev.map((s, i) => (i === index ? { ...s, saved: true } : s))
      );
      toast.success(`「${item.draft.name}」已入库`);
    } catch {
      toast.error("保存失败，请重试");
    }
  };

  const handleConfirmAll = async () => {
    setSavingAll(true);
    const savedChars: { name: string; prompt: string; refImageUrl: string }[] = [];
    for (let i = 0; i < states.length; i++) {
      const item = states[i];
      if (!item.saved) {
        const refImageUrl = item.localPath ?? "";
        try {
          await axios.post(`/api/projects/${projectId}/characters`, {
            name: item.draft.name,
            prompt: item.draft.description,
            refImageUrl,
          });
          setStates((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, saved: true } : s))
          );
        } catch {
          toast.error(`「${item.draft.name}」保存失败`);
          setSavingAll(false);
          return;
        }
      }
      savedChars.push({
        name: item.draft.name,
        prompt: item.draft.description,
        refImageUrl: item.localPath ?? "",
      });
    }
    setSavingAll(false);
    onAllSaved(savedChars);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <UserPlus className="size-4 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base">检测到新角色入场！</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                请为以下 {newCharacters.length} 位新角色建立视觉资产，完成后流程将自动恢复
              </DialogDescription>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={(savedCount / states.length) * 100} className="flex-1 h-1.5" />
            <span className="text-xs text-muted-foreground shrink-0">
              {savedCount}/{states.length} 已完成
            </span>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="flex flex-col gap-4">
            {states.map((item, index) => (
              <div key={item.draft.name}>
                <div className="flex gap-4">
                  {/* 定妆照预览 */}
                  <div className="shrink-0 w-28 h-28 rounded-xl border border-border bg-muted overflow-hidden flex items-center justify-center relative">
                    {item.previewImage ? (
                      <Image
                        src={item.previewImage}
                        alt={item.draft.name}
                        fill
                        className="object-cover"
                        sizes="112px"
                      />
                    ) : item.generatingImage ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-6 animate-spin text-primary" />
                        <span className="text-[10px]">生成中</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <User className="size-7 opacity-30" />
                        <span className="text-[10px] opacity-50">待生成</span>
                      </div>
                    )}
                    {item.saved && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="size-8 text-green-400" />
                      </div>
                    )}
                  </div>

                  {/* 角色信息 + 操作 */}
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.draft.name}</span>
                      {item.saved && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-green-500/15 text-green-400 border-green-500/30"
                        >
                          <CheckCircle2 className="size-2.5 mr-0.5" />已入库
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {item.draft.description}
                    </p>

                    <div className="flex gap-2 mt-auto pt-1">
                      <Button
                        size="sm"
                        variant={item.previewImage ? "outline" : "default"}
                        className="gap-1.5 text-xs h-7"
                        onClick={() => handleGenerateImage(index)}
                        disabled={item.generatingImage || item.saved}
                      >
                        {item.generatingImage ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : item.previewImage ? (
                          <RefreshCw className="size-3" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        {item.previewImage ? "重新生成" : "生成定妆照"}
                      </Button>

                      {item.previewImage && !item.saved && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-400"
                          onClick={() => handleConfirmCharacter(index)}
                        >
                          <CheckCircle2 className="size-3" />
                          确认入库
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {index < states.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* 底部操作栏 */}
        <div className="px-6 pb-6 pt-4 border-t border-border/50 flex gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onCancel}>
            跳过（不建立资产）
          </Button>
          <Button
            className="ml-auto gap-2"
            onClick={handleConfirmAll}
            disabled={savingAll}
          >
            {savingAll ? (
              <Loader2 className="size-4 animate-spin" />
            ) : allSaved ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            {savingAll ? "保存中..." : allSaved ? "恢复分镜生成" : "全部完成，恢复流程"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
