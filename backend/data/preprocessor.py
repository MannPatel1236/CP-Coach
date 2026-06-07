"""Feature engineering and recency decay preprocessing."""

from collections import defaultdict

from data.topic_graph import CPTopicGraph


def _recency_weight(idx: int, total: int) -> float:
    """Recency decay: weight=1.0 at idx=0 (most recent), weight=0.2 at oldest."""
    return 1.0 - (0.8 * idx) / max(total - 1, 1)


# Lazy: import-on-first-use to keep the module importable without torch.
_CANONICAL_TOPICS: frozenset[str] | None = None


def _get_canonical_topics() -> frozenset[str]:
    """Return the set of canonical topic names (29 entries from CPTopicGraph)."""
    global _CANONICAL_TOPICS
    if _CANONICAL_TOPICS is None:
        _CANONICAL_TOPICS = frozenset(CPTopicGraph.TOPICS)
    return _CANONICAL_TOPICS


class Preprocessor:
    """Converts normalized submissions into model-ready sequences and profiles."""

    # ── Submission sequence ──────────────────────────────────────────

    def build_submission_sequence(
        self, submissions: list[dict], canonical_only: bool = False
    ) -> list[dict]:
        """Build time-ordered sequence with recency weights matching frontend exactly.

        Args:
            submissions: normalized submissions in the shared format.
            canonical_only: if True, drop rows where topic is not in
                CPTopicGraph.TOPICS. Default False (kept for backward compat
                with /api/analyze topic profiles).
        """
        # Sort oldest first
        subs = sorted(submissions, key=lambda s: s.get("timestamp", 0))
        total = len(subs)
        if total == 0:
            return []

        canonical = _get_canonical_topics() if canonical_only else None
        sequence = []
        prev_ts = subs[0].get("timestamp", 0) / 1000  # convert ms → seconds

        for i, sub in enumerate(subs):
            if not sub.get("topics"):
                continue

            # idx=0 is most recent, idx=total-1 is oldest
            idx = total - 1 - i
            weight = _recency_weight(idx, total)

            ts_sec = sub.get("timestamp", 0) / 1000
            delta = (ts_sec - prev_ts) / 86400.0  # normalize by 1 day
            prev_ts = ts_sec

            # Emit one sequence entry per topic so all tags contribute signal
            for topic in sub["topics"]:
                if canonical is not None and topic not in canonical:
                    continue
                sequence.append({
                    "topic": topic,
                    "all_topics": sub["topics"],
                    "solved": 1 if sub.get("verdict") == "OK" else 0,
                    "difficulty": (sub.get("difficulty") or 1500) / 4000.0,
                    "timestamp_delta": max(delta, 0.0),
                    "weight": weight,
                    "platform": sub.get("platform", "cf"),
                })
        return sequence

    # ── Topic profile ────────────────────────────────────────────────

    def build_topic_profile(self, submissions: list[dict]) -> list[dict]:
        """Group normalized submissions by topic and compute per-topic stats."""
        topic_data: dict[str, dict] = defaultdict(lambda: {
            "attempted": set(),
            "solved": set(),
            "difficulties": [],
            "weights": [],
            "cf": 0,
            "lc": 0,
        })

        # Sort by timestamp (oldest first) to match sequence order
        sorted_subs = sorted(submissions, key=lambda s: s.get("timestamp", 0))
        total = len(sorted_subs)

        for idx, sub in enumerate(sorted_subs):
            pid = sub.get("problem_id", "")
            verdict = sub.get("verdict", "")
            diff = sub.get("difficulty") or 1500
            platform = sub.get("platform", "cf")

            # idx=0 is oldest, so reverse index for weight calculation (most recent = 1.0)
            rev_idx = total - 1 - idx
            weight = _recency_weight(rev_idx, total)

            for topic in sub.get("topics", []):
                td = topic_data[topic]
                # Track per-(pid, topic) so multi-tag problems count once per topic
                attempt_key = (pid, topic)
                attempted_keys = td.setdefault("_attempted_keys", set())
                if attempt_key not in attempted_keys:
                    td["attempted"].add(pid)
                    if verdict == "OK":
                        td["solved"].add(pid)
                    attempted_keys.add(attempt_key)
                td["difficulties"].append(diff)
                td["weights"].append(weight)
                td[platform] += 1

        profile = []
        for topic, td in topic_data.items():
            attempts = len(td["attempted"])
            solved = len(td["solved"])
            profile.append({
                "topic": topic,
                "attempts": attempts,
                "solved": solved,
                "solve_rate": solved / attempts if attempts > 0 else 0.0,
                "avg_difficulty": sum(td["difficulties"]) / len(td["difficulties"]) if td["difficulties"] else 0,
                "recency_weight": sum(td["weights"]) / len(td["weights"]) if td["weights"] else 0.0,
                "platform_breakdown": {"cf": td["cf"], "lc": td["lc"]},
                "solved_problems": sorted(list(td["solved"])),
            })

        profile.sort(key=lambda x: x["attempts"], reverse=True)
        return profile[:20]

    # ── Weak area detection ──────────────────────────────────────────

    def detect_weak_areas(self, topic_profile: list[dict], threshold: float = 0.65) -> list[str]:
        """Return weakest topics (max 3)."""
        weak = [t for t in topic_profile if t["solve_rate"] < threshold]
        weak.sort(key=lambda t: t["solve_rate"])

        if weak:
            return [t["topic"] for t in weak[:3]]

        # Fallback: topics with fewer than 10 solved
        low_count = [t for t in topic_profile if t["solved"] < 10]
        low_count.sort(key=lambda t: t["solved"])
        return [t["topic"] for t in low_count[:3]]
