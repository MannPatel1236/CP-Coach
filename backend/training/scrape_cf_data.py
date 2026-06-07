"""
scrape_cf_data.py — Collect Codeforces submission sequences for Graph-DKT training.

Produces a CSV that train_dkt.py reads directly:
  user_id         sequential integer (not the CF handle)
  topic           one of 29 canonical CP topic names
  solved          1 = accepted, 0 = any other verdict
  difficulty      problem rating ÷ 4000  (float, 0–1)
  timestamp_delta days since this user's previous submission (0.0 for first)

Multi-tag problems expand into one row per canonical topic. The first tag of each
submission carries the real time delta; co-tags of the same submission get 0.0
(they are simultaneous). Unknown/unrated problems are skipped.

Usage:
  # from repo root or backend/
  python training/scrape_cf_data.py --users 500 --out data/training.csv
  python training/scrape_cf_data.py --users 1000 --out data/training.csv
  python training/scrape_cf_data.py --resume --out data/training.csv  # after a crash
  python training/scrape_cf_data.py --analyze --out data/training.csv  # stats only

Target dataset sizes for the paper:
  Minimum (proof-of-concept) : 200 users  ~40K rows   ~3 min
  Good (paper-quality)       : 500 users  ~100K rows  ~8 min
  Strong                     : 1000 users ~200K rows  ~15 min
"""

from __future__ import annotations

import argparse
import asyncio
import collections
import csv
import json
import os
import random
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import httpx

from data.preprocessor import Preprocessor
from data.topic_graph import CPTopicGraph
from platforms.normalizer import Normalizer

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

CF_API          = "https://codeforces.com/api"
REQ_DELAY       = 0.45          # seconds between each request (≈ 2.2 req/s, safe under CF's 5/s)
MAX_CONCURRENT  = 3             # parallel user.status fetches
MAX_SUBS        = 8000          # match the app's deep-mode page limit
TIMEOUT_SECS    = 30            # per-request timeout

# Stratified sample buckets: (min_rating, max_rating, target_fraction)
# Designed to cover all skill levels proportionally.
STRATA = [
    (800,  1400, 0.20),   # Newbie / Pupil
    (1400, 1700, 0.30),   # Specialist
    (1700, 2100, 0.30),   # Expert / Candidate Master
    (2100, 9999, 0.20),   # Master and above
]

# Reuse backend's Normalizer + Preprocessor so the scraper can never drift
# out of sync with /api/analyze's pipeline. The scraper adds `canonical_only=True`
# to drop non-29-topic rows, and writes one CSV row per (user, submission, topic)
# — matching `train_dkt.py`'s expected schema.

_NORMALIZER = Normalizer()
_PREPROCESSOR = Preprocessor()


# ─────────────────────────────────────────────────────────────────────────────
# User sampling
# ─────────────────────────────────────────────────────────────────────────────

def _stratified_sample(users: list[dict], n: int, seed: int) -> list[str]:
    """
    Sample n handles with the rating distribution defined by STRATA.
    Falls back to uniform if a bucket is underrepresented.
    """
    rng = random.Random(seed)
    buckets: dict[int, list[str]] = {i: [] for i in range(len(STRATA))}
    for u in users:
        r = u.get("rating", 0)
        for i, (lo, hi, _) in enumerate(STRATA):
            if lo <= r < hi:
                buckets[i].append(u["handle"])
                break

    result: list[str] = []
    for i, (_, _, frac) in enumerate(STRATA):
        want = round(n * frac)
        pool = buckets[i][:]
        rng.shuffle(pool)
        result.extend(pool[:want])

    # Top-up if any stratum was undersized
    if len(result) < n:
        used = set(result)
        remaining = [u["handle"] for u in users if u["handle"] not in used]
        rng.shuffle(remaining)
        result.extend(remaining[: n - len(result)])

    rng.shuffle(result)
    return result[:n]


# ─────────────────────────────────────────────────────────────────────────────
# API helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_rated_list(client: httpx.AsyncClient) -> list[dict]:
    print("[1/3] Fetching CF rated user list …", flush=True)
    resp = await client.get(
        f"{CF_API}/user.ratedList",
        params={"activeOnly": "true", "includeRetired": "false"},
        timeout=90.0,
    )
    resp.raise_for_status()
    data = resp.json()
    if data["status"] != "OK":
        raise RuntimeError(f"CF API error: {data.get('comment', 'unknown')}")
    total = len(data["result"])
    print(f"    {total:,} active rated users found.", flush=True)
    return data["result"]


async def _fetch_one(
    client: httpx.AsyncClient,
    handle: str,
    sem: asyncio.Semaphore,
) -> tuple[str, list]:
    """Fetch submissions for a single handle, rate-limited by semaphore."""
    async with sem:
        await asyncio.sleep(REQ_DELAY)   # throttle inside the semaphore
        try:
            resp = await client.get(
                f"{CF_API}/user.status",
                params={"handle": handle, "from": 1, "count": MAX_SUBS},
                timeout=TIMEOUT_SECS,
            )
            data = resp.json()
        except Exception:
            return handle, []
    return handle, data.get("result", []) if data.get("status") == "OK" else []


# ─────────────────────────────────────────────────────────────────────────────
# Submission processing
# ─────────────────────────────────────────────────────────────────────────────

def _process(
    user_id: int,
    raw_submissions: list,
    min_solved: int = 30,
) -> Optional[list[dict]]:
    """
    Convert raw CF submissions for one user into training rows.

    Delegates tag normalization and feature engineering to the shared
    Normalizer + Preprocessor so this stays byte-identical to /api/analyze.
    Drops any row whose topic is not in CPTopicGraph.TOPICS (canonical_only=True).
    Returns None if the user has < min_solved accepted problems.
    """
    if not raw_submissions:
        return None

    # Filter to accepted-only first so the min_solved count matches solved-pid set
    solved_pids = {
        f"{s['problem'].get('contestId','X')}{s['problem']['index']}"
        for s in raw_submissions if s.get("verdict") == "OK"
    }
    if len(solved_pids) < min_solved:
        return None

    normalized = [_NORMALIZER.normalize_cf_submission(s) for s in raw_submissions]
    # Drop None entries (unparseable submissions) and entries with no topics
    normalized = [n for n in normalized if n and n.get("topics")]
    if not normalized:
        return None

    sequence = _PREPROCESSOR.build_submission_sequence(normalized, canonical_only=True)
    if not sequence:
        return None

    return [
        {
            "user_id":         user_id,
            "topic":           step["topic"],
            "solved":          step["solved"],
            "difficulty":      step["difficulty"],
            "timestamp_delta": step["timestamp_delta"],
            "weight":          step["weight"],
        }
        for step in sequence
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Checkpoint helpers
# ─────────────────────────────────────────────────────────────────────────────

def _meta_path(out: Path) -> Path:
    return out.with_suffix(".meta.json")


def _load_checkpoint(out: Path) -> tuple[set[str], int]:
    """Returns (already-done handles, next user_id)."""
    meta = _meta_path(out)
    if meta.exists():
        m = json.loads(meta.read_text())
        return set(m.get("done", [])), m.get("next_uid", 0)
    return set(), 0


def _save_checkpoint(out: Path, done: set[str], next_uid: int) -> None:
    """Atomically write the checkpoint sidecar.

    Writes to a temp file in the same directory, then renames via os.replace
    (which is atomic on POSIX). If the write fails, the temp file is removed
    and the existing .meta.json is left untouched.
    """
    meta = _meta_path(out)
    fd, tmp = tempfile.mkstemp(dir=meta.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump({"done": sorted(done), "next_uid": next_uid}, f, indent=2)
        os.replace(tmp, meta)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


# ─────────────────────────────────────────────────────────────────────────────
# Stats / analysis
# ─────────────────────────────────────────────────────────────────────────────

def _analyze(out: Path) -> None:
    """Print statistics about an existing training CSV."""
    if not out.exists():
        print(f"File not found: {out}")
        sys.exit(1)

    print(f"\nAnalyzing {out} …\n")
    users: dict[int, int]   = collections.defaultdict(int)   # user_id → row count
    topics: dict[str, int]  = collections.defaultdict(int)   # topic → row count
    solved_counts            = collections.Counter()          # 0 or 1
    total_rows               = 0

    with open(out) as f:
        reader = csv.DictReader(f)
        for row in reader:
            uid = int(row["user_id"])
            users[uid]          += 1
            topics[row["topic"]] += 1
            solved_counts[int(row["solved"])] += 1
            total_rows          += 1

    seq_lengths = sorted(users.values())
    n_users = len(seq_lengths)

    print(f"  Total rows    : {total_rows:,}")
    print(f"  Total users   : {n_users:,}")
    print(f"  Avg seq length: {total_rows / max(n_users, 1):.0f}")
    print(f"  Median seq len: {seq_lengths[n_users // 2] if seq_lengths else 0}")
    print(f"  Min seq length: {seq_lengths[0] if seq_lengths else 0}")
    print(f"  Max seq length: {seq_lengths[-1] if seq_lengths else 0}")
    print(f"  Solved rate   : {100 * solved_counts[1] / max(total_rows, 1):.1f}%")
    print("\n  Topic distribution (top 15):")
    for topic, cnt in sorted(topics.items(), key=lambda x: -x[1])[:15]:
        bar = "█" * int(30 * cnt / (max(topics.values()) if topics else 1))
        print(f"    {topic:<25}  {cnt:>6,}  {bar}")

    missing = set(CPTopicGraph.TOPICS) - set(topics.keys())
    if missing:
        print(f"\n  Topics with ZERO rows (may need more users): {sorted(missing)}")
    print()


# ─────────────────────────────────────────────────────────────────────────────
# Main scrape loop
# ─────────────────────────────────────────────────────────────────────────────

async def _scrape(args: argparse.Namespace) -> None:
    out  = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    done, next_uid = _load_checkpoint(out) if args.resume else (set(), 0)
    if done:
        print(f"[resume] {len(done):,} handles already scraped → skipping.", flush=True)

    write_header = not out.exists() or not done
    csv_file = open(out, "a", newline="", encoding="utf-8")
    writer   = csv.DictWriter(
        csv_file,
        fieldnames=["user_id", "topic", "solved", "difficulty", "timestamp_delta", "weight"],
    )
    if write_header:
        writer.writeheader()

    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": "cp-coach-research/1.0 (academic)"},
            follow_redirects=True,
        ) as client:

            # ── Step 1: rated user list ───────────────────────────────────────
            all_users = await _get_rated_list(client)

            # ── Step 2: stratified sample ─────────────────────────────────────
            print(f"[2/3] Sampling {args.users} handles (stratified by rating) …", flush=True)
            handles = _stratified_sample(all_users, args.users, args.seed)
            handles = [h for h in handles if h not in done]
            print(f"    {len(handles):,} new handles to fetch.", flush=True)

            if not handles:
                print("Nothing new to scrape. Use --users N to increase the target.", flush=True)
                return

            # Assign deterministic user_ids up front so resume is consistent
            handle_to_uid = {h: next_uid + i for i, h in enumerate(handles)}

            # ── Step 3: fetch + process ───────────────────────────────────────
            print(
                f"[3/3] Fetching submissions "
                f"(concurrency={MAX_CONCURRENT}, delay={REQ_DELAY}s/req) …\n",
                flush=True,
            )
            sem   = asyncio.Semaphore(MAX_CONCURRENT)
            tasks = [_fetch_one(client, h, sem) for h in handles]

            included = excluded = total_rows = 0
            t0 = time.time()

            for i, coro in enumerate(asyncio.as_completed(tasks)):
                handle, subs = await coro
                uid          = handle_to_uid[handle]

                rows = _process(uid, subs, min_solved=args.min_solved)
                if rows is None:
                    excluded += 1
                else:
                    # Checkpoint first: if killed before the CSV write, the
                    # worst case is "data lost, not duplicated" — recoverable
                    # by removing the handle from the .meta.json. The reverse
                    # order (CSV first) would produce duplicate rows on resume.
                    done.add(handle)
                    _save_checkpoint(out, done, next_uid + i + 1)

                    writer.writerows(rows)
                    csv_file.flush()
                    included  += 1
                    total_rows += len(rows)

                n_done = i + 1
                if n_done % 10 == 0 or n_done == len(handles):
                    elapsed  = time.time() - t0
                    per_user = elapsed / n_done
                    eta      = per_user * (len(handles) - n_done)
                    print(
                        f"  {n_done:>4}/{len(handles)}  "
                        f"included={included}  excluded={excluded}  "
                        f"rows={total_rows:,}  "
                        f"ETA={eta:.0f}s",
                        flush=True,
                    )

    finally:
        csv_file.close()

    elapsed_total = time.time() - t0 if "t0" in dir() else 0
    print(f"\n{'─'*60}")
    print(f"  Done in {elapsed_total:.0f}s")
    print(f"  Included : {included} users")
    print(f"  Excluded : {excluded} users  (< {args.min_solved} solved or API error)")
    print(f"  Rows     : {total_rows:,}")
    print(f"  Output   : {out}")
    print(f"{'─'*60}")
    print("\nNext steps:")
    print("  1. Check the data:")
    print(f"       python training/scrape_cf_data.py --analyze --out {out}")
    print("  2. Train the model (from backend/):")
    print(f"       python training/train_dkt.py --data {out} --model graph_dkt --epochs 50 --out weights/graph_dkt.pt")
    print("  3. Run compare_models() to get paper numbers:")
    print(f"       python training/evaluate.py --data {out} --weights weights/graph_dkt.pt")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--users", type=int, default=500,
        help="Target number of CF users to scrape (default: 500)",
    )
    p.add_argument(
        "--out", default="data/training.csv",
        help="Output CSV path, relative to backend/ (default: data/training.csv)",
    )
    p.add_argument(
        "--resume", action="store_true",
        help="Resume a previous interrupted scrape (reads .meta.json sidecar)",
    )
    p.add_argument(
        "--analyze", action="store_true",
        help="Print statistics about an existing CSV and exit (no scraping)",
    )
    p.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducible user sampling (default: 42)",
    )
    p.add_argument(
        "--min-solved", type=int, default=30,
        help="Minimum accepted problems to include a user (default: 30)",
    )
    return p


def main() -> None:
    args = _build_parser().parse_args()

    out = Path(args.out)

    if args.analyze:
        _analyze(out)
        return

    if not args.resume and out.exists():
        ans = input(f"{out} already exists. Overwrite? [y/N] ").strip().lower()
        if ans != "y":
            print("Aborted. Use --resume to continue where you left off.")
            sys.exit(0)
        out.unlink()
        _meta_path(out).unlink(missing_ok=True)

    asyncio.run(_scrape(args))


if __name__ == "__main__":
    main()
