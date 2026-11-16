export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  platform_role: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
}

export interface Project {
  id: string;
  owner_user_id: string;
  org_id: string | null;
  name: string;
  description: string;
  created_at: string;
}

export interface DatasetListItem {
  id: string;
  project_id: string;
  name: string;
  lifecycle_status: string;
  created_at: string;
}

export interface DatasetColumn {
  id: string;
  name: string;
  inferred_dtype: string;
  semantic_type: string;
  ordinal_position: number;
}

export interface DatasetDetail extends DatasetListItem {
  latest_version: {
    id: string;
    version_number: number;
    version_type: string;
    size_bytes: number;
    row_count: number;
    col_count: number;
    sha256: string;
    created_at: string;
  };
  columns: DatasetColumn[];
}

export interface DatasetPreview {
  dataset_id: string;
  version_id: string;
  total_rows: number;
  limit: number;
  offset: number;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface DataProfile {
  id: string;
  dataset_version_id: string;
  summary_stats: {
    row_count: number;
    col_count: number;
    memory_bytes: number;
    columns: Record<string, Record<string, unknown>>;
  };
  missing_summary: {
    total_missing: number;
    columns: Record<string, { missing_count: number; missing_pct: number }>;
  };
  correlation_matrix: Record<string, Record<string, number>>;
  duplicate_count: number;
  computed_at: string;
}

export interface WorkflowStepInput {
  operation_type: string;
  parameters: Record<string, unknown>;
  approved: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: string;
  step_logs: {
    cleaning?: Record<string, unknown>[];
    feature_engineering?: Record<string, unknown>[];
    validation?: {
      train_rows: number;
      val_rows: number;
      test_rows: number;
      feature_count: number;
      train_nans: number;
      val_nans: number;
      test_nans: number;
      leakage_warnings: { column: string; reason: string }[];
      leakage_disclaimer: string;
    };
  };
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface WorkflowArtifact {
  id: string;
  execution_id: string;
  artifact_type: string;
  size_bytes: number;
  created_at: string;
}

export interface AIRecommendation {
  id: string;
  conversation_id: string;
  user_prompt: string;
  proposed_plan: {
    suggested_target_column: string | null;
    suggested_problem_type: string;
    suggested_split_strategy: string;
    steps: { operation_type: string; parameters: Record<string, unknown>; rationale: string }[];
    explanation: string;
  };
  explanation: string;
  approval_status: string;
  created_at: string;
}
