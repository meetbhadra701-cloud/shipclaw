/**
 * ThemeToggle — accessible light/dark mode toggle button.
 *
 * Accessibility (per accessibility-lead review):
 * - Dynamic aria-label reflects the action to be performed (not current state):
 *     isDark=true  → "Switch to light mode"
 *     isDark=false → "Switch to dark mode"
 * - aria-pressed reflects current state (isDark for dark mode).
 * - SVG icons are aria-hidden="true" — label is on the button.
 * - Keyboard accessible: receives focus, activates on Enter/Space.
 *
 * Persistence:
 * - Reads/writes localStorage key "shipclaw-theme".
 * - Falls back to system prefers-color-scheme.
 * - index.html inline script applies data-theme before React mounts (no FOUC).
 *
 * CSS:
 * - Toggles document.documentElement.dataset.theme between "dark" | "light".
 * - Styles in styles.css under [data-theme="light"] and .theme-toggle.
 */
import React, { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "shipclaw-theme";

function getInitialTheme(): "dark" | "light" {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    // localStorage unavailable (private mode, etc.)
  }
  return "dark";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const isDark = theme === "dark";

  // Sync with any external changes (e.g., system preference change)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <button
      type="button"
      className={`theme-toggle${isDark ? " theme-toggle--dark" : " theme-toggle--light"}`}
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__indicator">
          {isDark ? (
            // Moon icon — dark mode indicator
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            // Sun icon — light mode indicator
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
