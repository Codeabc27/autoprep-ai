import numpy as np
import pandas as pd
from app.modules.splitting.service import build_and_fit_pipeline, split_dataframe


def test_split_before_fit_prevents_test_leakage():
    # Train values are ~10, test/val will contain an extreme outlier 100000
    rng = np.random.default_rng(42)
    df = pd.DataFrame({
        "feature_a": np.concatenate([rng.normal(10.0, 1.0, 80), np.array([100000.0] * 20)]),
        "cat_b": ["x", "y"] * 50,
        "target": [0, 1] * 50,
    })
    train_df, val_df, test_df = split_dataframe(
        df, target_column="target", strategy="time_based", train_ratio=0.7, val_ratio=0.15, test_ratio=0.15
    )
    steps = [
        {"operation_type": "impute_missing", "parameters": {"numeric_strategy": "median"}},
        {"operation_type": "scale_numeric", "parameters": {"method": "standard"}},
        {"operation_type": "encode_categorical", "parameters": {"method": "onehot"}},
    ]
    pipe, train_out, val_out, test_out, report = build_and_fit_pipeline(
        train_df, val_df, test_df, target_column="target", steps=steps
    )
    # Train mean should be ~0, while test_out with 100000 must be huge (NOT normalized using test outlier!)
    assert abs(train_out["num__feature_a"].mean()) < 1e-6
    assert test_out["num__feature_a"].max() > 1000.0
    assert report["train_nans"] == 0
    assert report["test_nans"] == 0
