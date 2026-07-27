"""
End-to-end pipeline runner for the demand-forecasting project.

Runs all stages in the correct order using a single config file.

Usage
-----
# Run the full pipeline:
    python run_pipeline.py

# Run only specific stages:
    python run_pipeline.py --only load_data build_features lightgbm

# Skip specific stages (e.g. slow baselines):
    python run_pipeline.py --skip sarima prophet

# Use a custom config:
    python run_pipeline.py --config configs/config.yaml

Available stage names:
    load_data       - Load & clean raw CSV data
    build_features  - Engineer lag / rolling / calendar features
    naive           - Naive (last-value) baseline
    sarima          - SARIMA baseline  (slow)
    prophet         - Prophet baseline (slow)
    lightgbm        - LightGBM main model
    reconcile       - Hierarchical forecast reconciliation
"""

import argparse
import time
import traceback

# ---------------------------------------------------------------------------
# Stage registry — order matters!  Later stages depend on earlier outputs.
# ---------------------------------------------------------------------------
STAGES = [
    "load_data",
    "build_features",
    "naive",
    "sarima",
    "prophet",
    "lightgbm",
    "reconcile",
]


def _import_mains():
    """Lazy imports so missing optional deps only fail for the relevant stage."""
    from src.data.load_data import main as load_data
    from src.features.build_features import main as build_features
    from src.models.baseline_naive import main as naive
    from src.models.baseline_sarima import main as sarima
    from src.models.baseline_prophet import main as prophet
    from src.models.train_lightgbm import main as lightgbm
    from src.models.reconcile import main as reconcile

    return {
        "load_data": load_data,
        "build_features": build_features,
        "naive": naive,
        "sarima": sarima,
        "prophet": prophet,
        "lightgbm": lightgbm,
        "reconcile": reconcile,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def _banner(text: str, color: str = CYAN) -> None:
    line = "─" * 60
    print(f"\n{color}{BOLD}{line}{RESET}")
    print(f"{color}{BOLD}  {text}{RESET}")
    print(f"{color}{BOLD}{line}{RESET}")


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    m, s = divmod(int(seconds), 60)
    return f"{m}m {s}s"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the full demand-forecasting pipeline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--config",
        default="configs/config.yaml",
        help="Path to YAML config (default: configs/config.yaml)",
    )
    parser.add_argument(
        "--only",
        nargs="+",
        metavar="STAGE",
        help="Run ONLY these stages (space-separated). All others are skipped.",
    )
    parser.add_argument(
        "--skip",
        nargs="+",
        metavar="STAGE",
        help="Skip these stages (space-separated). All others run.",
    )
    args = parser.parse_args()

    # Validate stage names
    all_names = set(STAGES)
    for flag_name, values in [("--only", args.only or []), ("--skip", args.skip or [])]:
        bad = set(values) - all_names
        if bad:
            parser.error(
                f"{flag_name} contains unknown stage(s): {bad}\n"
                f"Valid stages: {STAGES}"
            )

    # Build the run list
    if args.only:
        # preserve canonical order even if user listed them out of order
        run_stages = [s for s in STAGES if s in set(args.only)]
    else:
        skip_set = set(args.skip or [])
        run_stages = [s for s in STAGES if s not in skip_set]

    skipped = [s for s in STAGES if s not in run_stages]

    _banner(f"Demand Forecasting Pipeline  —  config: {args.config}")
    print(f"  {GREEN}Run   :{RESET} {run_stages}")
    if skipped:
        print(f"  {YELLOW}Skip  :{RESET} {skipped}")

    mains = _import_mains()

    # ------------------------------------------------------------------
    # Execute stages
    # ------------------------------------------------------------------
    results = {}       # stage -> ("ok" | "skipped" | "failed")
    pipeline_start = time.time()

    for stage in STAGES:
        if stage not in run_stages:
            results[stage] = "skipped"
            continue

        _banner(f"[{STAGES.index(stage) + 1}/{len(STAGES)}]  {stage}", color=CYAN)
        t0 = time.time()
        try:
            mains[stage](args.config)
            elapsed = _fmt_elapsed(time.time() - t0)
            print(f"\n{GREEN}✓ {stage} completed in {elapsed}{RESET}")
            results[stage] = "ok"
        except Exception as exc:
            elapsed = _fmt_elapsed(time.time() - t0)
            print(f"\n{RED}✗ {stage} FAILED after {elapsed}{RESET}")
            traceback.print_exc()
            results[stage] = f"failed: {exc}"
            # Abort — downstream stages depend on this output
            print(f"\n{RED}{BOLD}Pipeline aborted.{RESET} Fix the error above and re-run.")
            break

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    total_elapsed = _fmt_elapsed(time.time() - pipeline_start)
    _banner(f"Pipeline Summary  —  total time: {total_elapsed}")

    all_ok = True
    for stage in STAGES:
        status = results.get(stage, "skipped")
        if status == "ok":
            icon, color = "✓", GREEN
        elif status == "skipped":
            icon, color = "–", YELLOW
        else:
            icon, color = "✗", RED
            all_ok = False
        print(f"  {color}{icon}  {stage:<20} {status}{RESET}")

    print()
    if all_ok:
        print(f"{GREEN}{BOLD}All stages completed successfully.{RESET}")
    else:
        print(f"{RED}{BOLD}Pipeline finished with errors. See above.{RESET}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
