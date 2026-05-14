"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FileText, Globe, Download } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import {
  PromptTemplateEditor,
  type PromptTemplate,
} from "@/components/studio/PromptTemplateEditor";

const CATEGORY_LABELS: Record<string, string> = {
  image: "图像",
  video: "视频",
  audio: "音频",
  script: "剧本",
};

export default function TemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | undefined>(undefined);
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);
  const [globalTemplates, setGlobalTemplates] = useState<PromptTemplate[]>([]);
  const [selectedGlobal, setSelectedGlobal] = useState<Set<string>>(new Set());
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    axios
      .get<PromptTemplate[]>(`/api/projects/${projectId}/templates`)
      .then((r) => setTemplates(r.data))
      .catch(() => toast.error("加载模板失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (t: PromptTemplate) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const handleSaved = (saved: PromptTemplate) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setDialogOpen(false);
  };

  const openGlobalLibrary = async () => {
    try {
      const res = await axios.get<PromptTemplate[]>("/api/templates/global");
      setGlobalTemplates(res.data);
      setSelectedGlobal(new Set());
      setGlobalDialogOpen(true);
    } catch {
      toast.error("加载全局模板库失败");
    }
  };

  const handleCloneGlobal = async () => {
    if (!selectedGlobal.size) { toast.error("请选择要导入的模板"); return; }
    setCloning(true);
    try {
      const res = await axios.post<{ cloned: number; templates: PromptTemplate[] }>(
        `/api/projects/${projectId}/templates/clone-from-global`,
        { templateIds: Array.from(selectedGlobal) }
      );
      setTemplates((prev) => [...res.data.templates, ...prev]);
      setGlobalDialogOpen(false);
      toast.success(`已导入 ${res.data.cloned} 个模板`);
    } catch {
      toast.error("导入失败");
    } finally {
      setCloning(false);
    }
  };

  const handleDelete = async (t: PromptTemplate) => {
    if (!confirm(`确认删除模板「${t.name}」？`)) return;
    try {
      await axios.delete(`/api/projects/${projectId}/templates/${t.id}`);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  const grouped = templates.reduce<Record<string, PromptTemplate[]>>((acc, t) => {
    const cat = t.category || "image";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="size-6" /> Prompt 模板库
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            结构化 Prompt 模板可跨集复用，告别每次从零手写
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openGlobalLibrary}>
            <Globe className="size-4 mr-1.5" /> 全局库导入
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-1.5" /> 新建模板
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">还没有模板</p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="size-4 mr-1.5" /> 创建第一个模板
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{CATEGORY_LABELS[cat] ?? cat}</Badge>
              <Separator className="flex-1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((t) => (
                <Card key={t.id} className={t.isActive ? "" : "opacity-50"}>
                  <CardHeader className="pb-2 flex-row items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        v{t.version} · {t.isActive ? "启用" : "停用"}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1">
                      {t.stylePrefix && (
                        <p className="text-xs text-muted-foreground truncate">
                          <span className="font-medium">风格：</span>{t.stylePrefix}
                        </p>
                      )}
                      {t.charAnchor && (
                        <p className="text-xs text-muted-foreground truncate">
                          <span className="font-medium">角色锚点：</span>{t.charAnchor}
                        </p>
                      )}
                      {t.negativePrompt && (
                        <p className="text-xs text-destructive/60 truncate">
                          <span className="font-medium">Negative：</span>{t.negativePrompt}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* 全局模板库弹窗 */}
      <Dialog open={globalDialogOpen} onOpenChange={setGlobalDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="size-4" /> 全局模板库
            </DialogTitle>
          </DialogHeader>
          {globalTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">全局库暂无模板</p>
          ) : (
            <div className="space-y-2">
              {globalTemplates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30">
                  <Checkbox
                    checked={selectedGlobal.has(t.id)}
                    onCheckedChange={(checked) => {
                      setSelectedGlobal((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(t.id); else next.delete(t.id);
                        return next;
                      });
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.stylePrefix || t.charAnchor || "（无预览）"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{t.category}</Badge>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setGlobalDialogOpen(false)}>取消</Button>
            <Button onClick={handleCloneGlobal} disabled={cloning || !selectedGlobal.size}>
              <Download className="size-4 mr-1.5" />
              {cloning ? "导入中…" : `导入选中 (${selectedGlobal.size})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑模板" : "新建模板"}</DialogTitle>
          </DialogHeader>
          <PromptTemplateEditor
            projectId={projectId}
            template={editing}
            onSaved={handleSaved}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
