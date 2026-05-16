/**
 * HexagonLoadingOverlay — canvas-based hexagonal loading animation.
 *
 * Accessibility (per accessibility-lead review):
 * - Do NOT move focus to the overlay on mount (it's a status, not a modal).
 * - Progress copy cycles through the existing page-level aria-live region
 *   (App.tsx liveRegionRef) via the onAnnounce prop.
 * - On unmount, announce "Analysis complete." and return focus to runButtonRef.
 * - The canvas element is aria-hidden="true" — no accessible representation.
 * - Overlay wrapper: role="presentation" (decorative container).
 *
 * Performance:
 * - RAF capped at 30 FPS via frame-skip.
 * - ≤49 hex cells (7×7 grid).
 * - Single shadowBlur applied once per frame to ctx, not per cell.
 * - prefers-reduced-motion: animation loop stops, static pattern shown.
 */
import React, { useEffect, useRef, useCallback } from "react";

interface HexagonLoadingOverlayProps {
  /** Whether the overlay is visible (driven by isRunning from App) */
  visible: boolean;
  /** Callback to update the page-level aria-live region (App's liveRegionRef) */
  onAnnounce: (msg: string) => void;
  /** Ref to the Run Analysis button — receives focus when overlay hides */
  runButtonRef: React.RefObject<HTMLButtonElement | null>;
}

const PROGRESS_STEPS = [
  "Loading repository evidence…",
  "Scanning repo signals…",
  "Calculating deterministic score…",
  "Building risk fingerprint…",
  "Estimating time-to-ship…",
  "Querying Nemotron…",
  "Preparing readiness report…",
];

const STEP_INTERVAL_MS = 1800;
const TIMEOUT_MS = 90_000;
const HEX_COLS = 7;
const HEX_ROWS = 7;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HexagonLoadingOverlay({
  visible,
  onAnnounce,
  runButtonRef,
}: HexagonLoadingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrameRef = useRef(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);

  // ── Draw hexagon grid on canvas ──────────────────────────────────────────

  const drawHexGrid = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Cap to 30 FPS
    if (ts - lastFrameRef.current < FRAME_INTERVAL) {
      rafRef.current = requestAnimationFrame(drawHexGrid);
      return;
    }
    lastFrameRef.current = ts;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cellW = w / HEX_COLS;
    const cellH = h / HEX_ROWS;
    const r = Math.min(cellW, cellH) * 0.38;

    // Single global shadow pass for performance
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(118,185,0,0.6)";

    for (let row = 0; row < HEX_ROWS; row++) {
      for (let col = 0; col < HEX_COLS; col++) {
        const cx = cellW * col + cellW * 0.5 + (row % 2 === 1 ? cellW * 0.5 : 0);
        const cy = cellH * row + cellH * 0.5;

        // Phase offset creates a wave travelling across the grid
        const phase = ((ts / 800) + (row * 0.7) + (col * 0.5)) % (Math.PI * 2);
        const pulse = (Math.sin(phase) + 1) / 2; // 0..1

        const alpha = 0.06 + pulse * 0.28;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(118,185,0,${(alpha * 0.8).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.fillStyle = `rgba(118,185,0,${(alpha * 0.25).toFixed(3)})`;
        ctx.fill();
        ctx.stroke();
      }
    }

    rafRef.current = requestAnimationFrame(drawHexGrid);
  }, []);

  // ── Draw static pattern (prefers-reduced-motion) ─────────────────────────

  const drawStaticGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cellW = w / HEX_COLS;
    const cellH = h / HEX_ROWS;
    const r = Math.min(cellW, cellH) * 0.38;

    for (let row = 0; row < HEX_ROWS; row++) {
      for (let col = 0; col < HEX_COLS; col++) {
        const cx = cellW * col + cellW * 0.5 + (row % 2 === 1 ? cellW * 0.5 : 0);
        const cy = cellH * row + cellH * 0.5;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(118,185,0,0.2)";
        ctx.lineWidth = 1;
        ctx.fillStyle = "rgba(118,185,0,0.05)";
        ctx.fill();
        ctx.stroke();
      }
    }
  }, []);

  // ── Lifecycle: mount/unmount driven by visible prop ──────────────────────

  useEffect(() => {
    if (!visible) {
      // Overlay hiding — clean up animation and timers
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (!timedOut) {
        onAnnounce("Analysis complete.");
      }

      // Return focus to the Run Analysis button
      if (runButtonRef.current) {
        runButtonRef.current.focus();
      }

      setTimedOut(false);
      setStepIndex(0);
      stepRef.current = 0;
      return;
    }

    // Overlay showing — announce start, begin animation
    onAnnounce("Analysis running. This may take up to 90 seconds.");
    setStepIndex(0);
    stepRef.current = 0;

    // Start canvas animation
    const canvas = canvasRef.current;
    if (canvas) {
      // Size canvas to its displayed size
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width || 420;
      canvas.height = height || 420;
    }

    if (prefersReducedMotion()) {
      drawStaticGrid();
    } else {
      rafRef.current = requestAnimationFrame(drawHexGrid);
    }

    // Cycle progress copy every 1.8s (does NOT move focus)
    stepTimerRef.current = setInterval(() => {
      stepRef.current = (stepRef.current + 1) % PROGRESS_STEPS.length;
      setStepIndex(stepRef.current);
    }, STEP_INTERVAL_MS);

    // 90-second safety timeout
    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
      onAnnounce("Analysis is taking longer than expected. Check the Agent Timeline below.");
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, TIMEOUT_MS);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visible, onAnnounce, runButtonRef, drawHexGrid, drawStaticGrid, timedOut]);

  if (!visible) return null;

  return (
    <div className="hex-overlay" role="presentation">
      {/* Canvas — purely visual, no accessible representation */}
      <canvas
        ref={canvasRef}
        className="hex-overlay__canvas"
        aria-hidden="true"
      />

      {/* Progress copy — visually centered, not announced here (App's liveRegion does that) */}
      <div className="hex-overlay__content" aria-hidden="true">
        {timedOut ? (
          <p className="hex-overlay__status hex-overlay__status--timeout">
            Taking longer than expected — check the Agent Timeline below.
          </p>
        ) : (
          <>
            <div className="hex-overlay__spinner" />
            <p className="hex-overlay__status">{PROGRESS_STEPS[stepIndex]}</p>
            <p className="hex-overlay__sub">
              Running deterministic analysis — do not close this tab.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
