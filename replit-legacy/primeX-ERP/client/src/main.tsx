import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";


if (import.meta.env.DEV) {
  requestAnimationFrame(() => {
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue("--primary").trim();
    const sidebar = style.getPropertyValue("--sidebar-background").trim();
    const ok = primary === "24 95% 53%" && sidebar === "0 0% 100%";
    if (ok) {
      console.log(`%c[Theme] Prime7 Orange + Snow White Sidebar ✅`, "color:#F97316;font-weight:bold");
    } else {
      console.warn(`[Theme] DRIFT — primary: "${primary}", sidebar: "${sidebar}"`);
    }
  });
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light">
      <App />
    </ThemeProvider>
  </QueryClientProvider>
);
