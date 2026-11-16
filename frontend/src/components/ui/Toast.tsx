import { CheckCircle2, AlertCircle, X } from "lucide-react";

export interface ToastMessage {
  id: number;
  type: "success" | "error";
  text: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs font-medium shadow-md bg-[var(--bg-surface)] ${
            t.type === "success" ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-red-300 text-red-700 dark:text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {t.type === "success" ? <CheckCircle2 className="h-4 w-4 text-[#059669] shrink-0" /> : <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0" />}
            <span>{t.text}</span>
          </div>
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
