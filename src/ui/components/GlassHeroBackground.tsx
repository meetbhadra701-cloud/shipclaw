/**
 * GlassHeroBackground — decorative SVG/CSS glass pane background.
 *
 * Accessibility: aria-hidden="true", pointer-events: none, z-index: -1.
 * No focusable children. Pure decoration — does not affect tab order.
 * Prefers-reduced-motion: animation paused via CSS.
 * Fallback: radial-gradient shown in browsers without backdrop-filter.
 *
 * Inspired by glass-hero visual language (iridescent panes, subtle depth).
 * Original implementation — no proprietary code copied.
 */
import React from "react";

export function GlassHeroBackground() {
  return (
    <div
      className="glass-hero-bg"
      aria-hidden="true"
      // pointer-events: none is set via CSS — confirmed no focusable children
    >
      <svg
        className="glass-hero-svg"
        viewBox="0 0 1200 500"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          {/* Iridescent edge gradient — green to violet, ties to brand */}
          <linearGradient id="iri-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#76b900" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="iri-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.30" />
            <stop offset="60%" stopColor="#76b900" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="iri-3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.20" />
            <stop offset="50%" stopColor="#76b900" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="iri-4" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#76b900" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="iri-5" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#76b900" stopOpacity="0.20" />
          </linearGradient>

          {/* Glass fill — very translucent */}
          <linearGradient id="fill-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(118,185,0,0.03)" />
          </linearGradient>
          <linearGradient id="fill-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(167,139,250,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
          <linearGradient id="fill-3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>

        {/* Pane 1 — large upper-right polygon */}
        <polygon
          className="glass-pane glass-pane--1"
          points="650,0 1200,0 1200,320 900,420 700,200"
          fill="url(#fill-1)"
          stroke="url(#iri-1)"
          strokeWidth="1"
        />

        {/* Pane 2 — mid lower-left */}
        <polygon
          className="glass-pane glass-pane--2"
          points="0,150 380,80 500,300 200,480 0,380"
          fill="url(#fill-2)"
          stroke="url(#iri-2)"
          strokeWidth="1"
        />

        {/* Pane 3 — center diamond */}
        <polygon
          className="glass-pane glass-pane--3"
          points="480,60 780,120 820,350 500,440 320,280"
          fill="url(#fill-3)"
          stroke="url(#iri-3)"
          strokeWidth="0.8"
        />

        {/* Pane 4 — small accent top-left */}
        <polygon
          className="glass-pane glass-pane--4"
          points="0,0 260,0 180,160 0,100"
          fill="url(#fill-1)"
          stroke="url(#iri-4)"
          strokeWidth="0.7"
        />

        {/* Pane 5 — small accent bottom-right */}
        <polygon
          className="glass-pane glass-pane--5"
          points="1000,280 1200,220 1200,500 950,500"
          fill="url(#fill-2)"
          stroke="url(#iri-5)"
          strokeWidth="0.7"
        />
      </svg>
    </div>
  );
}
