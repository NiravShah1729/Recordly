"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-[var(--bg-secondary)] text-[var(--text-primary)]
            rounded-[var(--radius-sm)] px-4 py-3
            border border-transparent
            placeholder:text-[var(--text-tertiary)]
            focus:bg-[var(--bg-tertiary)] focus:outline-none
            transition-colors duration-200
            ${error ? "border-red-500/50 bg-red-500/5" : ""}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--status-failed)]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full bg-[var(--bg-secondary)] text-[var(--text-primary)]
            rounded-[var(--radius-sm)] px-4 py-3
            border border-transparent
            placeholder:text-[var(--text-tertiary)]
            focus:bg-[var(--bg-tertiary)] focus:outline-none
            transition-colors duration-200 resize-none
            ${error ? "border-red-500/50 bg-red-500/5" : ""}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--status-failed)]">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Input, Textarea };
export default Input;
