"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = {
  id: number;
  title: string;
  body?: string;
  tone: "info" | "success" | "error";
  href?: { label: string; url: string };
};

const ToastCtx = createContext<{
  push: (t: Omit<Toast, "id">) => void;
}>({ push: () => {} });

export const useToast = () => useContext(ToastCtx);

const TONE: Record<Toast["tone"], string> = {
  info: "var(--brass)",
  success: "var(--olive)",
  error: "var(--ember)",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 7000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: "min(380px, calc(100vw - 36px))",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="panel rise"
            role="status"
            style={{
              padding: "13px 15px",
              borderLeft: `3px solid ${TONE[t.tone]}`,
              boxShadow: "0 20px 50px -18px rgba(0,0,0,.7)",
            }}
          >
            <div style={{ fontWeight: 650, fontSize: 14 }}>{t.title}</div>
            {t.body && (
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                {t.body}
              </div>
            )}
            {t.href && (
              <a
                href={t.href.url}
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{ color: TONE[t.tone], fontSize: 11.5, marginTop: 7, display: "inline-block" }}
              >
                {t.href.label} ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
