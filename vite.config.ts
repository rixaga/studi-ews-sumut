import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // dev memakai /, build dan preview memakai path proyek GitHub Pages.
  base: mode === "production" ? "/studi-ews-sumut/" : "/",
  server: { host: "0.0.0.0", port: 5173 },
  preview: { host: "0.0.0.0", port: 4173 },
}));
