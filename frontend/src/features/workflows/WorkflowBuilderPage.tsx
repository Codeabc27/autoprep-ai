import { useEffect, useState } from "react";
import { Play, Sparkles, ShieldCheck, Check } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type {
  AIRecommendation,
  DataProfile,
  DatasetDetail,
  Project,
  WorkflowExecution,
  WorkflowStepInput,
} from "../../types/api";

interface WorkflowBuilderProps {
  project: Project | null;
  activeDataset: DatasetDetail | null;
  profile: DataProfile | null;
  onExecuted: (execution: WorkflowExecution) => Promise<void>;
  onNotify: (type: "success" | "error", text: string) => void;
}

export function WorkflowBuilderPage({
  project,
  activeDataset,
  profile,
  onExecuted,
  onNotify,
}: WorkflowBuilderProps) {
  const [targetCol, setTargetCol] = useState(
    activeDataset?.columns[activeDataset.columns.length - 1]?.name || ""
  );
  const [problemType, setProblemType] = useState("binary_classification");
  const [splitStrategy, setSplitStrategy] = useState("stratified");
  const [timeColumn, setTimeColumn] = useState("");
  const [groupColumn, setGroupColumn] = useState("");
  const [trainPct, setTrainPct] = useState(70);
  const [valPct, setValPct] = useState(15);
  const [testPct, setTestPct] = useState(15);
  const [randomSeed, setRandomSeed] = useState(42);

  const [dropDups, setDropDups] = useState(true);
  const [dropConst, setDropConst] = useState(true);
  const [imputeNumeric, setImputeNumeric] = useState("median");
  const [scaler, setScaler] = useState("standard");
  const [encoder, setEncoder] = useState("onehot");
  const [extraAiSteps, setExtraAiSteps] = useState<WorkflowStepInput[]>([]);

  const [aiPrompt, setAiPrompt] = useState(
    "Prepare this dataset for classification. Remove duplicates, impute nulls, and encode categoricals."
  );
  const [aiRec, setAiRec] = useState<AIRecommendation | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [execBusy, setExecBusy] = useState(false);

  useEffect(() => {
    if (activeDataset && activeDataset.columns.length > 0) {
      const hasCurrent = activeDataset.columns.some((c) => c.name === targetCol);
      if (!hasCurrent) {
        setTargetCol(activeDataset.columns[activeDataset.columns.length - 1].name);
      }
      if (!timeColumn) {
        const dtCol = activeDataset.columns.find((c) => c.semantic_type === "datetime");
        setTimeColumn(dtCol?.name || activeDataset.columns[0].name);
      }
      if (!groupColumn) {
        const catCol = activeDataset.columns.find((c) => c.semantic_type === "categorical");
        setGroupColumn(catCol?.name || activeDataset.columns[0].name);
      }
    } else {
      setTargetCol("");
      setTimeColumn("");
      setGroupColumn("");
    }
  }, [activeDataset]);

  if (!project || !activeDataset) {
    return (
      <Card className="py-12 text-center text-sm text-[var(--text-muted)]">
        Select a project and dataset first.
      </Card>
    );
  }

  const ratioValid =
    trainPct + valPct + testPct === 100 && trainPct > 0 && valPct > 0 && testPct > 0;

  const handleAiRecommend = async () => {
    setAiBusy(true);
    try {
      const { data } = await api.post<AIRecommendation>(`/projects/${project.id}/ai/recommend`, {
        dataset_id: activeDataset.id,
        prompt: aiPrompt,
      });
      setAiRec(data);
      onNotify("success", "Gemini AI generated an allowlisted preprocessing plan.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "AI recommendation failed."));
    } finally {
      setAiBusy(false);
    }
  };

  const handleApproveAiPlan = async () => {
    if (!aiRec) return;
    try {
      await api.post(`/ai/recommendations/${aiRec.id}/approve`);
      const plan = aiRec.proposed_plan;
      if (plan.suggested_target_column) {
        setTargetCol(plan.suggested_target_column);
      }
      if (plan.suggested_problem_type) {
        setProblemType(plan.suggested_problem_type);
      }
      if (plan.suggested_split_strategy) {
        setSplitStrategy(plan.suggested_split_strategy);
      }

      const aiSteps = plan.steps || [];
      setDropDups(aiSteps.some((s) => s.operation_type === "drop_duplicates"));
      setDropConst(aiSteps.some((s) => s.operation_type === "drop_constant_columns"));

      const imputeStep = aiSteps.find((s) => s.operation_type === "impute_missing");
      if (imputeStep?.parameters?.numeric_strategy) {
        setImputeNumeric(String(imputeStep.parameters.numeric_strategy));
      }
      const scaleStep = aiSteps.find((s) => s.operation_type === "scale_numeric");
      if (scaleStep?.parameters?.method) {
        setScaler(String(scaleStep.parameters.method));
      }
      const encodeStep = aiSteps.find((s) => s.operation_type === "encode_categorical");
      if (encodeStep?.parameters?.method) {
        setEncoder(String(encodeStep.parameters.method));
      }

      const coreOps = new Set([
        "drop_duplicates",
        "drop_constant_columns",
        "impute_missing",
        "scale_numeric",
        "encode_categorical",
      ]);
      const extras = aiSteps
        .filter((s) => !coreOps.has(s.operation_type))
        .map((s) => ({
          operation_type: s.operation_type,
          parameters: s.parameters || {},
          approved: true,
        }));
      setExtraAiSteps(extras);

      onNotify("success", "AI plan approved and synced to workflow.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Failed to approve plan."));
    }
  };

  const handleExecute = async () => {
    if (!ratioValid) {
      onNotify("error", "Train + Validation + Test percentages must equal 100%.");
      return;
    }
    if (splitStrategy === "time_based" && !timeColumn) {
      onNotify("error", "Select a time column for time-based splitting.");
      return;
    }
    if (splitStrategy === "group_based" && !groupColumn) {
      onNotify("error", "Select a group column for group-based splitting.");
      return;
    }

    setExecBusy(true);
    try {
      const steps: WorkflowStepInput[] = [
        ...(dropDups ? [{ operation_type: "drop_duplicates", parameters: {}, approved: true }] : []),
        ...(dropConst ? [{ operation_type: "drop_constant_columns", parameters: {}, approved: true }] : []),
        ...extraAiSteps,
        {
          operation_type: "impute_missing",
          parameters: { numeric_strategy: imputeNumeric, categorical_strategy: "most_frequent" },
          approved: true,
        },
        { operation_type: "scale_numeric", parameters: { method: scaler }, approved: true },
        { operation_type: "encode_categorical", parameters: { method: encoder }, approved: true },
      ];

      const wfRes = await api.post(`/projects/${project.id}/workflows`, {
        source_version_id: activeDataset.latest_version.id,
        name: `${activeDataset.name} Workflow`,
        problem_type: problemType,
        target_column: targetCol || activeDataset.columns[activeDataset.columns.length - 1]?.name,
        split_config: {
          strategy: splitStrategy,
          train_ratio: trainPct / 100,
          val_ratio: valPct / 100,
          test_ratio: testPct / 100,
          time_column: splitStrategy === "time_based" ? timeColumn : null,
          group_column: splitStrategy === "group_based" ? groupColumn : null,
        },
        random_seed: randomSeed,
        steps,
      });

      const execRes = await api.post<WorkflowExecution>(`/workflows/${wfRes.data.id}/execute`);
      await onExecuted(execRes.data);
      onNotify("success", "Workflow completed! Split-before-fit verified.");
    } catch (err) {
      onNotify("error", getApiErrorMessage(err, "Workflow execution failed."));
    } finally {
      setExecBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max text-xs">
          {["Upload", "Profile", "Clean & Transform", "Split First", "Fit Train Only", "Validate", "Export"].map(
            (step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium ${
                    i <= 3
                      ? "bg-[var(--primary-subtle)] text-[#059669]"
                      : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                  }`}
                >
                  {i <= 1 && <Check className="h-3 w-3" />} {step}
                </span>
                {i < 6 && <span className="text-[var(--text-muted)]">→</span>}
              </div>
            )
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Preprocessing & Split Configuration
            </h2>
            <Badge variant="emerald">
              <ShieldCheck className="h-3 w-3 mr-1" /> Split-Before-Fit
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Target Column
              </label>
              <select
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
              >
                {activeDataset.columns.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.semantic_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Problem Type
              </label>
              <select
                value={problemType}
                onChange={(e) => setProblemType(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
              >
                <option value="binary_classification">Binary Classification</option>
                <option value="multiclass_classification">Multiclass Classification</option>
                <option value="regression">Regression</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Split Strategy
              </label>
              <select
                value={splitStrategy}
                onChange={(e) => setSplitStrategy(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
              >
                <option value="stratified">Stratified</option>
                <option value="random">Random</option>
                <option value="time_based">Time-Based</option>
                <option value="group_based">Group-Based</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Random Seed
              </label>
              <input
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          {splitStrategy === "time_based" && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Time Ordering Column
              </label>
              <select
                value={timeColumn}
                onChange={(e) => setTimeColumn(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
              >
                {activeDataset.columns.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.semantic_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {splitStrategy === "group_based" && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Group Identifier Column
              </label>
              <select
                value={groupColumn}
                onChange={(e) => setGroupColumn(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
              >
                {activeDataset.columns.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.semantic_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Train %</label>
              <input
                type="number"
                min={10}
                max={90}
                value={trainPct}
                onChange={(e) => setTrainPct(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Validation %</label>
              <input
                type="number"
                min={5}
                max={50}
                value={valPct}
                onChange={(e) => setValPct(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Test %</label>
              <input
                type="number"
                min={5}
                max={50}
                value={testPct}
                onChange={(e) => setTestPct(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
          {!ratioValid && (
            <p className="text-xs text-[#DC2626]">Split percentages must sum to exactly 100%.</p>
          )}

          <div className="space-y-3 border-t border-[var(--border-default)] pt-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dropDups}
                onChange={(e) => setDropDups(e.target.checked)}
                className="accent-[#059669]"
              />
              <span>Remove exact duplicate rows</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dropConst}
                onChange={(e) => setDropConst(e.target.checked)}
                className="accent-[#059669]"
              />
              <span>Drop zero-variance constant columns</span>
            </label>
            {extraAiSteps.length > 0 && (
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                Additional AI steps synced:{" "}
                <span className="font-mono font-semibold text-[#059669]">
                  {extraAiSteps.map((s) => s.operation_type).join(", ")}
                </span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                  Numeric Imputer (Train-Only)
                </label>
                <select
                  value={imputeNumeric}
                  onChange={(e) => setImputeNumeric(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1.5"
                >
                  <option value="median">Median</option>
                  <option value="mean">Mean</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                  Scaler (Train-Only)
                </label>
                <select
                  value={scaler}
                  onChange={(e) => setScaler(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1.5"
                >
                  <option value="standard">StandardScaler</option>
                  <option value="minmax">MinMaxScaler</option>
                  <option value="robust">RobustScaler</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                  Encoder (Train-Only)
                </label>
                <select
                  value={encoder}
                  onChange={(e) => setEncoder(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1.5"
                >
                  <option value="onehot">OneHotEncoder</option>
                  <option value="ordinal">OrdinalEncoder</option>
                </select>
              </div>
            </div>
          </div>

          <Button onClick={handleExecute} loading={execBusy} disabled={!ratioValid} className="w-full">
            <Play className="h-4 w-4" /> Approve & Execute ML-Safe Workflow
          </Button>
        </Card>

        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#059669]" /> Gemini AI Assistant
            </h2>
            <Badge variant="info">Profile-Only Privacy</Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Analyzes only your dataset schema and profile summary (never raw rows) and returns allowlisted operations.
          </p>
          <textarea
            rows={3}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-xs focus:border-[#059669] focus:outline-none"
          />
          <Button
            variant="secondary"
            onClick={handleAiRecommend}
            loading={aiBusy}
            disabled={!profile}
            className="w-full"
          >
            {profile ? "Generate Allowlisted Plan" : "Run Data Quality Analysis First"}
          </Button>

          {aiRec && (
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3.5 space-y-2.5 text-xs">
              <p className="text-[#059669] font-medium">{aiRec.explanation}</p>
              <ul className="space-y-1.5 text-[var(--text-secondary)]">
                {aiRec.proposed_plan.steps.map((s, i) => (
                  <li key={i}>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      {s.operation_type}
                    </span>
                    : {s.rationale}
                  </li>
                ))}
              </ul>
              <Button size="sm" onClick={handleApproveAiPlan} className="w-full">
                Approve & Apply to Workflow
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
