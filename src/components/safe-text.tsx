"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isCrude, loadSafeMode, saveSafeMode } from "@/lib/safe";

const SafeCtx = createContext<{ safeMode: boolean; toggle: () => void }>({
  safeMode: true,
  toggle: () => {},
});

export const useSafeMode = () => useContext(SafeCtx);

export function SafeModeProvider({ children }: { children: React.ReactNode }) {
  // Starts on so the first server-rendered paint is the cautious one.
  const [safeMode, setSafeMode] = useState(true);

  useEffect(() => setSafeMode(loadSafeMode()), []);

  const toggle = useCallback(() => {
    setSafeMode((v) => {
      saveSafeMode(!v);
      return !v;
    });
  }, []);

  const value = useMemo(() => ({ safeMode, toggle }), [safeMode, toggle]);
  return <SafeCtx.Provider value={value}>{children}</SafeCtx.Provider>;
}

/**
 * Renders on-chain text, blurring it behind a reveal when safe mode is on and
 * the string trips the filter. The raw value is always one click away — this
 * hides nothing, it only stops it landing unannounced on a shared link.
 */
export function SafeText({
  value,
  className,
  style,
}: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { safeMode } = useSafeMode();
  const [revealed, setRevealed] = useState(false);
  const flagged = safeMode && !revealed && isCrude(value);

  if (!flagged) {
    return (
      <span className={className} style={style} title={value}>
        {value}
      </span>
    );
  }

  return (
    <span className={`masked ${className ?? ""}`} style={style}>
      <span className="masked-text">{value}</span>
      <button
        type="button"
        className="masked-reveal"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }}
      >
        show
      </button>
    </span>
  );
}

/** Nav switch for the whole filter. */
export function SafeModeToggle() {
  const { safeMode, toggle } = useSafeMode();
  return (
    <button
      className="chip"
      data-on={safeMode}
      onClick={toggle}
      title={
        safeMode
          ? "Safe mode on. Explicit on-chain token names are blurred until you reveal them"
          : "Safe mode off. Token names render exactly as they are on-chain"
      }
    >
      {safeMode ? "Safe mode" : "Raw names"}
    </button>
  );
}
