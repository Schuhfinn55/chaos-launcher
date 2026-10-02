import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite-Konfiguration für den Onyx Launcher.
// Tauri liefert Umgebungsvariablen, die wir hier an den Dev-Server weiterreichen.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // src-tauri (besonders target/) enthält tausende Build-Artefakte,
      // die den Windows-File-Watcher zum Absturz bringen (errno -4094).
      ignored: ["**/src-tauri/**"],
      // Polling ist auf Windows robuster als das native fs.watch.
      usePolling: true,
      interval: 1000,
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
