"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CharacterData } from "@/stores/projectStore";

interface CharacterCardProps {
  character: CharacterData;
}

export function CharacterCard({ character }: CharacterCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-12 shrink-0 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {character.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{character.name}</p>
            {character.role && (
              <p className="text-xs text-muted-foreground mt-0.5">{character.role}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
