import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CloseIcon } from "./Icons";

const ToastContext = createContext(null);

let globalAddToast = null;
let _toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info") => {
    _toastId += 1;
    const id = _toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    globalAddToast = addToast;
    return () => { globalAddToast = null; };
  }, [addToast]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const color = t.type === "error" ? "var(--error)" : t.type === "success" ? "var(--success)" : "var(--primary-bright)";
          const bg = t.type === "error" ? "var(--error-container)" : t.type === "success" ? "var(--success-container)" : "rgba(99, 102, 241, 0.06)";
          const border = t.type === "error" ? "rgba(248, 113, 113, 0.15)" : t.type === "success" ? "rgba(52, 211, 153, 0.15)" : "rgba(99, 102, 241, 0.15)";
          return (
            <div
              key={t.id}
              role="status"
              style={{
                background: `linear-gradient(135deg, ${bg}, transparent)`,
                border: `1px solid ${border}`,
                borderRadius: "var(--radius-lg)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--on-surface)",
                maxWidth: 320,
                backdropFilter: "blur(10px)",
                animation: "slideUp 0.3s ease forwards",
                pointerEvents: "auto",
              }}
            >
              <span style={{ color, fontWeight: 600 }}>{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
                aria-label="Dismiss notification"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function showToast(message, type = "info") {
  if (globalAddToast) {
    globalAddToast(message, type);
  }
}

export function useToast() {
  const addToast = useContext(ToastContext);
  if (!addToast) throw new Error("useToast must be used inside ToastProvider");
  return addToast;
}
