import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/fraunces";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { ToastProvider } from "./components/ToastContainer.jsx";
import { warmUpBackend } from "./api/backendClient.js";

// Start the Render cold-start boot at page load rather than inside the first
// analyze request (see backendClient.js). Fire-and-forget; no-op without a backend.
warmUpBackend();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
