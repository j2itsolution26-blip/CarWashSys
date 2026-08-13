"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives.
 *
 * Every control here is label-associated by construction — you cannot render
 * one without a label — and errors are wired with `aria-describedby` +
 * `aria-invalid` so assistive technology announces them.
 */

const CONTROL_BASE =
  "w-full rounded-lg border bg-[var(--surface-card)] px-3 text-[var(--text-strong)] " +
  "placeholder:text-[var(--text-muted)] transition-colors " +
  "disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:opacity-70";

function controlClasses(hasError: boolean, extra?: string): string {
  return cn(
    CONTROL_BASE,
    hasError ? "border-[var(--danger)]" : "border-[var(--line-strong)]",
    extra,
  );
}

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className">,
    FieldWrapperProps {
  /** Renders a fixed prefix inside the control, e.g. "₱". */
  prefix?: string;
  inputSize?: "md" | "lg";
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  prefix,
  inputSize = "md",
  id,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={fieldId} className="block text-sm font-medium text-strong">
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--danger)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        {prefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={controlClasses(
            Boolean(error),
            cn(inputSize === "lg" ? "h-13 text-lg" : "h-11 text-sm", prefix && "pl-7"),
          )}
          {...props}
        />
      </div>

      {hint && !error ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">,
    FieldWrapperProps {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  options,
  placeholder,
  id,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={fieldId} className="block text-sm font-medium text-strong">
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--danger)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <select
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={controlClasses(Boolean(error), "h-11 text-sm")}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">,
    FieldWrapperProps {}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  id,
  ...props
}: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={fieldId} className="block text-sm font-medium text-strong">
        {label}
      </label>
      <textarea
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        rows={3}
        className={controlClasses(Boolean(error), "py-2 text-sm")}
        {...props}
      />
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
