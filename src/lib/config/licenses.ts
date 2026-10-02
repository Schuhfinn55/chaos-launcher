/* ============================================================
 * Chaos Launcher - Open-Source-Komponenten
 *
 * Launcher und Chaos Client bauen auf Open-Source-Software auf. Die
 * Lizenzen werden eingehalten; vollständige Texte und Hinweise stehen
 * in THIRD_PARTY_LICENSES.md im Repository und in der Client-JAR.
 * ============================================================ */

export interface LicenseEntry {
  name: string;
  version?: string;
  license: string;
  url: string;
  part: "launcher" | "client";
  note?: string;
}

export const LICENSES: LicenseEntry[] = [
  // Launcher (Tauri + React)
  { name: "Tauri", version: "2.x", license: "MIT / Apache-2.0", url: "https://github.com/tauri-apps/tauri", part: "launcher" },
  { name: "React / React DOM", version: "18", license: "MIT", url: "https://github.com/facebook/react", part: "launcher" },
  { name: "React Router", version: "6", license: "MIT", url: "https://github.com/remix-run/react-router", part: "launcher" },
  { name: "Zustand", license: "MIT", url: "https://github.com/pmndrs/zustand", part: "launcher" },
  { name: "skinview3d", license: "MIT", url: "https://github.com/bs-community/skinview3d", part: "launcher", note: "3D-Skin-/Cape-Vorschau" },
  { name: "three.js", license: "MIT", url: "https://github.com/mrdoob/three.js", part: "launcher", note: "Abhängigkeit von skinview3d" },
  { name: "Vite / TypeScript", license: "MIT / Apache-2.0", url: "https://github.com/vitejs/vite", part: "launcher" },
  { name: "reqwest, tokio, serde, serde_json, zip, sha1/sha2, hex, chrono, futures, dirs, thiserror, log, env_logger, base64", license: "MIT / Apache-2.0", url: "https://crates.io", part: "launcher", note: "Rust-Crates" },
  { name: "discord-rich-presence", license: "MIT", url: "https://github.com/sardonicism-04/discord-rich-presence", part: "launcher" },
  { name: "windows-rs", license: "MIT / Apache-2.0", url: "https://github.com/microsoft/windows-rs", part: "launcher", note: "DPAPI-Verschlüsselung der Tokens" },
  // Chaos Client (Fabric-Mod)
  { name: "Fabric Loader", license: "Apache-2.0", url: "https://github.com/FabricMC/fabric-loader", part: "client" },
  { name: "Fabric API", license: "Apache-2.0", url: "https://github.com/FabricMC/fabric", part: "client" },
  { name: "Fabric Loom", license: "MIT", url: "https://github.com/FabricMC/fabric-loom", part: "client", note: "Build-Werkzeug" },
  { name: "Yarn Mappings", license: "CC0-1.0", url: "https://github.com/FabricMC/yarn", part: "client" },
  { name: "SpongePowered Mixin", license: "MIT", url: "https://github.com/SpongePowered/Mixin", part: "client" },
  { name: "Gson", license: "Apache-2.0", url: "https://github.com/google/gson", part: "client" },
  { name: "LWJGL / GLFW", license: "BSD-3-Clause / zlib", url: "https://www.lwjgl.org", part: "client" },
  { name: "JOML", license: "MIT", url: "https://github.com/JOML-CI/JOML", part: "client" },
  { name: "Brigadier", license: "MIT", url: "https://github.com/Mojang/brigadier", part: "client", note: "/chaos-Befehle" },
];

export const THIRD_PARTY_FILE = "THIRD_PARTY_LICENSES.md";
export const CLIENT_NOTICE = "Minecraft ist eine Marke von Mojang Studios / Microsoft. Der Chaos Client ist ein inoffizieller, eigenständig entwickelter Fabric-Client und steht in keiner Verbindung zu Mojang, Microsoft oder anderen Clients.";
