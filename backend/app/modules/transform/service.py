from typing import Any
import pandas as pd


def apply_stateless_feature_engineering(
    df: pd.DataFrame, steps: list[dict[str, Any]]
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Create row-local derived/date features without fitting cross-row statistics."""
    out = df.copy()
    logs: list[dict[str, Any]] = []

    for step in steps:
        op = step.get("operation_type")
        params = step.get("parameters", {})

        if op == "extract_date_features":
            col = params.get("column")
            parts = params.get("parts", ["year", "month", "day", "dayofweek"])
            if col in out.columns:
                dt = pd.to_datetime(out[col], errors="coerce")
                created = []
                if "year" in parts:
                    out[f"{col}_year"] = dt.dt.year
                    created.append(f"{col}_year")
                if "month" in parts:
                    out[f"{col}_month"] = dt.dt.month
                    created.append(f"{col}_month")
                if "day" in parts:
                    out[f"{col}_day"] = dt.dt.day
                    created.append(f"{col}_day")
                if "dayofweek" in parts:
                    out[f"{col}_dayofweek"] = dt.dt.dayofweek
                    created.append(f"{col}_dayofweek")
                if "is_weekend" in parts:
                    out[f"{col}_is_weekend"] = (dt.dt.dayofweek >= 5).astype(int)
                    created.append(f"{col}_is_weekend")
                logs.append({"operation": op, "source_column": col, "created_features": created})

        elif op == "derive_ratio":
            num_col = params.get("numerator")
            den_col = params.get("denominator")
            new_name = params.get("output_column", f"{num_col}_per_{den_col}")
            if num_col in out.columns and den_col in out.columns:
                denom = out[den_col].replace({0: float("nan")})
                out[new_name] = out[num_col] / denom
                logs.append({"operation": op, "origin": f"{num_col} / {den_col}", "output_column": new_name})

        elif op == "drop_constant_columns":
            const_cols = [c for c in out.columns if out[c].nunique(dropna=False) <= 1]
            if const_cols:
                out = out.drop(columns=const_cols)
            logs.append({"operation": op, "dropped": const_cols})

    return out, logs
