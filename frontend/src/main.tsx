import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfirmProvider } from "./components/app/ConfirmDialog";
import "@fontsource-variable/inter";
import "./index.css";
import "@/lib/theme";
import { installChunkErrorRecovery } from "@/lib/chunkReload";

installChunkErrorRecovery();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </HelmetProvider>
  </ErrorBoundary>
);
