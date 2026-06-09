import { useEffect, useState } from "react";
import { LuMoon, LuSun } from "react-icons/lu";

// Toggles the app's light/dark mode. The token values are rendered server-side
// from the `mode` cookie (see app/services/mode.server.ts), so we set the cookie
// and reload to pick up the correct theme — the bulletproof, mechanism-matching way.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.cookie = `mode=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-card text-foreground hover:border-muted-foreground transition-[transform,border-color] duration-150 active:scale-[0.96]"
    >
      {dark ? <LuSun size={16} /> : <LuMoon size={16} />}
    </button>
  );
}
