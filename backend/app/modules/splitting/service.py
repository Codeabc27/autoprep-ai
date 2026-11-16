from typing import Any
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder, OrdinalEncoder, RobustScaler, StandardScaler


def suggest_problem_type(target_series: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(target_series) and target_series.nunique(dropna=True) > 20:
        return "regression"
    if target_series.nunique(dropna=True) == 2:
        return "binary_classification"
    return "multiclass_classification"


def split_dataframe(
    df: pd.DataFrame,
    target_column: str,
    strategy: str = "random",
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    random_seed: int = 42,
    time_column: str | None = None,
    group_column: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not np.isclose(train_ratio + val_ratio + test_ratio, 1.0, atol=1e-3):
        raise ValueError("train_ratio + val_ratio + test_ratio must equal 1.0")
    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found")

    if strategy == "time_based":
        if not time_column or time_column not in df.columns:
            raise ValueError("time_column is required and must exist in dataset for time_based splitting")
        ordered = df.sort_values(by=time_column).reset_index(drop=True)
        n = len(ordered)
        n_train = int(n * train_ratio)
        n_val = int(n * (train_ratio + val_ratio))
        return ordered.iloc[:n_train].copy(), ordered.iloc[n_train:n_val].copy(), ordered.iloc[n_val:].copy()

    if strategy == "group_based":
        if not group_column or group_column not in df.columns:
            raise ValueError("group_column is required and must exist in dataset for group_based splitting")
        gss1 = GroupShuffleSplit(n_splits=1, test_size=(1.0 - train_ratio), random_state=random_seed)
        train_idx, temp_idx = next(gss1.split(df, groups=df[group_column]))
        train_df = df.iloc[train_idx].copy()
        temp_df = df.iloc[temp_idx].copy()
        rel_test = test_ratio / max(val_ratio + test_ratio, 1e-9)
        gss2 = GroupShuffleSplit(n_splits=1, test_size=rel_test, random_state=random_seed)
        val_idx, test_idx = next(gss2.split(temp_df, groups=temp_df[group_column]))
        return train_df, temp_df.iloc[val_idx].copy(), temp_df.iloc[test_idx].copy()

    stratify_y = df[target_column] if strategy == "stratified" else None
    train_df, temp_df = train_test_split(
        df,
        test_size=(1.0 - train_ratio),
        random_state=random_seed,
        stratify=stratify_y,
    )
    rel_test = test_ratio / max(val_ratio + test_ratio, 1e-9)
    stratify_temp = temp_df[target_column] if strategy == "stratified" else None
    val_df, test_df = train_test_split(
        temp_df,
        test_size=rel_test,
        random_state=random_seed,
        stratify=stratify_temp,
    )
    return train_df.copy(), val_df.copy(), test_df.copy()


def build_and_fit_pipeline(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    target_column: str,
    steps: list[dict[str, Any]],
) -> tuple[Pipeline, pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Enforce SRS Section 8: fit imputers, scalers, and encoders on TRAIN only, then transform val/test."""
    X_train = train_df.drop(columns=[target_column])
    y_train = train_df[target_column].reset_index(drop=True)
    X_val = val_df.drop(columns=[target_column])
    y_val = val_df[target_column].reset_index(drop=True)
    X_test = test_df.drop(columns=[target_column])
    y_test = test_df[target_column].reset_index(drop=True)

    num_cols = X_train.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = [c for c in X_train.columns if c not in num_cols]

    num_impute_strategy = "median"
    cat_impute_strategy = "most_frequent"
    scaler_name = "standard"
    encoder_name = "onehot"

    for step in steps:
        op = step.get("operation_type")
        params = step.get("parameters", {})
        if op == "impute_missing":
            num_impute_strategy = params.get("numeric_strategy", num_impute_strategy)
            cat_impute_strategy = params.get("categorical_strategy", cat_impute_strategy)
        elif op == "scale_numeric":
            scaler_name = params.get("method", scaler_name)
        elif op == "encode_categorical":
            encoder_name = params.get("method", encoder_name)

    scaler_map = {
        "standard": StandardScaler(),
        "minmax": MinMaxScaler(),
        "robust": RobustScaler(),
    }
    scaler = scaler_map.get(scaler_name, StandardScaler())

    if encoder_name == "ordinal":
        encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
    else:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)

    transformers = []
    if num_cols:
        num_pipe = Pipeline([
            ("imputer", SimpleImputer(strategy=num_impute_strategy)),
            ("scaler", scaler),
        ])
        transformers.append(("num", num_pipe, num_cols))
    if cat_cols:
        cat_pipe = Pipeline([
            ("imputer", SimpleImputer(strategy=cat_impute_strategy)),
            ("encoder", encoder),
        ])
        transformers.append(("cat", cat_pipe, cat_cols))

    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    full_pipe = Pipeline([("preprocessor", preprocessor)])

    # STRICT: fit ONLY on X_train
    X_train_t = full_pipe.fit_transform(X_train)
    X_val_t = full_pipe.transform(X_val)
    X_test_t = full_pipe.transform(X_test)

    feature_names = list(full_pipe.named_steps["preprocessor"].get_feature_names_out())

    def _to_df(arr: np.ndarray, y: pd.Series) -> pd.DataFrame:
        out = pd.DataFrame(arr, columns=feature_names)
        out[target_column] = y
        return out

    train_out = _to_df(X_train_t, y_train)
    val_out = _to_df(X_val_t, y_val)
    test_out = _to_df(X_test_t, y_test)

    leakage_warnings = detect_potential_leakage(train_df, target_column)
    validation_report = {
        "train_rows": len(train_out),
        "val_rows": len(val_out),
        "test_rows": len(test_out),
        "feature_count": len(feature_names),
        "train_nans": int(train_out.isna().sum().sum()),
        "val_nans": int(val_out.isna().sum().sum()),
        "test_nans": int(test_out.isna().sum().sum()),
        "leakage_warnings": leakage_warnings,
        "leakage_disclaimer": (
            "Automated leakage checks flag suspicious patterns (e.g., high target correlation or ID-like columns) "
            "but cannot guarantee all data leakage has been eliminated."
        ),
    }
    return full_pipe, train_out, val_out, test_out, validation_report


def detect_potential_leakage(train_df: pd.DataFrame, target_column: str) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    if target_column not in train_df.columns:
        return warnings

    for col in train_df.columns:
        if col == target_column:
            continue
        if train_df[col].nunique(dropna=True) == len(train_df) and len(train_df) > 20:
            warnings.append({"column": str(col), "reason": "All values unique (potential identifier/ID column)"})
        if pd.api.types.is_numeric_dtype(train_df[col]) and pd.api.types.is_numeric_dtype(train_df[target_column]):
            corr = abs(float(train_df[col].corr(train_df[target_column])))
            if not np.isnan(corr) and corr >= 0.95:
                warnings.append({"column": str(col), "reason": f"Very high correlation with target ({corr:.3f})"})
    return warnings
