import { useMemo, useState } from "react";
import { Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { DataProfile, DatasetDetail } from "../../types/api";

interface DataQualityProps {
  activeDataset: DatasetDetail | null;
  profile: DataProfile | null;
  onRunProfiling: (datasetId: string) => Promise<void>;
  onProceedToWorkflow: () => void;
}

interface HistogramData {
  counts: number[];
  edges: number[];
}

export function DataQualityPage({
  activeDataset,
  profile,
  onRunProfiling,
  onProceedToWorkflow,
}: DataQualityProps) {
  const [colSearch, setColSearch] = useState("");
  const [corrLimit, setCorrLimit] = useState(10);

  const cols = useMemo(
    () => Object.entries(profile?.summary_stats.columns || {}),
    [profile]
  );

  const filteredCols = useMemo(
    () => cols.filter(([name]) => name.toLowerCase().includes(colSearch.toLowerCase())),
    [cols, colSearch]
  );

  const missingCols = profile?.missing_summary.columns || {};
  const topMissing = useMemo(
    () =>
      Object.entries(missingCols)
        .filter(([, m]) => m.missing_count > 0)
        .sort((a, b) => b[1].missing_pct - a[1].missing_pct)
        .slice(0, 8),
    [missingCols]
  );

  const corrEntries = useMemo(
    () => Object.entries(profile?.correlation_matrix || {}).slice(0, corrLimit),
    [profile, corrLimit]
  );

  if (!activeDataset) {
    return (
      <Card className="py-12 text-center text-sm text-[var(--text-muted)]">
        Select a dataset first to inspect data quality.
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="py-12 text-center space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">
          No profile computed yet for {activeDataset.name}.
        </p>
        <Button onClick={() => onRunProfiling(activeDataset.id)}>
          Run Data Quality Analysis
        </Button>
      </Card>
    );
  }

  const totalMissing = profile.missing_summary.total_missing;
  const duplicateCount = profile.duplicate_count;
  const totalCorrCols = Object.keys(profile.correlation_matrix || {}).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Data Quality Analysis</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Profiled statistics & distributions for {activeDataset.name}
          </p>
        </div>
        <Button onClick={onProceedToWorkflow}>Configure Preprocessing & Split →</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs text-[var(--text-muted)]">Rows</div>
          <div className="mt-1 text-2xl font-bold font-mono">{profile.summary_stats.row_count}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">Columns</div>
          <div className="mt-1 text-2xl font-bold font-mono">{profile.summary_stats.col_count}</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Missing Cells</span>
            {totalMissing === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-[#059669]" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[#D97706]" />
            )}
          </div>
          <div
            className={`mt-1 text-2xl font-bold font-mono ${
              totalMissing === 0 ? "text-[#059669]" : "text-[#D97706]"
            }`}
          >
            {totalMissing}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Duplicate Rows</span>
            {duplicateCount === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-[#059669]" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[#D97706]" />
            )}
          </div>
          <div
            className={`mt-1 text-2xl font-bold font-mono ${
              duplicateCount === 0 ? "text-[#059669]" : "text-[#D97706]"
            }`}
          >
            {duplicateCount}
          </div>
        </Card>
      </div>

      {/* Missingness Chart */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Missingness Overview
          </h2>
          <Badge variant={totalMissing === 0 ? "emerald" : "warning"}>
            {totalMissing === 0 ? "100% Complete" : `${topMissing.length} columns with nulls`}
          </Badge>
        </div>
        {topMissing.length === 0 ? (
          <div className="rounded-lg bg-[var(--primary-subtle)] px-3.5 py-2.5 text-xs text-[#065F46] dark:text-emerald-300">
            No missing values detected across any of the {profile.summary_stats.col_count} columns.
          </div>
        ) : (
          <div className="space-y-2">
            {topMissing.map(([col, m]) => (
              <div key={col} className="space-y-1 text-xs">
                <div className="flex justify-between font-mono">
                  <span className="text-[var(--text-primary)] truncate pr-2">{col}</span>
                  <span className="text-[#D97706]">
                    {m.missing_count} ({m.missing_pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#D97706]"
                    style={{ width: `${Math.min(100, Math.max(2, m.missing_pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Column Distributions */}
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Column Distributions ({filteredCols.length})
            </h2>
            <div className="relative w-full sm:w-52">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter columns..."
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-2.5 py-1.5 text-xs focus:border-[#059669] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {filteredCols.map(([name, info]) => {
              const miss = missingCols[name] || { missing_count: 0, missing_pct: 0 };
              const hist = info.histogram as HistogramData | undefined;
              const topVals = info.top_values as Record<string, number> | undefined;
              const maxHist = hist ? Math.max(...hist.counts, 1) : 1;
              const topEntries = topVals ? Object.entries(topVals).slice(0, 5) : [];
              const maxCat = topEntries.length > 0 ? Math.max(...topEntries.map(([, v]) => v), 1) : 1;

              return (
                <div
                  key={name}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-[var(--text-primary)] truncate">
                        {name}
                      </span>
                      <Badge variant="emerald">{String(info.kind || info.dtype)}</Badge>
                    </div>
                    <span
                      className={`font-mono shrink-0 ${
                        miss.missing_count > 0 ? "text-[#D97706]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {miss.missing_count} missing ({miss.missing_pct}%)
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                    {info.kind === "numerical"
                      ? `mean=${info.mean ?? "-"} · median=${info.median ?? "-"} · min=${info.min ?? "-"} · max=${info.max ?? "-"}`
                      : `unique=${info.unique_count ?? "-"}`}
                  </div>

                  {/* Numerical Histogram */}
                  {info.kind === "numerical" && hist && hist.counts.length > 0 && (
                    <div className="pt-1">
                      <div className="flex items-end gap-1 h-14 px-1 border-b border-[var(--border-default)]">
                        {hist.counts.map((count, idx) => {
                          const pct = Math.max(4, Math.round((count / maxHist) * 100));
                          const lo = hist.edges[idx];
                          const hi = hist.edges[idx + 1];
                          return (
                            <div
                              key={idx}
                              title={`[${lo} – ${hi}]: ${count} rows`}
                              className="flex-1 bg-[#059669]/80 hover:bg-[#059669] rounded-t transition-all"
                              style={{ height: `${pct}%` }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)] mt-1">
                        <span>{hist.edges[0]}</span>
                        <span>{hist.edges[hist.edges.length - 1]}</span>
                      </div>
                    </div>
                  )}

                  {/* Categorical Top Values Bar Chart */}
                  {info.kind !== "numerical" && topEntries.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {topEntries.map(([val, cnt]) => (
                        <div key={val} className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="w-24 truncate text-[var(--text-secondary)]" title={val}>
                            {val}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#059669]"
                              style={{ width: `${Math.max(4, Math.round((cnt / maxCat) * 100))}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-[var(--text-muted)]">{cnt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Correlation Heatmap */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Numerical Correlation Heatmap
            </h2>
            {totalCorrCols > 10 && (
              <select
                value={corrLimit}
                onChange={(e) => setCorrLimit(Number(e.target.value))}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs"
              >
                <option value={8}>Top 8 cols</option>
                <option value={10}>Top 10 cols</option>
                <option value={15}>Top 15 cols</option>
                <option value={totalCorrCols}>All ({totalCorrCols})</option>
              </select>
            )}
          </div>

          {corrEntries.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Need at least 2 numerical columns for correlations.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono border-separate border-spacing-1">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="py-1 pr-2">Col</th>
                    {corrEntries.map(([c]) => (
                      <th key={c} className="py-1 px-1.5 max-w-[80px] truncate" title={c}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrEntries.map(([rowName, rowMap]) => (
                    <tr key={rowName}>
                      <td
                        className="py-1 pr-2 font-semibold text-[var(--text-primary)] max-w-[110px] truncate"
                        title={rowName}
                      >
                        {rowName}
                      </td>
                      {corrEntries.map(([colName]) => {
                        const val = rowMap[colName] ?? 0;
                        const abs = Math.abs(val);
                        const bg =
                          rowName === colName
                            ? "bg-slate-200 dark:bg-slate-700 text-[var(--text-primary)]"
                            : val > 0
                            ? abs >= 0.7
                              ? "bg-emerald-600 text-white"
                              : abs >= 0.35
                              ? "bg-emerald-200 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-200"
                              : "bg-emerald-50 text-[var(--text-secondary)] dark:bg-emerald-950/20"
                            : val < 0
                            ? abs >= 0.7
                              ? "bg-rose-600 text-white"
                              : abs >= 0.35
                              ? "bg-rose-200 text-rose-950 dark:bg-rose-900/60 dark:text-rose-200"
                              : "bg-rose-50 text-[var(--text-secondary)] dark:bg-rose-950/20"
                            : "bg-[var(--bg-app)] text-[var(--text-muted)]";
                        return (
                          <td
                            key={colName}
                            title={`${rowName} × ${colName}: ${val.toFixed(3)}`}
                            className={`py-1.5 px-1.5 text-center rounded ${bg}`}
                          >
                            {val.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
