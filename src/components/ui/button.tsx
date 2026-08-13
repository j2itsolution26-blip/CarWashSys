import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Sizes are chosen for a counter touchscreen: `md` is 44px tall (the smallest
 * reliable touch target), `lg` 52px, `xl` 60px for primary POS actions. Nothing
 * interactive in this app is smaller than `sm` (36px).
 */

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)] shadow-sm",
  secondary:
    "bg-[var(--surface-muted)] text-[var(--text-strong)] hover:bg-[var(--surface-inset)] border border-[var(--line)]",
  outline:
    "bg-transparent text-[var(--text-strong)] border border-[var(--line-strong)] hover:bg-[var(--surface-muted)]",
  ghost: "bg-transparent text-[var(--text-body)] hover:bg-[var(--surface-muted)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90 shadow-sm",
  success: "bg-[var(--positive)] text-white hover:opacity-90 shadow-sm",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm gap-1.5",
  md: "min-h-11 px-4 text-sm gap-2",
  lg: "min-h-13 px-5 text-base gap-2",
  xl: "min-h-15 px-6 text-lg gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // `aria-busy` tells a screen reader the action is in flight; the visual
      // spinner alone would be silent.
      aria-busy={isLoading || undefined}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold transition-colors duration-100",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "touch-manipulation select-none",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
}
