import { useEffect } from "react";

export default function useKeyboardShortcuts({
  onFocusSearch,
  onClear,
  onPlatformToggle,
  disabled = false,
}) {
  useEffect(() => {
    if (disabled) return;

    const handler = (e) => {
      // Don't intercept when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
        return;
      }

      // Cmd/Ctrl+K → focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      // 1/2/3 → platform toggle (only when not in an input)
      if (onPlatformToggle && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        onPlatformToggle(e.key);
        return;
      }

      // Escape → clear
      if (e.key === "Escape") {
        onClear?.();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [disabled, onFocusSearch, onClear, onPlatformToggle]);
}
