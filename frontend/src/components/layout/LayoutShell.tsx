import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Database,
  GitBranch,
  BarChart3,
  FileText,
  Users,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Project, UserProfile } from "../../types/api";

export type NavTab =
  | "dashboard"
  | "projects"
  | "datasets"
  | "quality"
  | "workflows"
  | "reports"
  | "team"
  | "settings";

interface LayoutShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: UserProfile | null;
  activeProject: Project | null;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export function LayoutShell({
  activeTab,
  onSelectTab,
  user,
  activeProject,
  darkMode,
  onToggleTheme,
  onLogout,
  children,
}: LayoutShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroups = [
    {
      label: "MAIN",
      items: [
        { id: "dashboard" as NavTab, label: "Dashboard", icon: LayoutDashboard },
        { id: "projects" as NavTab, label: "Projects", icon: FolderKanban },
        { id: "datasets" as NavTab, label: "Datasets", icon: Database },
        { id: "quality" as NavTab, label: "Data Quality", icon: BarChart3 },
        { id: "workflows" as NavTab, label: "Workflows & Split", icon: GitBranch },
        { id: "reports" as NavTab, label: "Reports & Exports", icon: FileText },
      ],
    },
    {
      label: "MANAGEMENT",
      items: [{ id: "team" as NavTab, label: "Team & Workspace", icon: Users }],
    },
    {
      label: "PREFERENCES",
      items: [{ id: "settings" as NavTab, label: "Settings", icon: Settings }],
    },
  ];

  const renderNav = () => (
    <div className="flex h-full flex-col justify-between p-3">
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#059669] text-white font-bold text-sm">
              A
            </div>
            {!collapsed && <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">AutoPrep AI</span>}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle sidebar"
            className="hidden lg:inline-flex rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && (
              <div className="px-2.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)]">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                    active
                      ? "bg-[var(--primary-subtle)] text-[#059669] border border-[#A7F3D0] dark:border-emerald-800"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border-default)] pt-3 space-y-2">
        {!collapsed && user && (
          <div className="px-2 py-1">
            <div className="text-xs font-medium text-[var(--text-primary)] truncate">{user.full_name || "User"}</div>
            <div className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</div>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 transition"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]">
      <aside
        className={`hidden lg:block shrink-0 border-r border-[var(--border-default)] bg-[var(--bg-surface)] transition-all ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {renderNav()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-64 bg-[var(--bg-surface)] border-r border-[var(--border-default)]">
            <div className="flex justify-end p-2">
              <button onClick={() => setMobileOpen(false)} className="p-1 text-[var(--text-muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNav()}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] truncate">
              <span>Workspace</span>
              <span>/</span>
              <span className="font-medium text-[var(--text-primary)] capitalize">{activeTab}</span>
              {activeProject && (
                <>
                  <span>/</span>
                  <span className="rounded-md bg-[var(--primary-subtle)] px-2 py-0.5 text-[#059669] font-medium truncate">
                    {activeProject.name}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle light or dark theme"
            className="rounded-lg border border-[var(--border-default)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main className="flex-1 mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
