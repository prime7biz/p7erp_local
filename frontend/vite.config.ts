import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-router")) return "vendor-react-router";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("lucide-react")) return "vendor-icons";
            return undefined;
          }
          if (id.includes("/src/pages/app/hr/")) return "pages-hr";
          if (id.includes("/src/pages/app/manufacturing/")) return "pages-manufacturing";
          if (id.includes("/src/pages/app/reports/")) return "pages-reports";
          if (id.includes("/src/pages/public/")) return "pages-public";
          if (id.includes("/src/api/client.ts")) return "api-client";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      // More reliable file watching with Docker Desktop bind mounts on Windows.
      usePolling: true,
      interval: 1000,
    },
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_PROXY_TARGET ?? "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});

