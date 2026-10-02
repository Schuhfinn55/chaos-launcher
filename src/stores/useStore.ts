/* ============================================================
 * Chaos Launcher - Zustand-Stores
 *
 * Persistenz läuft über das Tauri-Backend (localStorage nur für
 * UI-Zustand wie aktives Profil, Modul-Zustände).
 * ============================================================ */

import { create } from "zustand";
import { invoke } from "@/lib/bridge";
import type {
  Account,
  AppInfo,
  CosmeticsState,
  Friend,
  IngameProfile,
  Instance,
  InstanceStatus,
  ModuleStates,
  ServerStatus,
  Settings,
  SkinEntry,
  UpdateInfo,
  PlayerSkin,
  ClientUpdateInfo,
} from "@/types";

/* -------------------- Profile / Instanzen -------------------- */
const ACTIVE_KEY = "chaos.activeInstance";

interface InstanceStore {
  instances: Instance[];
  activeId: string | null;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  add: (i: Instance) => Promise<void>;
  update: (id: string, patch: Partial<Instance>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  /** Aktives Profil (Fallback: Standard aus Einstellungen, dann zuletzt gespielt). */
  active: () => Instance | null;
}

export const useInstanceStore = create<InstanceStore>((set, get) => ({
  instances: [],
  activeId: localStorage.getItem(ACTIVE_KEY) || localStorage.getItem("onyx.activeInstance") || null,
  loading: false,
  loaded: false,
  async load() {
    set({ loading: true });
    try {
      const instances = await invoke<Instance[]>("get_instances");
      let activeId = get().activeId;
      if (activeId && !instances.some((i) => i.id === activeId)) activeId = null;
      if (!activeId) {
        const settings = useSettingsStore.getState().settings;
        const def = settings?.defaultInstanceId;
        if (def && instances.some((i) => i.id === def)) activeId = def;
      }
      if (!activeId && instances.length > 0) {
        const sorted = [...instances].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
        activeId = sorted[0].id;
      }
      set({ instances, activeId, loading: false, loaded: true });
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      set({ loading: false, loaded: true });
    }
  },
  async add(instance) {
    const next = [...get().instances, instance];
    set({ instances: next });
    await invoke("save_instances", { instances: next });
  },
  async update(id, patch) {
    const next = get().instances.map((i) => (i.id === id ? { ...i, ...patch } : i));
    set({ instances: next });
    await invoke("save_instances", { instances: next });
  },
  async remove(id) {
    const next = get().instances.filter((i) => i.id !== id);
    set({ instances: next });
    await invoke("save_instances", { instances: next });
    if (get().activeId === id) {
      const fallback = next[0]?.id ?? null;
      set({ activeId: fallback });
      if (fallback) localStorage.setItem(ACTIVE_KEY, fallback);
      else localStorage.removeItem(ACTIVE_KEY);
    }
  },
  setActive(id) {
    set({ activeId: id });
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  },
  active() {
    const { instances, activeId } = get();
    return instances.find((i) => i.id === activeId) ?? null;
  },
}));

/* -------------------- Accounts -------------------- */
interface AccountStore {
  accounts: Account[];
  active: Account | null;
  loaded: boolean;
  load: () => Promise<void>;
  setActive: (uuid: string) => Promise<void>;
  remove: (uuid: string) => Promise<void>;
  applyList: (list: Account[]) => void;
}

export const useAccountStore = create<AccountStore>((set) => ({
  accounts: [],
  active: null,
  loaded: false,
  async load() {
    try {
      const accounts = await invoke<Account[]>("get_accounts");
      set({ accounts, active: accounts.find((a) => a.active) ?? null, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  async setActive(uuid) {
    const accounts = await invoke<Account[]>("set_active_account", { uuid });
    set({ accounts, active: accounts.find((a) => a.active) ?? null });
  },
  async remove(uuid) {
    const accounts = await invoke<Account[]>("remove_account", { uuid });
    set({ accounts, active: accounts.find((a) => a.active) ?? null });
  },
  applyList(list) {
    set({ accounts: list, active: list.find((a) => a.active) ?? null });
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
    try {
      const settings = await invoke<Settings>("get_settings");
      set({ settings });
    } catch {
      /* Backend nicht erreichbar */
    }
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
    try {
      const friends = await invoke<Friend[] | null>("get_friends");
      set({ friends: friends ?? [] });
    } catch {
      /* leer */
    }
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

/* -------------------- Skins -------------------- */
interface SkinStore {
  skins: SkinEntry[];
  activeSkinId: string | null;
  load: () => Promise<void>;
  add: (s: SkinEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActiveSkin: (id: string | null) => void;
}

const SKIN_KEY = "chaos.activeSkinId";

export const useSkinStore = create<SkinStore>((set, get) => ({
  skins: [],
  activeSkinId: localStorage.getItem(SKIN_KEY) || localStorage.getItem("onyx.activeSkinId") || null,
  async load() {
    try {
      const skins = await invoke<SkinEntry[] | null>("get_skins");
      set({ skins: (skins ?? []).filter((s) => s.type === "skin") });
    } catch {
      /* leer */
    }
  },
  async add(skin) {
    const next = [...get().skins, skin];
    set({ skins: next });
    await invoke("save_skins", { skins: next });
  },
  async remove(id) {
    const next = get().skins.filter((s) => s.id !== id);
    set({ skins: next, activeSkinId: get().activeSkinId === id ? null : get().activeSkinId });
    if (get().activeSkinId === null) localStorage.removeItem(SKIN_KEY);
    try {
      await invoke("save_skins", { skins: next });
    } catch (e) {
      console.error("[Chaos] save_skins fehlgeschlagen:", e);
    }
  },
  setActiveSkin(id) {
    set({ activeSkinId: id });
    if (id) localStorage.setItem(SKIN_KEY, id);
    else localStorage.removeItem(SKIN_KEY);
  },
}));

/* -------------------- Echte Account-Skins -------------------- */
interface ProfileSkinStore {
  byUuid: Record<string, PlayerSkin>;
  loading: Record<string, boolean>;
  load: (uuid: string, force?: boolean) => Promise<void>;
}

export const useProfileSkinStore = create<ProfileSkinStore>((set, get) => ({
  byUuid: {},
  loading: {},
  async load(uuid, force = false) {
    if (!uuid) return;
    const have = get().byUuid[uuid];
    if (!force && have && Date.now() - have.fetchedAt < 10 * 60 * 1000) return;
    if (get().loading[uuid]) return;
    set((s) => ({ loading: { ...s.loading, [uuid]: true } }));
    try {
      const skin = await invoke<PlayerSkin>("get_player_skin", { uuid });
      set((s) => ({ byUuid: { ...s.byUuid, [uuid]: skin } }));
    } catch (e) {
      console.warn("[Chaos] Skin konnte nicht geladen werden:", e);
    } finally {
      set((s) => ({ loading: { ...s.loading, [uuid]: false } }));
    }
  },
}));

/* -------------------- Cosmetics -------------------- */
interface CosmeticsStore {
  state: CosmeticsState | null;
  load: () => Promise<void>;
  set: (s: CosmeticsState) => void;
}

export const useCosmeticsStore = create<CosmeticsStore>((set) => ({
  state: null,
  async load() {
    try {
      const state = await invoke<CosmeticsState>("get_cosmetics");
      set({ state });
    } catch {
      set({ state: { capes: [], profiles: [], version: 1 } });
    }
  },
  set(s) {
    set({ state: s });
  },
}));

/* -------------------- Status (Startprüfung, Server, Updates) -------------------- */
interface StatusStore {
  appInfo: AppInfo | null;
  update: UpdateInfo | null;
  clientUpdate: ClientUpdateInfo | null;
  updateChecked: boolean;
  instanceStatus: Record<string, InstanceStatus>;
  serverStatus: Record<string, ServerStatus>;
  running: string[];
  setAppInfo: (a: AppInfo) => void;
  setUpdate: (u: UpdateInfo | null) => void;
  setClientUpdate: (u: ClientUpdateInfo | null) => void;
  setInstanceStatus: (s: InstanceStatus) => void;
  setServerStatus: (s: ServerStatus) => void;
  setRunning: (ids: string[]) => void;
}

export const useStatusStore = create<StatusStore>((set) => ({
  appInfo: null,
  update: null,
  clientUpdate: null,
  updateChecked: false,
  instanceStatus: {},
  serverStatus: {},
  running: [],
  setAppInfo: (appInfo) => set({ appInfo }),
  setUpdate: (update) => set({ update, updateChecked: true }),
  setClientUpdate: (clientUpdate) => set({ clientUpdate }),
  setInstanceStatus: (s) => set((st) => ({ instanceStatus: { ...st.instanceStatus, [s.instanceId]: s } })),
  setServerStatus: (s) => set((st) => ({ serverStatus: { ...st.serverStatus, [`${s.address}:${s.port}`]: s } })),
  setRunning: (running) => set({ running }),
}));

/* -------------------- Ingame-Module / Profile -------------------- */
interface ModuleStore {
  states: ModuleStates;
  profiles: IngameProfile[];
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

const MODULES_KEY = "chaos.moduleStates";
const PROFILES_KEY = "chaos.ingameProfiles";
const ACTIVE_PROFILE_KEY = "chaos.activeProfile";

function readJson<T>(key: string, legacyKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persistStates(states: ModuleStates) {
  localStorage.setItem(MODULES_KEY, JSON.stringify(states));
}
function persistProfiles(profiles: IngameProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export const useModuleStore = create<ModuleStore>((set, get) => ({
  states: readJson<ModuleStates>(MODULES_KEY, "onyx.moduleStates", {}),
  profiles: readJson<IngameProfile[]>(PROFILES_KEY, "onyx.ingameProfiles", []),
  activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY) || localStorage.getItem("onyx.activeProfile") || null,
  load() {
    set({
      states: readJson<ModuleStates>(MODULES_KEY, "onyx.moduleStates", {}),
      profiles: readJson<IngameProfile[]>(PROFILES_KEY, "onyx.ingameProfiles", []),
      activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY) || null,
    });
  },
  setEnabled(moduleId, enabled) {
    const cur = get().states[moduleId] ?? { enabled: false, settings: {} };
    const next: ModuleStates = { ...get().states, [moduleId]: { ...cur, enabled } };
    set({ states: next });
    persistStates(next);
  },
  setInstalled(moduleId, installed) {
    const cur = get().states[moduleId] ?? { enabled: false, settings: {} };
    const next: ModuleStates = { ...get().states, [moduleId]: { ...cur, installed } };
    set({ states: next });
    persistStates(next);
  },
  setSetting(moduleId, key, value) {
    const cur = get().states[moduleId] ?? { enabled: false, settings: {} };
    const next: ModuleStates = { ...get().states, [moduleId]: { ...cur, settings: { ...cur.settings, [key]: value } } };
    set({ states: next });
    persistStates(next);
  },
  resetAll() {
    set({ states: {} });
    persistStates({});
  },
  saveProfile(name) {
    const profile: IngameProfile = { id: "prof_" + Date.now().toString(36), name, states: { ...get().states } };
    const next = [...get().profiles, profile];
    set({ profiles: next });
    persistProfiles(next);
  },
  loadProfile(id) {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile) return;
    set({ states: { ...profile.states }, activeProfileId: id });
    persistStates(profile.states);
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  },
  deleteProfile(id) {
    const next = get().profiles.filter((p) => p.id !== id);
    set({ profiles: next, activeProfileId: get().activeProfileId === id ? null : get().activeProfileId });
    persistProfiles(next);
    if (get().activeProfileId === null) localStorage.removeItem(ACTIVE_PROFILE_KEY);
  },
}));
