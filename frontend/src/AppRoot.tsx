import type { ReactNode } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfirmProvider } from "./components/app/ConfirmDialog";

type AppRootProps = {
  /** BrowserRouter in the browser (src/main.tsx), StaticRouter in the build-time pre-render (src/prerender/entryServer.tsx). */
  renderRouter: (children: ReactNode) => ReactNode;
  /** Only the pre-render passes a context, to read the head tags afterwards. */
  helmetContext?: object;
};

/**
 * The whole app tree. The browser and the pre-render must use this same component so that hydrated
 * pre-rendered HTML matches what React renders (scripts/inject-static-route-html.ts, PRERENDER_HYDRATE).
 */
export function AppRoot({ renderRouter, helmetContext }: AppRootProps) {
  return (
    <ErrorBoundary>
      <HelmetProvider context={helmetContext}>
        {renderRouter(
          <>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
            <Toaster position="top-right" richColors closeButton />
          </>,
        )}
      </HelmetProvider>
    </ErrorBoundary>
  );
}
