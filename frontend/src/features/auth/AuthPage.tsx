import { useState } from "react";
import { Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/ui/Button";
import type { TokenPair } from "../../types/api";

interface AuthPageProps {
  onAuthenticated: () => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register" | "reset" | "reset_confirm">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "reset") {
        const { data } = await api.post<{ message: string; dev_reset_token?: string }>(
          "/auth/password-reset/request",
          { email }
        );
        if (data.dev_reset_token) {
          setResetToken(data.dev_reset_token);
        }
        setInfo(data.message);
        setMode("reset_confirm");
        return;
      }
      if (mode === "reset_confirm") {
        const { data } = await api.post<{ message: string }>("/auth/password-reset/confirm", {
          token: resetToken,
          new_password: password,
        });
        setInfo(data.message);
        setPassword("");
        setResetToken("");
        setMode("login");
        return;
      }
      if (mode === "register") {
        await api.post("/auth/register", { email, password, full_name: fullName });
      }
      const { data } = await api.post<TokenPair>("/auth/login", { email, password });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      onAuthenticated();
    } catch (err) {
      setError(getApiErrorMessage(err, "Authentication failed. Please verify your details."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen grid lg:grid-cols-2 bg-slate-950 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/55 to-emerald-950/75" />

      <div className="relative z-10 hidden lg:flex flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#059669] text-white font-bold shadow-md">
            A
          </div>
          <span className="text-lg font-bold tracking-tight text-white">AutoPrep AI</span>
        </div>

        <div className="max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200 backdrop-blur-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Split-Before-Fit Leakage Protection
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            From raw CSV to reproducible, ML-ready splits in minutes.
          </h1>
          <p className="text-sm leading-relaxed text-slate-200/90">
            Upload datasets, inspect missingness and outliers, review Gemini-recommended preprocessing steps, and export fitted scikit-learn pipelines without risking train/test leakage.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
            <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur-md">
              <div className="font-semibold text-white">1. Profile</div>
              <div className="text-slate-200/80 mt-1">Stats, nulls & duplicates</div>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur-md">
              <div className="font-semibold text-white">2. Clean & Split</div>
              <div className="text-slate-200/80 mt-1">Fit on train split only</div>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur-md">
              <div className="font-semibold text-white">3. Export</div>
              <div className="text-slate-200/80 mt-1">Splits, joblib & ZIP</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-300/80">AutoPrep AI · Multi-Tenant SaaS Workspace</div>
      </div>

      <div className="relative z-10 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/95 dark:bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {mode === "login"
              ? "Sign in to your workspace"
              : mode === "register"
              ? "Create your account"
              : mode === "reset"
              ? "Reset password"
              : "Confirm password reset"}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {mode === "login"
              ? "Enter your credentials to continue."
              : mode === "register"
              ? "Start preparing ML datasets securely."
              : mode === "reset"
              ? "Enter your email to request a reset token."
              : "Enter your reset token and choose a new password."}
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          {info && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
                />
              </div>
            )}

            {mode !== "reset_confirm" && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
                />
              </div>
            )}

            {mode === "reset_confirm" && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Reset Token</label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
                />
              </div>
            )}

            {mode !== "reset" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    {mode === "reset_confirm" ? "New Password" : "Password"}
                  </label>
                  {mode === "login" && (
                    <button type="button" onClick={() => setMode("reset")} className="text-xs text-[#059669] hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 pr-9 text-sm text-[var(--text-primary)] focus:border-[#059669] focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label="Toggle password visibility"
                    className="absolute right-2.5 top-2.5 text-[var(--text-muted)]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              {mode === "login"
                ? "Sign In"
                : mode === "register"
                ? "Create Account"
                : mode === "reset"
                ? "Request Reset"
                : "Update Password"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-5 text-center text-xs text-[var(--text-muted)]">
            {mode === "login" ? (
              <button type="button" onClick={() => setMode("register")} className="text-[#059669] font-medium hover:underline">
                Need an account? Register
              </button>
            ) : (
              <button type="button" onClick={() => setMode("login")} className="text-[#059669] font-medium hover:underline">
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
