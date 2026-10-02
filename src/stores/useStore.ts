/* ============================================================
 * Onyx Launcher - Zustand-Stores
 *
 * Wir nutzen Zustand für schlankes State-Management. Persistenz
 * läuft über das Tauri-Backend (localStorage als Fallback).
 * ============================================================ */

import { create } from "zustand";
import { invoke } from "@/lib/bridge";
import type {
  Instance,
  Account,
  Settings,
  Friend,
  SkinEntry,
  ModuleStates,
  ModuleState,
  IngameProfile,
} from "@/types";

/* -------------------- Profile -------------------- */
interface InstanceStore {
  instances: Instance[];
  activeId: string | null;
  loading: boolean;
  load: () => Promise<void>;
  add: (i: Instance) => Promise<void>;
  update: (id: string, patch: Partial<Instance>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
}

export const useInstanceStore = create<InstanceStore>((set, get) => ({
  instances: [],
  activeId: null,
  loading: false,
  async load() {
    set({ loading: true });
    const instances = await invoke<Instance[]>("get_instances");
    set({ instances, loading: false });
  },
  async add(instance) {
    const next = [...get().instances, instance];
    set({ instances: next });
    await invoke("save_instances", { instances: next });
  },
  async update(id, patch) {
    const next = get().instances.map((i) =>
      i.id === id ? { ...i, ...patch } : i
    );
    set({ instances: next });
    await invoke("save_instances", { instances: next });
  },
  async remove(id) {
    const next = get().instances.filter((i) => i.id !== id);
    set({ instances: next });
    await invoke("save_instances", { instances: next });
    if (get().activeId === id) set({ activeId: null });
  },
  setActive(id) {
    set({ activeId: id });
  },
}));

/* -------------------- Accounts -------------------- */
interface AccountStore {
  accounts: Account[];
  active: Account | null;
  load: () => Promise<void>;
  setActive: (uuid: string) => void;
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  active: null,
  async load() {
    const accounts = await invoke<Account[]>("get_accounts");
    const active = accounts.find((a) => a.active) ?? null;
    set({ accounts, active });
  },
  setActive(uuid) {
    const accounts = get().accounts.map((a) => ({
      ...a,
      active: a.uuid === uuid,
    }));
    const active = accounts.find((a) => a.uuid === uuid) ?? null;
    set({ accounts, active });
  },
}));

/* -------------------- Settings -------------------- */
interface SettingsStore {
  settings: Settings | null;
  load: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  async load() {
    const settings = await invoke<Settings>("get_settings");
    set({ settings });
  },
  async save(patch) {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ settings: next });
    await invoke("save_settings", { settings: next });
  },
}));

/* -------------------- Freunde -------------------- */
interface FriendStore {
  friends: Friend[];
  load: () => Promise<void>;
  add: (f: Friend) => Promise<void>;
  update: (id: string, patch: Partial<Friend>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useFriendStore = create<FriendStore>((set, get) => ({
  friends: [],
  async load() {
    const friends = await invoke<Friend[] | null>("get_friends");
    set({ friends: friends ?? [] });
  },
  async add(friend) {
    const next = [...get().friends, friend];
    set({ friends: next });
    await invoke("save_friends", { friends: next });
  },
  async update(id, patch) {
    const next = get().friends.map((f) => (f.id === id ? { ...f, ...patch } : f));
    set({ friends: next });
    await invoke("save_friends", { friends: next });
  },
  async remove(id) {
    const next = get().friends.filter((f) => f.id !== id);
    set({ friends: next });
    await invoke("save_friends", { friends: next });
  },
}));

/* -------------------- Skins / Capes -------------------- */
interface SkinStore {
  skins: SkinEntry[];
  /** Aktuell ausgewählter Skin (lokal). */
  activeSkinId: string | null;
  activeCapeId: string | null;
  load: () => Promise<void>;
  add: (s: SkinEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActiveSkin: (id: string | null) => void;
  setActiveCape: (id: string | null) => void;
}

export const useSkinStore = create<SkinStore>((set, get) => ({
  skins: [],
  activeSkinId: null,
  activeCapeId: null,
  async load() {
    const skins = await invoke<SkinEntry[] | null>("get_skins");
    set({
      skins: skins ?? [],
      activeSkinId: localStorage.getItem("onyx.activeSkinId") || null,
      activeCapeId: localStorage.getItem("onyx.activeCapeId") || null,
    });
  },
  async add(skin) {
    const next = [...get().skins, skin];
    set({ skins: next });
    await invoke("save_skins", { skins: next });
  },
  async remove(id) {
    const next = get().skins.filter((s) => s.id !== id);
    // State sofort aktualisieren (UI reagiert sofort)
    set({
      skins: next,
      activeSkinId: get().activeSkinId === id ? null : get().activeSkinId,
      activeCapeId: get().activeCapeId === id ? null : get().activeCapeId,
    });
    // active IDs in localStorage aktualisieren
    if (get().activeSkinId === null) localStorage.removeItem("onyx.activeSkinId");
    if (get().activeCapeId === null) localStorage.removeItem("onyx.activeCapeId");
    // Persistenz (Fehler werden nicht geworfen, State ist schon aktuell)
    try {
      await invoke("save_skins", { skins: next });
    } catch (e) {
      console.error("[Onyx] save_skins fehlgeschlagen:", e);
    }
  },
  setActiveSkin(id) {
    set({ activeSkinId: id });
    if (id) localStorage.setItem("onyx.activeSkinId", id);
    else localStorage.removeItem("onyx.activeSkinId");
  },
  setActiveCape(id) {
    set({ activeCapeId: id });
    if (id) localStorage.setItem("onyx.activeCapeId", id);
    else localStorage.removeItem("onyx.activeCapeId");
  },
}));

/* -------------------- Ingame-Module / Profile -------------------- */
interface ModuleStore {
  /** Aktive Modul-Zustände (welche Module an sind + ihre Settings). */
  states: ModuleStates;
  /** Gespeicherte Ingame-Profile (Preset-Sets). */
  profiles: IngameProfile[];
  /** Aktuell aktives Profil. */
  activeProfileId: string | null;
  load: () => void;
  setEnabled: (moduleId: string, enabled: boolean) => void;
  setInstalled: (moduleId: string, installed: boolean) => void;
  setSetting: (moduleId: string, key: string, value: boolean | number) => void;
  resetAll: () => void;
  saveProfile: (name: string) => void;
  loadProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
}

const MODULES_KEY = "onyx.moduleStates";
const PROFILES_KEY = "onyx.ingameProfiles";
const ACTIVE_PROFILE_KEY = "onyx.activeProfile";

function persistStates(states: ModuleStates) {
  localStorage.setItem(MODULES_KEY, JSON.stringify(states));
}
function persistProfiles(profiles: IngameProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export const useModuleStore = create<ModuleStore>((set, get) => ({
  states: (() => {
    try {
      return JSON.parse(localStorage.getItem(MODULES_KEY) || "{}");
    } catch {
      return {};
    }
  })(),
  profiles: (() => {
    try {
      return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
    } catch {
      return [];
    }
  })(),
  activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY) || null,
  load() {
    try {
      const states = JSON.parse(localStorage.getItem(MODULES_KEY) || "{}");
      const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
      const activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || null;
      set({ states, profiles, activeProfileId });
    } catch {
      /* leer */
    }
  },
  setEnabled(moduleId, enabled) {
    const cur = get().states[moduleId] ?? { enabled: false, settings: {} };
    const next: ModuleStates = {
      ...get().states,
      [moduleId]: { ...cur, enabled },
    };
    set({ states: next });
    persistStates(next);
  },
  setInstalled(moduleId, installed) {
    const cur = get().states[moduleId] ?? { enabled: false, settings: {} };
    const next: ModuleStates = {
      ...get().states,
      [moduleId]: { ...cur, installed },
    };
    set({ states: next });
    persistStates(next);
  },
  setSetting(moduleId, key, value) {
    const cur = get().states[moduleId] ?? { enabled: false, settings: {} };
    const next: ModuleStates = {
      ...get().states,
      [moduleId]: {
        ...cur,
        settings: { ...cur.settings, [key]: value },
      },
    };
    set({ states: next });
    persistStates(next);
  },
  resetAll() {
    set({ states: {} });
    persistStates({});
  },
  saveProfile(name) {
    const profile: IngameProfile = {
      id: "prof_" + Date.now().toString(36),
      name,
      states: { ...get().states },
    };
    const next = [...get().profiles, profile];
    set({ profiles: next });
    persistProfiles(next);
  },
  loadProfile(id) {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile) return;
    set({
      states: { ...profile.states },
      activeProfileId: id,
    });
    persistStates(profile.states);
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  },
  deleteProfile(id) {
    const next = get().profiles.filter((p) => p.id !== id);
    set({
      profiles: next,
      activeProfileId: get().activeProfileId === id ? null : get().activeProfileId,
    });
    persistProfiles(next);
    if (get().activeProfileId === null) {
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
  },
}));
