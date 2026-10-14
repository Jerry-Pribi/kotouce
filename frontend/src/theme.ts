import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// Volba se pamatuje v prohlížeči; bez volby platí nastavení systému (skript v index.html ji nastaví před vykreslením)
const THEME_KEY = "kotouc_theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function hasStoredTheme(): boolean {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark";
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent<Theme>("theme:change", { detail: theme }));
}

/** Aktuální režim (světlý / tmavý) a přepínač — platí pro celou aplikaci. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // Bez ruční volby sledujeme změnu v systému
    const onSystem = (e: MediaQueryListEvent) => {
      if (!hasStoredTheme()) applyTheme(e.matches ? "dark" : "light");
    };
    window.addEventListener("theme:change", onChange);
    media.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener("theme:change", onChange);
      media.removeEventListener("change", onSystem);
    };
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // bez úložiště platí volba jen do obnovení stránky
    }
    applyTheme(next);
  };

  return { theme, toggle };
}
