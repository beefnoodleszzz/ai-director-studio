"use client";

import { create } from "zustand";
import type { TaskStatus } from "@/types";

interface GenerationStore {
  tasks: Record<string, TaskStatus>;
  globalProgress: number;
  isGenerating: boolean;

  setTask: (taskId: string, task: TaskStatus) => void;
  updateTask: (taskId: string, patch: Partial<TaskStatus>) => void;
  removeTask: (taskId: string) => void;
  clearTasks: () => void;
  setGlobalProgress: (progress: number) => void;
  setIsGenerating: (isGenerating: boolean) => void;
}

export const useGenerationStore = create<GenerationStore>((set) => ({
  tasks: {},
  globalProgress: 0,
  isGenerating: false,

  setTask: (taskId, task) =>
    set((state) => ({
      tasks: { ...state.tasks, [taskId]: task },
    })),

  updateTask: (taskId, patch) =>
    set((state) => {
      const existing = state.tasks[taskId];
      if (!existing) return state;
      return {
        tasks: { ...state.tasks, [taskId]: { ...existing, ...patch } },
      };
    }),

  removeTask: (taskId) =>
    set((state) => {
      const { [taskId]: _, ...rest } = state.tasks;
      return { tasks: rest };
    }),

  clearTasks: () => set({ tasks: {} }),

  setGlobalProgress: (globalProgress) => set({ globalProgress }),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));

export function useTaskList() {
  return useGenerationStore((state) => Object.values(state.tasks));
}
