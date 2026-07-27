import numpy as np

from src.evaluation.metrics import wmape, mape, rmse, bias


def test_wmape_perfect_forecast():
    y_true = np.array([10, 20, 30])
    y_pred = np.array([10, 20, 30])
    assert wmape(y_true, y_pred) == 0


def test_wmape_known_value():
    y_true = np.array([10, 20, 30])
    y_pred = np.array([12, 18, 33])
    # errors: 2, 2, 3 -> sum 7; actual sum 60 -> 7/60
    assert np.isclose(wmape(y_true, y_pred), 7 / 60)


def test_rmse_zero_for_perfect_forecast():
    y_true = np.array([5, 5, 5])
    y_pred = np.array([5, 5, 5])
    assert rmse(y_true, y_pred) == 0


def test_bias_direction():
    y_true = np.array([10, 10])
    y_pred = np.array([12, 12])  # over-forecasting
    assert bias(y_true, y_pred) > 0


def test_mape_basic():
    y_true = np.array([10, 20])
    y_pred = np.array([10, 20])
    assert np.isclose(mape(y_true, y_pred), 0)
