"use client";

import { create } from "zustand";

export interface CharacterData {
  id: string;
  name: string;
  gender?: string;
  ageRange?: string;
  role?: string;
  temperamentTags?: string;
  anchorFace?: string;
  basePrompt?: string;
}

export interface EpisodeData {
  id: string;
  projectId: string;
  episodeNum: number;
  title?: string;
  summary: string;
  status: string;
  scenes?: unknown[];
}

export interface ProjectData {
  id: string;
  title: string;
  type?: string;
  aspect?: string;
  worldSetting?: string;
  era?: string;
  createdAt: string;
  characters: CharacterData[];
  episodes: EpisodeData[];
  styleBible?: { id: string; genreTag?: string; visualStyle?: string } | null;
  // 保留兼容旧字段
  globalLore?: string;
}

interface ProjectStore {
  projects: ProjectData[];
  currentProject: ProjectData | null;

  setProjects: (projects: ProjectData[]) => void;
  setCurrentProject: (project: ProjectData | null) => void;

  addCharacter: (character: CharacterData) => void;
  updateCharacter: (id: string, patch: Partial<CharacterData>) => void;
  removeCharacter: (id: string) => void;

  addEpisode: (episode: EpisodeData) => void;
  updateEpisode: (id: string, patch: Partial<EpisodeData>) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),

  addCharacter: (character) =>
    set((state) => {
      if (!state.currentProject) return state;
      return {
        currentProject: {
          ...state.currentProject,
          characters: [...state.currentProject.characters, character],
        },
      };
    }),

  updateCharacter: (id, patch) =>
    set((state) => {
      if (!state.currentProject) return state;
      return {
        currentProject: {
          ...state.currentProject,
          characters: state.currentProject.characters.map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        },
      };
    }),

  removeCharacter: (id) =>
    set((state) => {
      if (!state.currentProject) return state;
      return {
        currentProject: {
          ...state.currentProject,
          characters: state.currentProject.characters.filter((c) => c.id !== id),
        },
      };
    }),

  addEpisode: (episode) =>
    set((state) => {
      if (!state.currentProject) return state;
      return {
        currentProject: {
          ...state.currentProject,
          episodes: [...state.currentProject.episodes, episode],
        },
      };
    }),

  updateEpisode: (id, patch) =>
    set((state) => {
      if (!state.currentProject) return state;
      const episodes = state.currentProject.episodes.map((e) =>
        e.id === id ? { ...e, ...patch } : e
      );
      return { currentProject: { ...state.currentProject, episodes } };
    }),
}));
