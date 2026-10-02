# Third-Party Licenses / Lizenzhinweise

Chaos Launcher und Chaos Client sind eigenständige Entwicklungen von ChaoscraftSMP.
Beide verwenden Open-Source-Software. Die jeweiligen Lizenzbedingungen werden
eingehalten; dieses Dokument enthält die erforderlichen Hinweise. Die Lizenztexte
der einzelnen Komponenten liegen den jeweiligen Paketen bei (`node_modules/`,
Cargo-Registry, Gradle-Cache) und sind über die angegebenen Projektseiten abrufbar.

Minecraft ist eine Marke von Mojang Studios / Microsoft. Chaos Launcher und Chaos
Client sind inoffizielle Projekte und stehen in keiner Verbindung zu Mojang,
Microsoft oder anderen Launchern/Clients. Es wurden keine Designs, Logos, Texte
oder Assets Dritter kopiert.

## Chaos Launcher (Desktop-App)

| Komponente | Lizenz | Projekt |
|---|---|---|
| Tauri 2 (tauri, tauri-build, tauri-plugin-shell, tauri-plugin-dialog) | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri |
| React, React DOM | MIT | https://github.com/facebook/react |
| React Router | MIT | https://github.com/remix-run/react-router |
| Zustand | MIT | https://github.com/pmndrs/zustand |
| skinview3d | MIT | https://github.com/bs-community/skinview3d |
| three.js (Abhängigkeit von skinview3d) | MIT | https://github.com/mrdoob/three.js |
| Vite | MIT | https://github.com/vitejs/vite |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @tauri-apps/api, plugin-dialog, plugin-fs, plugin-shell | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| serde, serde_json | MIT OR Apache-2.0 | https://serde.rs |
| reqwest | MIT OR Apache-2.0 | https://github.com/seanmonstar/reqwest |
| tokio, futures | MIT | https://tokio.rs |
| zip | MIT | https://github.com/zip-rs/zip2 |
| sha1, sha2 (RustCrypto) | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| hex | MIT OR Apache-2.0 | https://github.com/KokaKiwi/rust-hex |
| base64 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| chrono | MIT OR Apache-2.0 | https://github.com/chronotope/chrono |
| dirs | MIT OR Apache-2.0 | https://github.com/dirs-dev/dirs-rs |
| thiserror | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| log, env_logger | MIT OR Apache-2.0 | https://github.com/rust-lang/log |
| discord-rich-presence | MIT | https://github.com/sardonicism-04/discord-rich-presence |
| windows-rs (Win32 DPAPI) | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |

## Chaos Client (Fabric-Mod, `../onyx-visuals`)

| Komponente | Lizenz | Projekt |
|---|---|---|
| Fabric Loader | Apache-2.0 | https://github.com/FabricMC/fabric-loader |
| Fabric API | Apache-2.0 | https://github.com/FabricMC/fabric |
| Fabric Loom (Build) | MIT | https://github.com/FabricMC/fabric-loom |
| Yarn Mappings | CC0-1.0 | https://github.com/FabricMC/yarn |
| SpongePowered Mixin | MIT | https://github.com/SpongePowered/Mixin |
| Gson | Apache-2.0 | https://github.com/google/gson |
| LWJGL 3 / GLFW-Bindings | BSD-3-Clause (GLFW: zlib) | https://www.lwjgl.org |
| JOML | MIT | https://github.com/JOML-CI/JOML |
| Brigadier | MIT | https://github.com/Mojang/brigadier |

Die Client-JAR enthält diese Hinweise als `THIRD_PARTY_LICENSES.txt`.

## Apache License 2.0 – Hinweis

Für Komponenten unter Apache-2.0 (Fabric Loader, Fabric API, Gson, TypeScript u. a.)
gilt: Die Software wird „AS IS“ bereitgestellt, ohne Gewährleistung. Der vollständige
Lizenztext: https://www.apache.org/licenses/LICENSE-2.0

## MIT License – Hinweis

Für Komponenten unter MIT (React, Zustand, skinview3d, three.js, Mixin, JOML,
Brigadier, discord-rich-presence u. a.) gilt: Permission is hereby granted, free of
charge, to any person obtaining a copy of this software … THE SOFTWARE IS PROVIDED
"AS IS", WITHOUT WARRANTY OF ANY KIND. Der vollständige Lizenztext:
https://opensource.org/licenses/MIT
