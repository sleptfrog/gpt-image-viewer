import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const devtoolsRoot = resolve(projectRoot, "src/devtools");
const sidepanelRoot = resolve(projectRoot, "src/sidepanel");

export default defineConfig({
  root: projectRoot,
  base: "./",
  publicDir: resolve(projectRoot, "public"),
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        background: resolve(projectRoot, "src/background/service-worker.ts"),
        devtools: resolve(devtoolsRoot, "devtools.html"),
        panel: resolve(devtoolsRoot, "panel.html"),
        sidepanel: resolve(sidepanelRoot, "sidepanel.html")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  test: {
    environment: "node",
    include: [resolve(projectRoot, "tests/**/*.test.ts")]
  }
});
