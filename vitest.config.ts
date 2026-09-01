import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // next-auth's ESM does a bare `import "next/server"`, which Vitest's
      // resolver doesn't map to the package's `./server.js` entry. Alias it so
      // route handlers that transitively import next-auth can be unit-tested.
      { find: /^next\/server$/, replacement: "next/server.js" },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Force next-auth through Vite's transform so its bare `import "next/server"`
    // hits the alias above instead of Node's native ESM resolver.
    server: { deps: { inline: [/next-auth/, /@auth\//] } },
    // DB integration tests share one Postgres — don't run files in parallel.
    fileParallelism: false,
    hookTimeout: 20_000,
  },
});
