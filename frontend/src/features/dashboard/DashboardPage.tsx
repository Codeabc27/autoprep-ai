import { FolderPlus, Upload, ArrowRight, Activity } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type { DatasetListItem, Project, UserProfile } from "../../types/api";
import type { NavTab } from "../../components/layout/LayoutShell";

interface DashboardPageProps {
  user: UserProfile | null;
  projects: Project[];
  datasets: DatasetListItem[];
  apiHealthy: boolean;
  onSelectProject: (project: Project) => void;
  onNavigate: (tab: NavTab) => void;
}

export function DashboardPage({
  user,
  projects,
  datasets,
  apiHealthy,
  onSelectProject,
  onNavigate,
}: DashboardPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Welcome back{user?.full_name ? `, ${user.full_name}` : ""}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Manage projects, inspect dataset quality, and run leakage-free preprocessing workflows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => onNavigate("projects")}>
            <FolderPlus className="h-4 w-4" /> New Project
          </Button>
          <Button onClick={() => onNavigate("datasets")}>
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-medium text-[var(--text-muted)]">Total Projects</div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">{projects.length}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-[var(--text-muted)]">Active Project Datasets</div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">{datasets.length}</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">Backend Engine</span>
            <Activity className="h-4 w-4 text-[#059669]" />
          </div>
          <div className="mt-2">
            <Badge variant={apiHealthy ? "emerald" : "error"}>{apiHealthy ? "Connected" : "Offline"}</Badge>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent Projects</h2>
          <button onClick={() => onNavigate("projects")} className="text-xs font-medium text-[#059669] hover:underline">
            View all
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No projects yet. Create your first project to upload a dataset.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-default)]">
            {projects.slice(0, 5).map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{p.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{p.description || "No description"}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onSelectProject(p)}>
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
