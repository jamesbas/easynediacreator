import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } }, test: { environment: "node", setupFiles: ["./tests/setup.ts"], exclude: ["e2e/**", "node_modules/**", ".next/**"], fileParallelism: false } });