import { useEffect, useState } from "react";
import { api, getApiErrorMessage } from "./api/client";
import { LayoutShell, type NavTab } from "./components/layout/LayoutShell";
import { ToastContainer, type ToastMessage } from "./components/ui/Toast";
import { AuthPage } from "./features/auth/AuthPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { DatasetExplorerPage } from "./features/datasets/DatasetExplorerPage";
import { DataQualityPage } from "./features/profiling/DataQualityPage";
import { WorkflowBuilderPage } from "./features/workflows/WorkflowBuilderPage";
import { ReportsExportsPage } from "./features/exports/ReportsExportsPage";
import { TeamSettingsPage } from "./features/team/TeamSettingsPage";
import type {
  DataProfile,
  DatasetDetail,
  DatasetListItem,
  DatasetPreview,
  Project,
  UserProfile,
  WorkflowArtifact,
  WorkflowExecution,
} from "./types/api";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(localStorage.getItem("access_token")));
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [apiHealthy, setApiHealthy] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [activeDataset, setActiveDataset] = useState<DatasetDetail | null>(null);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [profile, setProfile] = useState<DataProfile | null>(null);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [artifacts, setArtifacts] = useState<WorkflowArtifact[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = (type: "success" | "error", text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthed(false);
      setUser(null);
      setProjects([]);
      setActiveProject(null);
      setDatasets([]);
      setActiveDataset(null);
      setPreview(null);
      setProfile(null);
    };
    window.addEventListener("autoprep:unauthorized", onUnauthorized);
    return () => window.removeEventListener("autoprep:unauthorized", onUnauthorized);
  }, []);

  const loadBootstrap = async () => {
    try {
      const [meRes, projRes, healthRes] = await Promise.all([
        api.get<UserProfile>("/auth/me"),
        api.get<Project[]>("/projects"),
        api.get("/admin/health"),
      ]);
      setUser(meRes.data);
      setProjects(projRes.data);
      setApiHealthy(healthRes.data?.status === "ok");
      if (projRes.data.length > 0) {
        setActiveProject((prev) =>
          prev && projRes.data.some((p) => p.id === prev.id) ? prev : projRes.data[0]
        );
      } else {
        setActiveProject(null);
      }
    } catch {
      setApiHealthy(false);
    }
  };

  useEffect(() => {
    if (authed) loadBootstrap();
  }, [authed]);

  useEffect(() => {
    if (authed && activeProject) {
      api
        .get<DatasetListItem[]>(`/projects/${activeProject.id}/datasets`)
        .then((r) => setDatasets(r.data))
        .catch(() => {});
    } else {
      setDatasets([]);
    }
  }, [authed, activeProject]);

  if (!authed) {
    return <AuthPage onAuthenticated={() => setAuthed(true)} />;
  }

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      await api.post("/auth/logout", { refresh_token: refreshToken }).catch(() => {});
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("active_org_id");
    setAuthed(false);
    setUser(null);
    setProjects([]);
    setActiveProject(null);
    setDatasets([]);
    setActiveDataset(null);
    setPreview(null);
    setProfile(null);
  };

  const handleSelectProject = (project: Project) => {
    setActiveProject(project);
    setActiveDataset(null);
    setPreview(null);
    setProfile(null);
    setActiveTab("datasets");
  };

  const handleSelectDataset = async (datasetId: string) => {
    try {
      const [detailRes, prevRes, profRes] = await Promise.all([
        api.get<DatasetDetail>(`/datasets/${datasetId}`),
        api.get<DatasetPreview>(`/datasets/${datasetId}/preview?limit=15&offset=0`),
        api.get<DataProfile>(`/datasets/${datasetId}/profile`).catch(() => null),
      ]);
      setActiveDataset(detailRes.data);
      setPreview(prevRes.data);
      setProfile(profRes ? profRes.data : null);
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Failed to load dataset details."));
    }
  };

  const handleRunProfiling = async (datasetId: string) => {
    try {
      const { data } = await api.post<DataProfile>(`/datasets/${datasetId}/profile`);
      setProfile(data);
      setActiveTab("quality");
      notify("success", "Data quality analysis complete.");
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Profiling failed."));
    }
  };

  const handleWorkspaceContextChanged = async () => {
    setActiveProject(null);
    setActiveDataset(null);
    setPreview(null);
    setProfile(null);
    await loadBootstrap();
  };

  return (
    <>
      <LayoutShell
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        activeProject={activeProject}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onLogout={handleLogout}
      >
        {activeTab === "dashboard" && (
          <DashboardPage
            user={user}
            projects={projects}
            datasets={datasets}
            apiHealthy={apiHealthy}
            onSelectProject={handleSelectProject}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === "projects" && (
          <ProjectsPage
            projects={projects}
            activeProjectId={activeProject?.id}
            onRefresh={async () => {
              const { data } = await api.get<Project[]>("/projects");
              setProjects(data);
            }}
            onSelectProject={handleSelectProject}
            onDeleteProject={async (projectId) => {
              await api.delete(`/projects/${projectId}`);
              const { data } = await api.get<Project[]>("/projects");
              setProjects(data);
              if (activeProject?.id === projectId) {
                setActiveProject(data[0] ?? null);
                setDatasets([]);
                setActiveDataset(null);
                setPreview(null);
                setProfile(null);
              }
              notify("success", "Project deleted.");
            }}
            onNotify={notify}
          />
        )}
        {activeTab === "datasets" && (
          <DatasetExplorerPage
            project={activeProject}
            datasets={datasets}
            activeDataset={activeDataset}
            preview={preview}
            onDatasetUploaded={async (detail, prev) => {
              setActiveDataset(detail);
              setPreview(prev);
              setProfile(null);
              const { data } = await api.get<DatasetListItem[]>(`/projects/${activeProject!.id}/datasets`);
              setDatasets(data);
            }}
            onSelectDataset={handleSelectDataset}
            onDeleteDataset={async (datasetId) => {
              await api.delete(`/datasets/${datasetId}`);
              const { data } = await api.get<DatasetListItem[]>(`/projects/${activeProject!.id}/datasets`);
              setDatasets(data);
              if (activeDataset?.id === datasetId) {
                setActiveDataset(null);
                setPreview(null);
                setProfile(null);
              }
              notify("success", "Dataset deleted.");
            }}
            onPaginatePreview={async (datasetId, offset) => {
              const prevRes = await api.get<DatasetPreview>(`/datasets/${datasetId}/preview?limit=15&offset=${offset}`);
              setPreview(prevRes.data);
            }}
            onRunProfiling={handleRunProfiling}
            onNotify={notify}
          />
        )}
        {activeTab === "quality" && (
          <DataQualityPage
            activeDataset={activeDataset}
            profile={profile}
            onRunProfiling={handleRunProfiling}
            onProceedToWorkflow={() => setActiveTab("workflows")}
          />
        )}
        {activeTab === "workflows" && (
          <WorkflowBuilderPage
            project={activeProject}
            activeDataset={activeDataset}
            profile={profile}
            onExecuted={async (exec) => {
              setExecution(exec);
              const artRes = await api.get<WorkflowArtifact[]>(`/executions/${exec.id}/artifacts`);
              setArtifacts(artRes.data);
              setActiveTab("reports");
            }}
            onNotify={notify}
          />
        )}
        {activeTab === "reports" && (
          <ReportsExportsPage execution={execution} artifacts={artifacts} onNotify={notify} />
        )}
        {(activeTab === "team" || activeTab === "settings") && (
          <TeamSettingsPage
            mode={activeTab}
            user={user}
            onUserUpdated={setUser}
            onWorkspaceChanged={handleWorkspaceContextChanged}
            onNotify={notify}
          />
        )}
      </LayoutShell>
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </>
  );
}
