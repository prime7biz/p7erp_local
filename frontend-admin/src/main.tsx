import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { ToastProvider } from "./context/ToastContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AdminAuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
