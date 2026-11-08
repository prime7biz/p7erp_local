import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // Logic tests run in node. Component tests (*.test.tsx) opt into a DOM with
    // a `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
