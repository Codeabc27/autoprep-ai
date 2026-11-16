import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}
