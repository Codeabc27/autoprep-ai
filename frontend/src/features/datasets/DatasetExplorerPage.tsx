import { useState } from "react";
import { Upload, Trash2, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type { DatasetDetail, DatasetListItem, DatasetPreview, Project } from "../../types/api";

interface DatasetExplorerProps {
  project: Project | null;
  datasets: DatasetListItem[];
  activeDataset: DatasetDetail | null;
  preview: DatasetPreview | null;
  onDatasetUploaded: (detail: DatasetDetail, preview: DatasetPreview) => Promise<void>;
  onSelectDataset: (datasetId: string) => Promise<void>;
  onDeleteDataset: (datasetId: string) => Promise<void>;
  onPaginatePreview: (datasetId: string, offset: number) => Promise<void>;
  onRunProfiling: (datasetId: string) => Promise<void>;
  onNotify: (type: "success" | "error", text: string) => void;
}

export function DatasetExplorerPage({
  project,
  datasets,
  activeDataset,
  preview,
  onDatasetUploaded,
  onSelectDataset,
  onDeleteDataset,
  onPaginatePreview,
  onRunProfiling,
  onNotify,
}: DatasetExplorerProps) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [colSearch, setColSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!project) {
    return (
      <Card className="py-12 text-center text-sm text-[var(--text-muted)]">
        Select or create a project first from the Projects page.
      </Card>
    );
  }

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      onNotify("error", "Only .csv files are supported in MVP.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post<DatasetDetail>(`/projects/${project.id}/datasets`, form);
      const prevRes = await api.get<DatasetPreview>(`/datasets/${data.id}/preview?limit=15&offset=0`);
      await onDatasetUploaded(data, prevRes.data);
      onNotify("success", `Uploaded ${file.name} (${data.latest_version.row_count} rows).`);
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const visibleCols = preview ? preview.columns.filter((c) => c.toLowerCase().includes(colSearch.toLowerCase())) : [];

  return (
    <div className="space-y-6">
      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`rounded-xl border-2 border-dashed p-6 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[var(--bg-surface)] ${
          dragging ? "border-[#059669] bg-[var(--primary-subtle)]" : "border-[var(--border-strong)]"
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[#059669]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Upload CSV Dataset</h2>
            <Badge variant="emerald">
              <ShieldCheck className="h-3 w-3 mr-1" /> Original Immutable
            </Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Drag and drop a `.csv` file here (MVP limit: 100 MB / 500,000 rows). Raw uploads remain untouched.
          </p>
        </div>

        <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[#059669] hover:bg-[#047857] px-4 py-2 text-xs font-semibold text-white transition">
          {uploading ? "Uploading..." : "Browse CSV"}
          <input
            type="file"
            accept=".csv"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
        </label>
      </div>

      {/* Dataset List */}
      {datasets.length > 0 && (
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Project Datasets ({datasets.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {datasets.map((d) => (
              <div key={d.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-1">
                <button
                  type="button"
                  onClick={() => onSelectDataset(d.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                    activeDataset?.id === d.id ? "bg-[#059669] text-white" : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  {d.name} · <span className="opacity-80">{d.lifecycle_status}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(d.id)}
                  aria-label={`Delete ${d.name}`}
                  className="p-1 text-[var(--text-muted)] hover:text-[#DC2626]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {confirmDeleteId && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between text-xs dark:bg-red-950/40 dark:border-red-800">
              <span className="text-red-700 dark:text-red-300">Confirm soft-deleting this dataset?</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await onDeleteDataset(confirmDeleteId);
                    setConfirmDeleteId(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Preview Table */}
      {preview && activeDataset && (
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{activeDataset.name}</h3>
              <p className="text-xs font-mono text-[var(--text-muted)]">
                {preview.total_rows} rows · {preview.columns.length} columns · Version v{activeDataset.latest_version.version_number}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Filter columns..."
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs focus:border-[#059669] focus:outline-none"
              />
              <Button size="sm" onClick={() => onRunProfiling(activeDataset.id)}>
                Run Data Quality Analysis
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-default)]">
                <tr>
                  {visibleCols.map((c) => {
                    const meta = activeDataset.columns.find((x) => x.name === c);
                    return (
                      <th key={c} className="px-3 py-2.5 font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        {c}
                        {meta && <span className="ml-1.5 rounded bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[#059669] border border-[var(--border-default)]">{meta.semantic_type}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {preview.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-app)]">
                    {visibleCols.map((c) => {
                      const v = row[c];
                      return (
                        <td key={c} className="px-3 py-2 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                          {v === null || v === undefined ? <span className="text-[#D97706]">NULL</span> : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              Showing {preview.offset + 1}–{Math.min(preview.offset + preview.limit, preview.total_rows)} of {preview.total_rows}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={preview.offset === 0}
                onClick={() => onPaginatePreview(activeDataset.id, Math.max(0, preview.offset - preview.limit))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={preview.offset + preview.limit >= preview.total_rows}
                onClick={() => onPaginatePreview(activeDataset.id, preview.offset + preview.limit)}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
