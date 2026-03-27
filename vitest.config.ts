import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types.ts"],
      thresholds: {
        statements: 100,
        // branches: 98% due to v8 counting branches inside `v8 ignore` regions
        // (HMAC-guarded defensive code + SDK canary guard — unreachable from public API)
        branches: 98,
        functions: 100,
        lines: 100,
      },
    },
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
