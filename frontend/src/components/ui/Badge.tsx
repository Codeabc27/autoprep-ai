import type { ReactNode } from "react";

interface BadgeProps {
  variant?: "emerald" | "neutral" | "warning" | "error" | "info";
  children: ReactNode;
}

export function Badge({ variant = "neutral", children }: BadgeProps) {
  const styles = {
    emerald: "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0] dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    neutral: "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-default)]",
    warning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
    info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  };

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}
