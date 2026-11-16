import { useState } from "react";
import { FolderPlus, Search, FolderOpen, Trash2 } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type { Project } from "../../types/api";

interface ProjectsPageProps {
  projects: Project[];
  activeProjectId?: string | null;
  onRefresh: () => Promise<void>;
  onSelectProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
  onNotify: (type: "success" | "error", text: string) => void;
}

export function ProjectsPage({
  projects,
  activeProjectId,
  onRefresh,
  onSelectProject,
  onDeleteProject,
  onNotify,
}: ProjectsPageProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.post("/projects", { name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      await onRefresh();
      onNotify("success", "Project created.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Failed to create project."));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      await onDeleteProject(projectId);
      setConfirmDeleteId(null);
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Failed to delete project."));
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Projects</h1>
          <p className="text-xs text-[var(--text-muted)]">Organize datasets, profiles, and reproducible ML pipelines.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#059669] focus:outline-none"
          />
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <FolderPlus className="h-4 w-4 text-[#059669]" /> Create New Project
        </h2>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            required
            placeholder="Project name (e.g. Telco Churn)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#059669] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#059669] focus:outline-none"
          />
          <Button type="submit" loading={loading}>
            Create Project
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const isActive = activeProjectId === p.id;
          const isConfirming = confirmDeleteId === p.id;
          return (
            <Card
              key={p.id}
              className={`flex flex-col justify-between transition ${
                isActive ? "border-[#059669]" : "hover:border-[#059669]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--text-primary)] min-w-0">
                    <FolderOpen className="h-4 w-4 text-[#059669] shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive && <Badge variant="emerald">Active</Badge>}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(isConfirming ? null : p.id)}
                      aria-label={`Delete ${p.name}`}
                      className="rounded-md p-1 text-[var(--text-muted)] hover:bg-red-50 hover:text-[#DC2626] dark:hover:bg-red-950/40 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)] line-clamp-2">
                  {p.description || "No description provided."}
                </p>
              </div>

              {isConfirming ? (
                <div className="mt-4 pt-3 border-t border-red-200 dark:border-red-900 flex items-center justify-between gap-2">
                  <span className="text-xs text-[#DC2626]">Delete project?</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deletingId === p.id}
                      onClick={() => handleConfirmDelete(p.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => onSelectProject(p)}>
                    Open Workspace
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
