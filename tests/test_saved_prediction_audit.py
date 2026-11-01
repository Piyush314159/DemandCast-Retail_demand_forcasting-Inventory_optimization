import unittest
import pandas as pd

from src.evaluation.audit_saved_predictions import audit_frames
from src.models.reconcile import bottom_up_reconcile, mint_diagonal_reconcile


class AuditTests(unittest.TestCase):
    def frame(self):
        return pd.DataFrame({"store_id": [1, 1], "item_id": [1, 1],
                             "date": ["2020-01-01", "2020-01-02"],
                             "sales": [10., 20.], "y_pred": [8., 22.]})

    def test_common_keys_and_metrics(self):
        result = audit_frames({"a": self.frame(), "b": self.frame().iloc[1:]})
        self.assertEqual(result["shared_observations"], 1)
        self.assertEqual(result["metrics"]["a"]["wmape_percent"], 10.)
        self.assertEqual(result["metrics"]["a"]["excluded_rows"], 1)

    def test_invalid_artifacts_are_rejected(self):
        for kind in ("duplicate", "truth", "nonfinite"):
            with self.subTest(kind=kind):
                other = self.frame()
                if kind == "duplicate": other = pd.concat([other, other])
                if kind == "truth": other.loc[0, "sales"] = 99
                if kind == "nonfinite": other.loc[0, "y_pred"] = float("nan")
                with self.assertRaises(ValueError):
                    audit_frames({"a": self.frame(), "b": other})

    def test_bottom_up_preserves_units_and_mint_rejects(self):
        frame = self.frame().drop(columns="sales")
        result = bottom_up_reconcile(frame, ["item_id", "store_id"], "y_pred")
        self.assertEqual(result.loc[result.level == "store_id", "y_pred"].sum(), 30.)
        with self.assertRaises(NotImplementedError):
            mint_diagonal_reconcile(frame, ["item_id", "store_id"], "y_pred", "sales")
