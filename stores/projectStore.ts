"use client";

import { create } from "zustand";

export interface CharacterData {
  id: string;
  name: string;
  prompt: string;
  refImageUrl: string;
}

export interface SceneData {
  id: string;
  episodeId: string;
  sceneOrder: number;
  visualPrompt: string;
  dialogue: string;
  audioPrompt: string;
  localImage?: string | null;
  localVideo?: string | null;
  localAudio?: string | null;
  status: string;
}

export interface EpisodeData {
  id: string;
  projectId: string;
  episodeNum: number;
  summary: string;
  status: string;
  scenes: SceneData[];
}

export interface ProjectData {
  id: string;
  title: string;
  globalLore: string;
  createdAt: string;
  characters: CharacterData[];
  episodes: EpisodeData[];
}

interface ProjectStore {
  projects: ProjectData[];
  currentProject: ProjectData | null;
  currentEpisode: EpisodeData | null;
  activeStep: number;

  setProjects: (projects: ProjectData[]) => void;
  setCurrentProject: (project: ProjectData | null) => void;
  setCurrentEpisode: (episode: EpisodeData | null) => void;
  setActiveStep: (step: number) => void;

  updateScene: (sceneId: string, patch: Partial<SceneData>) => void;
  addScene: (scene: SceneData) => void;
  replaceScenes: (episodeId: string, scenes: SceneData[]) => void;

  addCharacter: (character: CharacterData) => void;
  updateCharacter: (id: string, patch: Partial<CharacterData>) => void;
  removeCharacter: (id: string) => void;

  addEpisode: (episode: EpisodeData) => void;
  updateEpisode: (id: string, patch: Partial<EpisodeData>) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  currentEpisode: null,
  activeStep: 0,

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentEpisode: (episode) => set({ currentEpisode: episode }),
  setActiveStep: (step) => set({ activeStep: step }),

  updateScene: (sceneId, patch) =>
    set((state) => {
      if (!state.currentEpisode) return state;
      const scenes = state.currentEpisode.scenes.map((s) =>
        s.id === sceneId ? { ...s, ...patch } : s
      );
      return { currentEpisode: { ...state.currentEpisode, scenes } };
    }),

  addScene: (scene) =>
    set((state) => {
      if (!state.currentEpisode) return state;
      return {
        currentEpisode: {
          ...state.currentEpisode,
          scenes: [...state.currentEpisode.scenes, scene],
        },
      };
    }),

  replaceScenes: (episodeId, scenes) =>
    set((state) => {
      if (!state.currentEpisode || state.currentEpisode.id !== episodeId) return state;
      return { currentEpisode: { ...state.currentEpisode, scenes } };
    }),

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
      const currentEpisode =
        state.currentEpisode?.id === id
          ? { ...state.currentEpisode, ...patch }
          : state.currentEpisode;
      return {
        currentProject: { ...state.currentProject, episodes },
        currentEpisode,
      };
    }),
}));
