import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const contentRoot = resolve(projectRoot, "src/content");
const sidepanelRoot = resolve(projectRoot, "src/sidepanel");
const contentScriptEntries = new Set(["content-script", "page-hook"]);

function wrapContentScriptIifes() {
  return {
    name: "wrap-content-script-iifes",
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      for (const item of Object.values(bundle)) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const chunk = item as { type?: string; name?: string; code?: string };
        if (chunk.type === "chunk" && chunk.name && contentScriptEntries.has(chunk.name) && chunk.code) {
          chunk.code = `(() => {\n${chunk.code}\n})();\n`;
        }
      }
    }
  };
}

export default defineConfig({
  root: projectRoot,
  base: "./",
  publicDir: resolve(projectRoot, "public"),
  plugins: [wrapContentScriptIifes()],
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        background: resolve(projectRoot, "src/background/service-worker.ts"),
        "content-script": resolve(contentRoot, "content-script.ts"),
        "page-hook": resolve(contentRoot, "page-hook.ts"),
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
