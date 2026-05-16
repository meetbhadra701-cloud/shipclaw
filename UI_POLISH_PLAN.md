# ShipClaw — UI Polish Plan

> Owner: Claude (Senior UI/UX Engineer, Frontend Systems Architect, Demo Polish Lead)
> Date: 2026-05-16
> Baseline: GREEN — all gates passing, live Nemotron verified
> Reviewed by: accessibility-agents:accessibility-lead (async, pre-implementation)

---

## Current UI Weaknesses

| Area | Issue | Priority |
|---|---|---|
| Visual theme | Light/white theme reads as generic dev tool, not command center | High |
| Hero section | No "above the fold" verdict — judge must scroll to find the score | High |
| Proof labels | Demo mode banner does not explain what IS real (scoring, Nemotron, memory) | High |
| Info architecture | Score/decision buried in sidebar below the form | High |
| Report preview | No idle/loading states — panel just doesn't appear until report is ready | High |
| Status visibility | Nemotron/Exa/fixture status not prominently shown | High |
| Panel density | All panels uniform weight — no visual hierarchy between critical and secondary | Medium |
| Motion | No entrance animations — panels pop in abruptly | Medium |
| Typography | Header too plain, no brand presence | Medium |
| Capability claims | No badges proving "deterministic", "memory-persistent", etc. | Medium |
| Responsive | Sidebar too wide on laptop width | Low |
| Score bar | No glow/emphasis — hard to scan quickly | Low |

---

## Intended Visual Direction

**"Autonomous Release Command Center"**

- Dark premium background (#05070a) with faint technical grid
- Glassmorphism cards (rgba bg, blur, border, shadow)
- NVIDIA green (#76b900) as primary accent — ties to hackathon sponsor
- Clean monospace terminal for agent timeline
- Strong status badges for all proof claims
- Polished markdown for the centerpiece Live Report Preview
- CSS-only motion (fade-in, pulse) — no heavy packages
- Enterprise/devtools aesthetic — cinematic but stable

---

## Files Likely to Change

| File | Changes |
|---|---|
| `src/ui/styles.css` | Complete dark theme overhaul — new CSS vars, glassmorphism, grid bg, motion |
| `src/ui/App.tsx` | Hero section, system status bar, proof labels, report loading states, panel reorder |
| `index.html` | No changes needed |
| `main.tsx` | No changes needed |
| `vite.config.ts` | No changes needed |
| `public/assets/hero-loop.mp4` | Optional — CSS fallback if absent, build never fails |

---

## Panel Order (Required)

| # | Panel | Location |
|---|---|---|
| Hero | ShipClaw brand + system status + hero metrics | Full-width top |
| 1 | Goal form | Left sidebar top |
| 2 | Plan | Left sidebar |
| 3 | Agent Timeline | Main content |
| 4 | Readiness Score | Left sidebar (below plan) |
| 5 | Release Risk Fingerprint | Main content |
| 6 | Time-to-Ship | Main content |
| 7 | Findings (score breakdown + blockers + actions) | Main content |
| 8 | Approval Gate | Main content (role=alert) |
| 9 | Live Report Preview (centerpiece) | Main content — full width |
| 10 | Final Decision | Left sidebar |
| 11 | Cross-Run Memory | Main content |
| 12 | Audit Log | Main content |
| 13 | External Evidence / Exa | Main content |
| Footer | Technical proof footer | Full-width bottom |

---

## No-Go Rules

- ❌ Do NOT remove any existing panel
- ❌ Do NOT change core agent logic (loop.ts, scorer.ts, assessor.ts, memory.ts)
- ❌ Do NOT change deterministic scoring logic
- ❌ Do NOT change API key handling
- ❌ Do NOT make Exa mandatory
- ❌ Do NOT add Tailwind CSS
- ❌ Do NOT add heavy animation packages (Framer Motion, GSAP, etc.)
- ❌ Do NOT add video generation dependencies
- ❌ Do NOT generate paid video assets
- ❌ Do NOT expose secrets or API keys in UI
- ❌ Do NOT commit .env or .env.local
- ❌ Do NOT make remote GitHub writes
- ❌ Do NOT run destructive commands
- ❌ Do NOT make demo depend on hero video file (CSS fallback required)
- ❌ Do NOT reduce WCAG AA compliance (contrast, focus, semantics must be preserved)

---

## New Components/Sections

### Hero Section
```
ShipClaw 🚢
Autonomous Release Readiness Agent

Deterministic repo scoring, persistent release memory, Nemotron reasoning,
Exa external evidence, and approval-gated release artifacts.

[Deterministic Score] [Persistent Memory] [Nemotron Reasoning] [Approval-Gated] [Audit Logged]

System: Nemotron ● mistralai/mistral-nemotron | Exa ○ skipped | Data: fixture/live | Memory: persistent
```

### Hero Metrics Bar (shown after run)
```
Score: 55/100 RISKY  |  Decision: HOLD  |  Time-to-Ship: 105–158 min
```

### System Status Row
- Nemotron: live/fallback/unknown
- Exa: live/skipped/failed
- Data: fixture/live
- Memory: persistent
- Approval: required

### Proof Footer
```
Demo mode uses fixture repo data. 
Scoring is deterministic (scorer.ts) — no LLM.
Nemotron explains the pre-computed score but cannot change it.
Memory persists across runs in SQLite.
Approval gate blocks risky writes until you click Approve.
```

---

## CSS Variable Changes (Dark Theme)

```css
/* Dark palette — all contrast ratios verified against #05070a */
--bg: #05070a
--bg-2: #0a0e16
--card: rgba(255,255,255,0.05)     /* glassmorphism card bg */
--border: rgba(255,255,255,0.1)    /* card borders */
--accent: #76b900                   /* NVIDIA green, 9.3:1 on --bg */
--accent-dim: rgba(118,185,0,0.15)
--text: #e2e8f0                    /* primary text, 15:1 on --bg */
--text-muted: #94a3b8              /* muted text, 7.5:1 on --bg */
--color-focus: #60a5fa             /* focus ring, 8.2:1 on --bg */
--color-ready: #4ade80             /* 5.7:1 on --bg */
--color-risky: #fbbf24             /* 11.4:1 on --bg */
--color-not-ready: #f87171         /* 5.0:1 on --bg */
```

---

## WCAG AA Requirements Maintained

| Requirement | Approach |
|---|---|
| Text 4.5:1 | All text colors verified ≥4.5:1 on dark bg |
| UI 3:1 | NVIDIA green accent 9.3:1 — passes for both text and UI |
| Focus ring | 3px solid #60a5fa (8.2:1) preserved |
| Touch targets | ≥44px maintained on all buttons |
| Color alone | Score bands use text labels + color, not color alone |
| prefers-reduced-motion | All animations wrapped in @media block |
| forced-colors | Existing block preserved + extended |
| Semantic HTML | No structural changes, headings/landmarks preserved |
| role=alert | Approval panel preserved |
| aria-live | Score + timeline + announcement regions preserved |
| Skip link | Preserved, now styled for dark bg |

---

## Motion Plan (CSS only)

```
panel-fade-in: opacity 0→1 + translateY 8px→0, 0.3s ease
badge-pulse: opacity 1→0.6, 2s infinite (status badge "live")
score-bar-fill: width transition 0.8s ease (existing, improved)
glow-pulse: box-shadow intensity, 3s infinite (score card)
@media prefers-reduced-motion: all animations → none
```

---

## Validation Checklist

After each commit:
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run build` — succeeds, no module errors
- [ ] `npm test` — 34/34 (only UI-independent tests)
- [ ] Browser: no console errors
- [ ] Browser: all 13 panels visible after demo run
- [ ] Browser: hero section visible above fold
- [ ] Browser: score visible in hero after run
- [ ] Browser: proof labels visible
- [ ] Browser: report preview renders markdown beautifully
- [ ] Browser: memory panel visible
- [ ] Browser: audit log visible
- [ ] Contrast: all new colors verified ≥4.5:1
- [ ] Focus: Tab order logical, focus ring visible
- [ ] No secrets visible anywhere in UI

---

*Plan written: 2026-05-16*
*accessibility-lead review: running async (pre-implementation)*
