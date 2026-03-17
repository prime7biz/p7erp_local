import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const defaultAllowedHosts = ["localhost", "127.0.0.1"];

export default defineConfig(async ({ mode }) => {
  const analyzePlugins =
    mode === "analyze"
      ? [
          (await import("rollup-plugin-visualizer")).visualizer({
            filename: "dist/stats.html",
            open: false,
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : [];
  return {
  plugins: [
    react(),
    ...analyzePlugins,
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  optimizeDeps: {
    include: ["qrcode.react"],
  },
  build: {
    minify: "esbuild",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        chunkSizeWarningLimit: 500,
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
            if (id.includes("react-router")) return "vendor-react-router";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("qrcode.react")) return "vendor-qrcode";
            if (id.includes("react-helmet-async")) return "vendor-helmet";
            if (id.includes("@radix-ui")) return "vendor-radix";
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
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : defaultAllowedHosts,
    watch: {
      // More reliable file watching with Docker Desktop bind mounts on Windows.
      usePolling: true,
      interval: 1000,
    },
    hmr: isProduction
      ? {
          protocol: "wss",
          port: 443,
          clientPort: 443,
        }
      : {
          protocol: "ws",
          port: 5173,
          clientPort: 5173,
        },
    proxy: {
      "/api": {
        // Default localhost so dev on host works; in Docker set VITE_DEV_PROXY_TARGET=http://backend:8000 if using proxy
        target: process.env.VITE_DEV_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  };
});
