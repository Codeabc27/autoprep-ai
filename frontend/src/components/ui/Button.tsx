import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-[#059669]/40 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] text-white",
    secondary:
      "bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)]",
    danger: "bg-[#DC2626] hover:bg-[#B91C1C] text-white",
    ghost: "hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-sm",
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
