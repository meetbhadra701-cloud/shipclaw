# ShipClaw — UI Redesign Plan (Command Center Polish)

> Phase: Complete  
> Date: 2026-05-16  
> Owner: Claude (Senior Frontend Designer + Browser QA)  
> QA report: [UI_REDESIGN_QA.md](./UI_REDESIGN_QA.md)

---

## Goal

Convert the existing dark dashboard from "AI slop" into a polished "Autonomous Release Command Center":

1. Remove all 22 emoji from UI panel headings and badges
2. Add a decorative glass-hero SVG background
3. Add a hexagon loading overlay during analysis
4. Add a light/dark theme toggle (accessible, persisted)
5. Polish panel internals (table density, semantic status classes)
6. Full browser QA across 3 viewports and both themes

**No agent logic, scoring, memory, Nemotron, Exa, or API surface changes.**

---

## Files Changed

| File | Change |
|---|---|
| `src/ui/App.tsx` | Removed 22 emoji, added skip link, wired ThemeToggle + GlassHeroBackground + HexagonLoadingOverlay, consolidated inline styles to utility classes |
| `src/ui/styles.css` | Added `[data-theme="light"]` palette, hex-overlay styles, theme-toggle styles, focus-visible rules, category-table polish, semantic status classes |
| `src/ui/components/GlassHeroBackground.tsx` | New — 5 SVG polygon panes, `aria-hidden`, `pointer-events: none`, slow drift animation, prefers-reduced-motion safe |
| `src/ui/components/HexagonLoadingOverlay.tsx` | New — canvas 7×7 hex grid, 30fps, cycling copy, 90s timeout, focus return on unmount, prefers-reduced-motion static fallback |
| `src/ui/components/ThemeToggle.tsx` | New — `aria-pressed` button, dynamic `aria-label`, localStorage persist, system-preference initial value, sun/moon SVG icons |
| `src/ui/index.html` | Added anti-FOUC inline script, `<meta name="color-scheme">` |

---

## Key Design Decisions

### Emoji removal
All 22 emoji glyphs removed from UI panel headings, banners, and badges. Unicode text checkmarks (`✓`/`✗`) retained in agent timeline (informational text characters). SC SVG monogram replaces the ship emoji hero logo.

### Glass hero
Lightweight SVG/CSS — no three.js, no GSAP. Five overlapping translucent `<polygon>` elements with iridescent edge gradients at `opacity: 0.18` (dark) / `0.10` (light). `position: fixed; pointer-events: none; z-index: -1`. Slow drift animation paused under `prefers-reduced-motion`.

### Hexagon overlay
Canvas-based RAF animation. 7×7 hex grid, each cell pulses with phase offset. Triggered by `isRunning === true`. Fades out when results arrive. 90-second hard timeout with user-visible fallback message. Focus returns to Run button on dismount.

### Theme toggle
`data-theme` attribute on `<html>`. Pre-paint script in `index.html` reads localStorage before React mounts (prevents FOUC). Full `[data-theme="light"]` CSS variable block mirrors every dark-mode variable with WCAG AA-verified values.

### Color system
- Dark: `--accent: #76b900` (NVIDIA green), `--color-focus: #3b82f6`
- Light: `--accent: #2d8a00` (deeper green, ≥4.5:1 on `#f7f8fa`), `--color-focus: #1d4ed8` (7:1)
- Semantic classes: `.status-pass`, `.status-fail`, `.status-warning`, `.status-skipped`, `.status-fallback-note`

---

## Commits

| Commit | Description |
|---|---|
| `39aa7b1` | ui: remove unprofessional emoji-heavy visual language |
| `576ec46` | ui: add glass hero + hex overlay + light-dark theme toggle |
| `c2787b2` | ui: polish panels — table density, semantic status classes, focus ring |
| `f343c5c` | qa: verify redesigned ui flow |

---

## Verification Summary

All static gates green after redesign:
- `npm run typecheck` — 0 errors (287 modules)
- `npm test` — 34/34
- `npm run smoke` — 20/20, HOLD 55/100
- `npm run build` — 28.46 kB CSS, 336.81 kB JS

Browser QA (Chrome MCP):
- 3 viewports: 1920×1080, 1366×768, 414×896 — all panels render correctly
- Both themes: dark + light — WCAG AA contrast verified
- Skip link, theme toggle, hex overlay, glass background — all verified
- No console errors at idle or during a run

See [UI_REDESIGN_QA.md](./UI_REDESIGN_QA.md) for full evidence.
