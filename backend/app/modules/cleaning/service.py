from typing import Any
import numpy as np
import pandas as pd


def apply_stateless_cleaning(df: pd.DataFrame, steps: list[dict[str, Any]]) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Apply row-level cleaning operations that do not fit cross-row statistics."""
    out = df.copy()
    logs: list[dict[str, Any]] = []

    for step in steps:
        op = step.get("operation_type")
        params = step.get("parameters", {})

        if op == "drop_duplicates":
            before = len(out)
            subset = params.get("columns") or None
            out = out.drop_duplicates(subset=subset).reset_index(drop=True)
            logs.append({"operation": op, "rows_removed": before - len(out)})

        elif op == "cast_dtype":
            col = params["column"]
            target_dtype = params["dtype"]
            if col in out.columns:
                if target_dtype in {"int", "int64", "float", "float64"}:
                    out[col] = pd.to_numeric(out[col], errors="coerce")
                    if target_dtype.startswith("int"):
                        out[col] = out[col].astype("Int64")
                elif target_dtype == "datetime":
                    out[col] = pd.to_datetime(out[col], errors="coerce")
                elif target_dtype == "str":
                    out[col] = out[col].astype(str)
                logs.append({"operation": op, "column": col, "dtype": target_dtype})

        elif op == "drop_missing_rows":
            before = len(out)
            cols = params.get("columns") or None
            out = out.dropna(subset=cols).reset_index(drop=True)
            logs.append({"operation": op, "rows_removed": before - len(out)})

        elif op == "drop_columns":
            cols = [c for c in params.get("columns", []) if c in out.columns]
            out = out.drop(columns=cols)
            logs.append({"operation": op, "columns_dropped": cols})

        elif op == "remove_outliers":
            col = params.get("column")
            method = params.get("method", "iqr")
            action = params.get("action", "remove")
            if col in out.columns and pd.api.types.is_numeric_dtype(out[col]):
                s = out[col].dropna()
                if method == "zscore":
                    std = float(s.std(ddof=1)) if len(s) > 1 else 0.0
                    mean = float(s.mean())
                    threshold = float(params.get("threshold", 3.0))
                    mask = (np.abs((out[col] - mean) / std) > threshold) if std > 0 else pd.Series(False, index=out.index)
                else:
                    q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
                    iqr = q3 - q1
                    k = float(params.get("factor", 1.5))
                    mask = (out[col] < (q1 - k * iqr)) | (out[col] > (q3 + k * iqr))
                flagged = int(mask.sum())
                if action == "remove":
                    out = out.loc[~mask].reset_index(drop=True)
                logs.append({"operation": op, "column": col, "method": method, "flagged": flagged, "action": action})

    return out, logs
