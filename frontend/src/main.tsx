import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoot } from "./AppRoot";
import "@fontsource-variable/inter";
import "@fontsource-variable/crimson-pro";
import "./index.css";
import "@/lib/theme";
import { installChunkErrorRecovery } from "@/lib/chunkReload";
import { startMobileApp } from "@/lib/pwa/appUpdate";
import { prepareAppContainer, readRouteChunkIds, shouldHydrate } from "@/lib/prerenderSnapshot";
import { preloadRoutes } from "@/app/lazyRoute";

installChunkErrorRecovery();
startMobileApp();

const app = <AppRoot renderRouter={(children) => <BrowserRouter>{children}</BrowserRouter>} />;
const rootElement = document.getElementById("root")!;

if (shouldHydrate(rootElement)) {
  // Pre-rendered public page built with PRERENDER_HYDRATE=true: load the page's chunks first, then reuse
  // its HTML in one pass. If something does not match, React re-renders that part itself; the logged
  // error (also flagged by Lighthouse) helps find the cause.
  void preloadRoutes(readRouteChunkIds()).then(() => {
    ReactDOM.hydrateRoot(rootElement, app, {
      onRecoverableError: (error) => console.error("[P7] pre-rendered page could not be hydrated; rendered again", error),
    });
  });
} else {
  const appContainer = prepareAppContainer(rootElement);
  const startApp = () => ReactDOM.createRoot(appContainer).render(app);
  if (appContainer === rootElement) {
    startApp();
  } else {
    // Pre-rendered public page: let the browser paint it first, then start the app (one frame later).
    requestAnimationFrame(() => setTimeout(startApp, 0));
  }
}
