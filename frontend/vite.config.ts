import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
// Dev server only. VITE_DEV_HMR=false stops the open browser tab from updating/reloading on every
// saved file (useful while many files are being edited); press F5 to load the latest code.
const devHmrEnabled = process.env.VITE_DEV_HMR !== "false";

/**
 * Installable mobile app (docs/mobile-feasibility). Off unless VITE_PWA_ENABLED=true at build time.
 * - On: index.html (and every page shell copied from it) links the web app manifest and iPhone tags.
 * - Always: the build writes version.json, which installed apps poll to notice a new release.
 */
function p7MobileAppPlugin(): Plugin {
  const enabled = process.env.VITE_PWA_ENABLED === "true";
  const version = process.env.VITE_APP_VERSION || "dev";
  return {
    name: "p7-mobile-app",
    transformIndexHtml() {
      if (!enabled) return [];
      return [
        { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Prime7 ERP" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" }, injectTo: "head" },
      ];
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version, built_at: new Date().toISOString() })}\n`,
      });
    },
  };
}
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
    p7MobileAppPlugin(),
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
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Only third-party libraries get named chunks. App pages are split per route by
        // React.lazy; forcing whole page folders into one chunk made every route preload them.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
            if (id.includes("react-router")) return "vendor-react-router";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("qrcode.react")) return "vendor-qrcode";
            if (id.includes("react-helmet-async")) return "vendor-helmet";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("i18next")) return "vendor-i18n";
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query-core")) return "vendor-query";
            return undefined;
          }
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
      // Polling stats every file over the slow Windows bind mount and starves Node's fs threads.
      // dist/ is build output (never imported in dev); images/videos in public/ change rarely.
      binaryInterval: 5000,
      // Test files are never loaded by the app; watching them only caused full page reloads.
      ignored: [
        "**/dist/**",
        "**/coverage/**",
        "**/tsconfig.tsbuildinfo",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
      ],
    },
    hmr: !devHmrEnabled
      ? false
      : isProduction
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
      // Exact path only (keys starting with ^ are regexes), same as `location = /health` in nginx.prod.conf.
      "^/health(\\?|$)": {
        target: process.env.VITE_DEV_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
      // Uploaded files, same as `location /media/` in nginx.prod.conf.
      "/media/": {
        target: process.env.VITE_DEV_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  };
});
