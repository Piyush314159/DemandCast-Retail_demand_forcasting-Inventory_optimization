"""
Train a global LightGBM model across all store/SKU series.

Usage:
    python -m src.models.train_lightgbm --config configs/config.yaml
"""
import argparse
import hashlib
import json

import pandas as pd

from src.evaluation.metrics import wmape
from src.data.database import write_frame
from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)

CATEGORICAL_CANDIDATES = ["store_id", "item_id", "state_id", "cat_id", "dept_id", "state_holiday"]


def make_splits(df: pd.DataFrame, date_col: str, cfg: dict):
    train_end = pd.to_datetime(cfg["split"]["train_end"])
    valid_end = pd.to_datetime(cfg["split"]["valid_end"])
    test_end = pd.to_datetime(cfg["split"]["test_end"])
    if not train_end < valid_end < test_end:
        raise ValueError("Split dates must satisfy train_end < valid_end < test_end")

    train = df[df[date_col] <= train_end]
    valid = df[(df[date_col] > train_end) & (df[date_col] <= valid_end)]
    test = df[(df[date_col] > valid_end) & (df[date_col] <= test_end)]
    if any(part.empty for part in (train, valid, test)):
        raise ValueError("Training, validation and test windows must all contain observations")
    return train, valid, test


def get_feature_cols(df: pd.DataFrame, target_col: str, date_col: str, id_cols: list) -> list:
    """Return model feature columns, excluding target, date, and id columns."""
    # Same-day customer count is observed after sales, not known at forecast time.
    # M5's original row identifier is also metadata rather than a covariate.
    drop_cols = {target_col, date_col, "Customers", "customers", "id"} | set(id_cols)
    return [c for c in df.columns if c not in drop_cols]


def main(config_path: str) -> None:
    import lightgbm as lgb
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])
    models_dir = ensure_dir(cfg.get("models_dir", "models"))
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    df = pd.read_parquet(processed_dir / "features.parquet")
    date_col, target_col, id_cols = cfg["date_col"], cfg["target_col"], cfg["id_cols"]

    feature_cols = get_feature_cols(df, target_col, date_col, id_cols)

    train, valid, test = (part.copy() for part in make_splits(df, date_col, cfg))
    # Learn category vocabularies from training rows only; unseen labels get -1.
    # pd.api.types.is_numeric_dtype handles object, ArrowDtype strings,
    # StringDtype, category, etc. — regardless of parquet backend used.
    str_cols_encoded = []
    encoders = {}
    for c in feature_cols:
        if not pd.api.types.is_numeric_dtype(df[c]) and df[c].dtype != bool:
            categories = pd.Index(train[c].dropna().unique())
            encoders[c] = categories.tolist()
            for part in (train, valid, test):
                part[c] = pd.Categorical(part[c], categories=categories).codes
            str_cols_encoded.append(c)
    if str_cols_encoded:
        logger.info(f"Label-encoded {len(str_cols_encoded)} non-numeric columns: {str_cols_encoded}")

    # Mark known categoricals for LightGBM's native categorical split logic
    cat_features = [c for c in CATEGORICAL_CANDIDATES if c in feature_cols] + [
        c for c in str_cols_encoded if c not in CATEGORICAL_CANDIDATES
    ]

    lgb_train = lgb.Dataset(
        train[feature_cols], label=train[target_col], categorical_feature=cat_features
    )
    lgb_valid = lgb.Dataset(
        valid[feature_cols], label=valid[target_col], categorical_feature=cat_features,
        reference=lgb_train,
    )

    params = cfg["model"]["lightgbm"].copy()
    n_estimators = params.pop("n_estimators")
    early_stopping_rounds = params.pop("early_stopping_rounds")

    model = lgb.train(
        params,
        lgb_train,
        num_boost_round=n_estimators,
        valid_sets=[lgb_train, lgb_valid],
        valid_names=["train", "valid"],
        callbacks=[
            lgb.early_stopping(early_stopping_rounds),
            lgb.log_evaluation(period=100),
        ],
    )

    model_path = models_dir / "lightgbm_model.txt"
    model.save_model(str(model_path))
    logger.info(f"Saved model -> {model_path}")

    test_preds = model.predict(test[feature_cols], num_iteration=model.best_iteration).clip(min=0)
    test_wmape = wmape(test[target_col].values, test_preds)
    logger.info(f"Test WMAPE: {test_wmape:.4f}")

    out = test[id_cols + [date_col, target_col]].copy()
    out["y_pred"] = test_preds
    write_frame(cfg, "lightgbm_predictions", out)
    out.to_parquet(reports_dir / "lightgbm_predictions.parquet", index=False)
    metadata = {"features": feature_cols, "category_vocabularies": encoders,
                "train_end": cfg["split"]["train_end"],
                "protocol": "realized_history_features",
                "excluded_unavailable_inputs": ["Customers", "customers"],
                "forecast_sha256": hashlib.sha256((reports_dir / "lightgbm_predictions.parquet").read_bytes()).hexdigest()}
    (models_dir / "lightgbm_metadata.json").write_text(json.dumps(metadata, indent=2, default=str) + "\n")

    importance = pd.DataFrame(
        {
            "feature": feature_cols,
            "importance": model.feature_importance(importance_type="gain"),
        }
    ).sort_values("importance", ascending=False)
    importance.to_csv(reports_dir / "feature_importance.csv", index=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
