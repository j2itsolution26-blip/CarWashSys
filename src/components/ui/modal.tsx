"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Anything that can take focus when the dialog opens. */
const FOCUS_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Focus-trap cycle members — the same set, minus anything disabled. */
const TAB_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal.
 *
 * Handles the four things a hand-rolled dialog usually gets wrong: Escape to
 * close, focus moved into the dialog on open and restored on close, focus
 * trapped while open, and background scroll locked.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  /**
   * `onClose` is almost always an inline arrow (`() => setDialog(null)`), so it
   * is a NEW function identity on every parent render. Holding it in a ref lets
   * the setup effect below depend only on `open` — see the comment there for why
   * that matters.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /**
   * Runs ONCE per open, deliberately. `onClose` is not in the dependency array:
   * if it were, every keystroke in a field whose state lives in the parent would
   * re-run this effect, which would steal focus back to the top of the dialog
   * mid-typing and corrupt the saved scroll/focus state.
   */
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the first control in the BODY, not the panel — the panel's first
    // focusable element is the close button in the header, and opening a dialog
    // with "dismiss" preselected is both surprising and a keyboard-user trap.
    const firstInBody = bodyRef.current?.querySelector<HTMLElement>(FOCUS_SELECTOR);
    (firstInBody ?? panelRef.current?.querySelector<HTMLElement>(FOCUS_SELECTOR))?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      // Read the panel fresh on each keypress rather than closing over it: the
      // tab cycle changes as footer buttons enable and disable while typing.
      const panel = panelRef.current;
      if (event.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(TAB_SELECTOR));
      if (items.length === 0) return;

      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--surface-card)] shadow-2xl sm:rounded-2xl",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
          >
            <span aria-hidden="true" className="text-lg">
              ✕
            </span>
          </button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
