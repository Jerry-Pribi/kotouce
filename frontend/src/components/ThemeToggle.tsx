import { useTheme } from "../theme";

/** Přepínač světlého a tmavého režimu (celá aplikace). */
export function ThemeToggle({ className = "theme-toggle" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim";
  return (
    <button type="button" className={className} onClick={toggle} title={label} aria-label={label}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
