"""
Train a global LightGBM model across all store/SKU series.

Usage:
    python -m src.models.train_lightgbm --config configs/config.yaml
"""
import argparse

import lightgbm as lgb
import pandas as pd

from src.evaluation.metrics import wmape
from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)

CATEGORICAL_CANDIDATES = ["store_id", "item_id", "state_id", "cat_id", "dept_id", "state_holiday"]


def make_splits(df: pd.DataFrame, date_col: str, cfg: dict):
    train_end = pd.to_datetime(cfg["split"]["train_end"])
    valid_end = pd.to_datetime(cfg["split"]["valid_end"])
    test_end = pd.to_datetime(cfg["split"]["test_end"])

    train = df[df[date_col] <= train_end]
    valid = df[(df[date_col] > train_end) & (df[date_col] <= valid_end)]
    test = df[(df[date_col] > valid_end) & (df[date_col] <= test_end)]
    return train, valid, test


def get_feature_cols(df: pd.DataFrame, target_col: str, date_col: str, id_cols: list) -> list:
    drop_cols = {target_col, date_col} | set()
    return [c for c in df.columns if c not in drop_cols]


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])
    models_dir = ensure_dir("models")
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    df = pd.read_parquet(processed_dir / "features.parquet")
    date_col, target_col, id_cols = cfg["date_col"], cfg["target_col"], cfg["id_cols"]

    train, valid, test = make_splits(df, date_col, cfg)
    feature_cols = get_feature_cols(df, target_col, date_col, id_cols)
    cat_features = [c for c in CATEGORICAL_CANDIDATES if c in feature_cols]

    for c in cat_features:
        df[c] = df[c].astype("category")
    train, valid, test = make_splits(df, date_col, cfg)  # re-split after dtype change

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

    test_preds = model.predict(test[feature_cols], num_iteration=model.best_iteration)
    test_wmape = wmape(test[target_col].values, test_preds)
    logger.info(f"Test WMAPE: {test_wmape:.4f}")

    out = test[id_cols + [date_col, target_col]].copy()
    out["y_pred"] = test_preds
    out.to_parquet(reports_dir / "lightgbm_predictions.parquet", index=False)

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
