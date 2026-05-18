"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AlertTriangle, AudioLines, ImageIcon, Video } from "lucide-react";

interface Props {
  type: "image" | "video" | "audio";
  src: string | null | undefined;
  title?: string;
  className?: string;
  poster?: string | null;
}

export function MediaPreview({ type, src, title, className, poster }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src) {
    return (
      <div className={cn("flex items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
        <MissingIcon type={type} />
      </div>
    );
  }

  if (failed) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md bg-muted text-muted-foreground", className)}>
        <AlertTriangle className="size-5 text-amber-500" />
        <span className="text-xs">预览加载失败</span>
      </div>
    );
  }

  if (type === "image") {
    return (
      <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
        <Image
          src={src}
          alt={title ?? "image preview"}
          fill
          className="object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className={cn("overflow-hidden rounded-md bg-black", className)}>
        <video
          className="h-full w-full object-cover"
          controls
          playsInline
          preload="metadata"
          poster={poster ?? undefined}
          onError={() => setFailed(true)}
        >
          <source src={src} />
        </video>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center rounded-md bg-muted px-3 py-2", className)}>
      <audio className="w-full" controls preload="metadata" onError={() => setFailed(true)}>
        <source src={src} />
      </audio>
    </div>
  );
}

function MissingIcon({ type }: { type: "image" | "video" | "audio" }) {
  if (type === "image") return <ImageIcon className="size-6" />;
  if (type === "video") return <Video className="size-6" />;
  return <AudioLines className="size-6" />;
}
