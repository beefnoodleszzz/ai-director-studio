"use client";

import { create } from "zustand";
type TaskStatus = {
  taskId: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message?: string;
  result?: string;
};

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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [taskId]: _removed, ...rest } = state.tasks;
      return { tasks: rest };
    }),

  clearTasks: () => set({ tasks: {} }),

  setGlobalProgress: (globalProgress) => set({ globalProgress }),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
}));

export function useTaskList() {
  return useGenerationStore((state) => Object.values(state.tasks));
}
