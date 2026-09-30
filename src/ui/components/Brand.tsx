import React from "react";

/**
 * ShipClaw mark: a hull line under a release check — "shipped, verified".
 * Decorative; the wordmark next to it carries the accessible name.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brand-mark">
      <rect width="32" height="32" rx="8" className="brand-mark__bg" />
      <path d="M7 19.5h18l-2.6 5H9.6z" className="brand-mark__hull" />
      <path d="M11 12.2l3.4 3.4L21.5 8.5" className="brand-mark__check" />
    </svg>
  );
}

export function Brand({ onHome }: { onHome?: () => void }) {
  const content = (
    <>
      <BrandMark />
      <span className="brand__name">ShipClaw</span>
    </>
  );
  return onHome ? (
    <button type="button" className="brand brand--button" onClick={onHome} aria-label="ShipClaw — start a new analysis">
      {content}
    </button>
  ) : (
    <span className="brand">{content}</span>
  );
}
