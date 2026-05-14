"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, MessageCircle } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  shotId: string;
  dialogue: string;
  onUpdated?: (newDialogue: string) => void;
  compact?: boolean;
}

/**
 * 句级对白修正编辑器
 *
 * 将对白按「。！？\n」拆成句子，允许逐句点击编辑。
 * 也支持整段编辑模式。
 */
export function DialogueEditor({ shotId, dialogue, onUpdated, compact = false }: Props) {
  const [editingAll, setEditingAll] = useState(false);
  const [fullText, setFullText] = useState(dialogue);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);

  // 把整段对白拆分为句子（保留分隔符）
  const sentences = dialogue
    ? dialogue.split(/(?<=[。！？\n])/).filter(Boolean)
    : [];

  const saveSentence = async (idx: number) => {
    setSaving(true);
    try {
      const res = await axios.patch<{ dialogue: string }>(
        `/api/shots/${shotId}/dialogue`,
        { sentenceIndex: idx, newSentenceText: editingText }
      );
      onUpdated?.(res.data.dialogue ?? "");
      toast.success("已修正");
      setEditingIdx(null);
    } catch {
      toast.error("修正失败");
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const res = await axios.patch<{ dialogue: string }>(
        `/api/shots/${shotId}/dialogue`,
        { dialogue: fullText }
      );
      onUpdated?.(res.data.dialogue ?? "");
      toast.success("对白已更新");
      setEditingAll(false);
    } catch {
      toast.error("更新失败");
    } finally {
      setSaving(false);
    }
  };

  if (compact && !dialogue) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="size-3" />
          <span>对白</span>
          {sentences.length > 1 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1">{sentences.length} 句</Badge>
          )}
        </div>
        {!editingAll && dialogue && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5"
            onClick={() => { setFullText(dialogue); setEditingAll(true); }}
          >
            <Pencil className="size-2.5 mr-0.5" /> 整段编辑
          </Button>
        )}
      </div>

      {editingAll ? (
        <div className="space-y-1.5">
          <Textarea
            value={fullText}
            onChange={(e) => setFullText(e.target.value)}
            rows={4}
            className="text-xs resize-none"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 text-xs" onClick={saveAll} disabled={saving}>
              <Check className="size-3 mr-0.5" /> 保存
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingAll(false)}>
              <X className="size-3 mr-0.5" /> 取消
            </Button>
          </div>
        </div>
      ) : sentences.length > 0 ? (
        <div className="space-y-0.5">
          {sentences.map((sentence, idx) => (
            editingIdx === idx ? (
              <div key={idx} className="flex gap-1">
                <Textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={2}
                  className="text-xs resize-none flex-1"
                  autoFocus
                />
                <div className="flex flex-col gap-1">
                  <Button
                    size="icon"
                    className="size-6"
                    onClick={() => saveSentence(idx)}
                    disabled={saving}
                  >
                    <Check className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    onClick={() => setEditingIdx(null)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={idx}
                className={cn(
                  "group flex items-start gap-1.5 px-2 py-1 rounded text-xs cursor-pointer hover:bg-muted/40",
                  compact ? "text-[10px]" : "text-xs"
                )}
                onClick={() => { setEditingIdx(idx); setEditingText(sentence); }}
              >
                <span className="text-muted-foreground font-mono shrink-0 mt-0.5">{idx + 1}.</span>
                <span className="flex-1">{sentence}</span>
                <Pencil className="size-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
              </div>
            )
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">（无对白）</p>
      )}
    </div>
  );
}
