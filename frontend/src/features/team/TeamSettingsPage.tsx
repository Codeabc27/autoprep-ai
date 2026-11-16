import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type { Organization, UserProfile } from "../../types/api";

interface TeamSettingsProps {
  mode: "team" | "settings";
  user: UserProfile | null;
  onUserUpdated: (user: UserProfile) => void;
  onWorkspaceChanged: () => Promise<void>;
  onNotify: (type: "success" | "error", text: string) => void;
}

export function TeamSettingsPage({
  mode,
  user,
  onUserUpdated,
  onWorkspaceChanged,
  onNotify,
}: TeamSettingsProps) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() =>
    localStorage.getItem("active_org_id")
  );
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user?.full_name || "");
  }, [user]);

  useEffect(() => {
    if (mode === "team") {
      api.get<Organization[]>("/orgs").then((r) => setOrgs(r.data)).catch(() => {});
    }
  }, [mode]);

  const handleSelectWorkspace = async (orgId: string | null) => {
    if (orgId) {
      localStorage.setItem("active_org_id", orgId);
    } else {
      localStorage.removeItem("active_org_id");
    }
    setActiveOrgId(orgId);
    await onWorkspaceChanged();
    onNotify("success", orgId ? "Switched to organization workspace." : "Switched to personal workspace.");
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post<Organization>("/orgs", { name: orgName });
      setOrgs((prev) => [...prev, data]);
      setOrgName("");
      onNotify("success", "Organization created.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Failed to create organization."));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOrg = async (orgId: string) => {
    setDeletingId(orgId);
    try {
      await api.delete(`/orgs/${orgId}`);
      setOrgs((prev) => prev.filter((o) => o.id !== orgId));
      setConfirmDeleteId(null);
      if (activeOrgId === orgId) {
        localStorage.removeItem("active_org_id");
        setActiveOrgId(null);
        await onWorkspaceChanged();
      }
      onNotify("success", "Organization deleted.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Failed to delete organization."));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.patch<UserProfile>("/auth/me", { full_name: fullName });
      onUserUpdated(data);
      onNotify("success", "Profile updated.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Failed to update profile."));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "team") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Team & Organizations</h1>
          {activeOrgId && (
            <Button size="sm" variant="secondary" onClick={() => handleSelectWorkspace(null)}>
              Switch to Personal Workspace
            </Button>
          )}
        </div>
        <Card className="space-y-4">
          <form onSubmit={handleCreateOrg} className="flex gap-3">
            <input
              type="text"
              required
              placeholder="Organization name (e.g. Strydo ML)"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            />
            <Button type="submit" loading={busy}>Create Organization</Button>
          </form>
          <div className="divide-y divide-[var(--border-default)] text-sm">
            {orgs.map((o) => {
              const isActive = activeOrgId === o.id;
              const isConfirming = confirmDeleteId === o.id;
              return (
                <div key={o.id} className="py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-[var(--text-primary)]">{o.name}</span>
                      <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">{o.slug}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <Badge variant="emerald">Active Workspace</Badge>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => handleSelectWorkspace(o.id)}>
                          Switch Workspace
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(isConfirming ? null : o.id)}
                        aria-label={`Delete ${o.name}`}
                        className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-[#DC2626] dark:hover:bg-red-950/40 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {isConfirming && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-[#DC2626]">
                        Delete organization <strong>{o.name}</strong> and its workspace projects?
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={deletingId === o.id}
                          onClick={() => handleDeleteOrg(o.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold text-[var(--text-primary)]">Account Settings</h1>
      <Card>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email</label>
            <input
              type="email"
              disabled
              value={user?.email || ""}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-muted)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" loading={busy}>Save Profile</Button>
        </form>
      </Card>
    </div>
  );
}
