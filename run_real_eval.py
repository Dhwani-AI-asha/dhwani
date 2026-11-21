"""
run_real_eval.py  (put this file in the project root, next to the ai_medical folder)

Runs the Dhwani evaluation with the real Gemini model and saves the results.

Usage (from the project folder, in PowerShell):
  python run_real_eval.py 3              first 3 cases (quick check, default)
  python run_real_eval.py all            all cases
  python run_real_eval.py TC-07,TC-10    specific case IDs

Reads LLM_API_KEY, LLM_MODEL and LLM_TIMEOUT from the environment, or from
the .env file if they are not already set. Keys are never printed.
Scores measure agreement with SYNTHETIC expected outputs only. They are not
clinical validation.
"""

import json
import os
import sys
import time


def load_env_file(path: str = ".env") -> None:
    """Tiny .env reader: sets variables that are not already set."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip('"').strip("'")
            if name and value and name not in os.environ:
                os.environ[name] = value


load_env_file()

from ai_medical.evaluation_dataset import (  # noqa: E402
    get_all_test_cases,
    get_test_case_by_id,
)
from ai_medical.evaluation_runner import run_evaluation  # noqa: E402
from ai_medical.model_client import call_model  # noqa: E402

PAUSE_SECONDS = 1.0  # gentle pacing to avoid rate limits


def paced_model(system_prompt: str, user_prompt: str) -> str:
    time.sleep(PAUSE_SECONDS)
    return call_model(system_prompt, user_prompt)


def pick_cases(arg: str):
    all_cases = get_all_test_cases()
    if arg.lower() == "all":
        return all_cases
    if arg.isdigit():
        return all_cases[: int(arg)]
    chosen = []
    for case_id in arg.split(","):
        case = get_test_case_by_id(case_id.strip())
        if case is None:
            sys.exit(f"Unknown case id: {case_id}")
        chosen.append(case)
    return chosen


def main() -> None:
    if not os.getenv("LLM_API_KEY") or not os.getenv("LLM_MODEL"):
        sys.exit("LLM_API_KEY and LLM_MODEL must be set (environment or .env).")

    arg = sys.argv[1] if len(sys.argv) > 1 else "3"
    cases = pick_cases(arg)
    print(f"Model: {os.getenv('LLM_MODEL')}")
    print(f"Running {len(cases)} case(s). This can take a few minutes...")

    started = time.time()
    summary = run_evaluation(model_callable=paced_model, dataset=cases)
    elapsed = time.time() - started

    result = summary.to_dict()
    out_name = f"eval_results_{int(started)}.json"
    with open(out_name, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False, default=str)

    print(f"\nFinished in {elapsed:.0f}s. Full results saved to {out_name}")
    overview = {k: v for k, v in result.items() if k != "case_results"}
    print("\nSUMMARY")
    print(json.dumps(overview, indent=2, ensure_ascii=False, default=str))

    case_results = result.get("case_results", [])
    print(f"\nPER-CASE (first keys of each result, {len(case_results)} cases)")
    for item in case_results:
        short = {
            k: v
            for k, v in item.items()
            if not isinstance(v, (dict, list)) or k in ("errors", "error")
        }
        print(json.dumps(short, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
