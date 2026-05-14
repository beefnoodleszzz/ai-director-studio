"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CharacterData } from "@/stores/projectStore";
import { Trash2, User, Edit2 } from "lucide-react";

interface CharacterCardProps {
  character: CharacterData;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<CharacterData>) => void;
}

export function CharacterCard({ character, onDelete, onUpdate }: CharacterCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(character.name);
  const [prompt, setPrompt] = useState(character.prompt);

  const handleSave = () => {
    onUpdate?.(character.id, { name, prompt });
    setEditOpen(false);
  };

  return (
    <Card className="group relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-12 shrink-0 border border-border">
            <AvatarImage src={character.refImageUrl || undefined} alt={character.name} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {character.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm truncate">{character.name}</p>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger render={<Button variant="ghost" size="icon" className="size-6" />}>
                    <Edit2 className="size-3" />
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>编辑角色</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 pt-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>角色名称</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>外形描述提示词</Label>
                        <Textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          className="min-h-20 resize-none"
                          placeholder="描述角色外貌、服装等，英文效果更佳"
                        />
                      </div>
                      <Button onClick={handleSave}>保存</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => onDelete(character.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{character.prompt}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AddCharacterCardProps {
  onAdd: (data: { name: string; prompt: string; refImageUrl: string }) => void;
}

export function AddCharacterCard({ onAdd }: AddCharacterCardProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [refImageUrl, setRefImageUrl] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name, prompt, refImageUrl });
    setOpen(false);
    setName("");
    setPrompt("");
    setRefImageUrl("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className="w-full text-left rounded-xl border border-dashed border-border hover:border-primary/50 transition-colors" />
        }
      >
        <div className="p-4 flex items-center justify-center gap-2 h-[88px]">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <User className="size-4" />
            <span>添加角色</span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加角色</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>角色名称 *</Label>
            <Input
              placeholder="如：林晓月"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>外形描述（英文提示词）</Label>
            <Textarea
              placeholder="A young woman with long black hair, wearing traditional hanfu dress..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-20 resize-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>定妆照 URL（可选）</Label>
            <Input
              placeholder="https://..."
              value={refImageUrl}
              onChange={(e) => setRefImageUrl(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={!name.trim()}>
            添加角色
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
