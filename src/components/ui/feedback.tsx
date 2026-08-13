"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Inline feedback primitives: alerts, empty states, and a lightweight toast
 * system.
 *
 * Status is never conveyed by colour alone — every variant pairs its colour
 * with a text prefix ("Error", "Saved") and an icon glyph.
 */

type Tone = "info" | "success" | "error" | "warning";

const TONE_STYLES: Record<Tone, { box: string; icon: string; prefix: string }> = {
  info: {
    box: "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--text-body)]",
    icon: "ℹ",
    prefix: "Note",
  },
  success: {
    box: "border-[var(--positive)] bg-[var(--positive-soft)] text-[var(--text-strong)]",
    icon: "✓",
    prefix: "Saved",
  },
  error: {
    box: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--text-strong)]",
    icon: "!",
    prefix: "Error",
  },
  warning: {
    box: "border-[var(--warning)] bg-[var(--surface-muted)] text-[var(--text-strong)]",
    icon: "!",
    prefix: "Warning",
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = TONE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", style.box, className)}
    >
      <span aria-hidden="true" className="mt-0.5 font-bold">
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title ?? style.prefix}</p>
        {children ? <div className="mt-0.5 text-sm">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-3xl opacity-70">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-base font-semibold text-strong">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastContextValue {
  push: (tone: Tone, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Tone, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        aria-live="polite" so a success or failure is announced without stealing
        focus from the cashier's next action.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg",
              TONE_STYLES[toast.tone].box,
            )}
          >
            <span aria-hidden="true" className="mr-2 font-bold">
              {TONE_STYLES[toast.tone].icon}
            </span>
            <span className="font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}
