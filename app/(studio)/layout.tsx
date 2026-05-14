"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/stores/projectStore";
import axios from "axios";
import type { ProjectData } from "@/stores/projectStore";
import { Film, FolderOpen, Home, Clapperboard } from "lucide-react";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const { projects, currentProject, setProjects, setCurrentProject } = useProjectStore();
  const pathname = usePathname();

  useEffect(() => {
    axios.get<ProjectData[]>("/api/projects").then((res) => {
      setProjects(res.data);
    }).catch(console.error);
  }, [setProjects]);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar className="border-r border-border/50">
          <SidebarHeader className="px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Clapperboard className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight tracking-tight text-foreground">
                  AI Director
                </p>
                <p className="text-[10px] text-muted-foreground">Studio v0.1</p>
              </div>
            </Link>
          </SidebarHeader>

          <Separator className="opacity-30" />

          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/" />}
                    isActive={pathname === "/"}
                  >
                    <Home className="size-4" />
                    <span>所有项目</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>最近项目</SidebarGroupLabel>
              <ScrollArea className="max-h-64">
                <SidebarMenu>
                  {projects.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">暂无项目</p>
                  ) : (
                    projects.map((project) => (
                      <SidebarMenuItem key={project.id}>
                        <SidebarMenuButton
                          render={<Link href={`/projects/${project.id}`} />}
                          isActive={pathname.startsWith(`/projects/${project.id}`)}
                          onClick={() => setCurrentProject(project)}
                        >
                          <Film className="size-4" />
                          <span className="truncate">{project.title}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                            {project.episodes?.length ?? 0}集
                          </Badge>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </ScrollArea>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <div className="text-[10px] text-muted-foreground text-center opacity-50">
              AI Director Studio v0.1.0
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="h-12 flex items-center gap-3 px-4 border-b border-border/50 shrink-0">
            <SidebarTrigger className="size-7" />
            <Separator orientation="vertical" className="h-4 opacity-30" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="size-3.5" />
              <span>{currentProject?.title ?? "选择项目"}</span>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
