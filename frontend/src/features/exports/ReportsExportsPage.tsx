import { Download, ShieldCheck, AlertTriangle } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type { WorkflowArtifact, WorkflowExecution } from "../../types/api";

interface ReportsExportsProps {
  execution: WorkflowExecution | null;
  artifacts: WorkflowArtifact[];
  onNotify: (type: "success" | "error", text: string) => void;
}

export function ReportsExportsPage({ execution, artifacts, onNotify }: ReportsExportsProps) {
  const handleDownload = async (artifact: WorkflowArtifact) => {
    try {
      const res = await api.get(`/artifacts/${artifact.id}/download`, { responseType: "blob" });
      const extMap: Record<string, string> = {
        train_csv: "train.csv",
        val_csv: "val.csv",
        test_csv: "test.csv",
        pipeline_joblib: "pipeline.joblib",
        config_json: "workflow_config.json",
        validation_report_json: "validation_report.json",
        project_bundle_zip: "project_bundle.zip",
      };
      const filename = extMap[artifact.artifact_type] || `${artifact.artifact_type}.bin`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Download failed."));
    }
  };

  if (!execution) {
    return (
      <Card className="py-12 text-center text-sm text-[var(--text-muted)]">
        Execute a workflow first to inspect validation results and download artifacts.
      </Card>
    );
  }

  const val = execution.step_logs?.validation;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Reports & Exports</h1>
          <p className="text-xs font-mono text-[var(--text-muted)]">Execution ID: {execution.id}</p>
        </div>
        <Badge variant={execution.status === "COMPLETED" ? "emerald" : "warning"}>{execution.status}</Badge>
      </div>

      {val && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-[#ECFDF5] p-4 flex items-center gap-3 text-xs text-[#065F46] dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#059669]" />
            <span>
              <strong>Split-Before-Fit Verified:</strong> Train ({val.train_rows} rows), Validation ({val.val_rows} rows), Test ({val.test_rows} rows) · {val.feature_count} output features · {val.train_nans + val.val_nans + val.test_nans} NaNs remaining.
            </span>
          </div>

          {val.leakage_warnings.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Target Leakage Heuristic Warnings
              </div>
              <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                {val.leakage_warnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-mono font-semibold">{w.column}</span>: {w.reason}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">{val.leakage_disclaimer}</p>
            </Card>
          )}
        </>
      )}

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Generated Artifacts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {artifacts.map((a) => (
            <Button key={a.id} variant="secondary" onClick={() => handleDownload(a)} className="justify-between">
              <span className="font-mono">{a.artifact_type}</span>
              <Download className="h-3.5 w-3.5 text-[#059669]" />
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
