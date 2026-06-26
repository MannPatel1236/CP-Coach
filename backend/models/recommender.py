"""Recommendation engine."""

import math

from data.topic_graph import CPTopicGraph


class Recommender:
    """Graph-aware problem recommender with prerequisite gating."""

    TOPIC_MATCH_WEIGHT = 100_000
    DEFAULT_MASTERY_THRESHOLD = 0.6
    STRETCH_MULTIPLIER = 2

    def __init__(self, topic_graph: CPTopicGraph, mastery_threshold=0.6, difficulty_band=350):
        self.topic_graph = topic_graph
        self.mastery_threshold = mastery_threshold
        self.difficulty_band = difficulty_band

    def recommend(
        self,
        user_rating: int,
        mastery_scores: dict[str, float],
        solved_problem_ids: set[str],
        all_problems: list[dict],
        focus_topics: list[str] | None = None,
        platforms: list[str] | None = None,
        top_k: int = 20,
    ) -> list[dict]:
        if platforms is None:
            platforms = ["cf"]

        # ── 1. WEAK TOPIC DETECTION ──────────────────────────────────
        if focus_topics:
            weak_topics = list(focus_topics)
        else:
            weak_topics = sorted(
                [t for t, m in mastery_scores.items() if m < self.mastery_threshold],
                key=lambda t: mastery_scores[t],
            )
            if not weak_topics:
                # Take bottom 3 by mastery score
                weak_topics = sorted(mastery_scores, key=lambda t: mastery_scores[t])[:3]

        # ── 2. PREREQUISITE GATING ───────────────────────────────────
        final_topics = []
        for topic in weak_topics:
            if self.topic_graph.are_prerequisites_met(topic, mastery_scores, threshold=0.5):
                # threshold 0.5 — 10% gap from weak-area detection (0.6 in preprocessor.py).
                # Topics with 0.5-0.6 mastery may pass gating but aren't flagged as weak.
                final_topics.append(topic)
            else:
                unmet = [
                    p for p in self.topic_graph.get_prerequisites(topic)
                    if mastery_scores.get(p, 0) < 0.5
                ]
                final_topics.extend(unmet)
        # Deduplicate preserving order
        final_topics = list(dict.fromkeys(final_topics))

        # ── 3. PROBLEM FILTERING (normal range) ─────────────────────
        lo = max(800, user_rating - 100)
        hi = user_rating + self.difficulty_band
        # Expand lower bound for LC to include EASY (1000) problems at lower ratings
        lo_lc = max(800, user_rating - 250)

        normal_pool = []
        for p in all_problems:
            if p["platform"] not in platforms:
                continue
            if p["problem_id"] in solved_problem_ids:
                continue
            if not any(t in final_topics for t in p.get("topics", [])):
                continue
            diff = p.get("difficulty")
            if diff is None:
                continue
            # Use LC-friendly lower bound for LC problems
            lo_ = lo_lc if p["platform"] == "lc" else lo
            if not (lo_ <= diff <= hi):
                continue
            p_copy = dict(p)
            p_copy["matched_topics"] = [t for t in p.get("topics", []) if t in final_topics]
            p_copy["is_stretch"] = False
            matched = len(p_copy["matched_topics"])
            p_copy["rank_score"] = (matched * self.TOPIC_MATCH_WEIGHT) + math.log1p(p.get("solve_count", 0))
            normal_pool.append(p_copy)

        # ── 4. RANKING ───────────────────────────────────────────────
        normal_pool.sort(key=lambda p: p.get("rank_score", 0), reverse=True)

        # ── 5. STRETCH FALLBACK ──────────────────────────────────────
        if len(normal_pool) < 5:
            hi_stretch = user_rating + self.difficulty_band * self.STRETCH_MULTIPLIER
            normal_ids = {p["problem_id"] for p in normal_pool}
            for p in all_problems:
                if p["platform"] not in platforms:
                    continue
                if p["problem_id"] in solved_problem_ids:
                    continue
                if p["problem_id"] in normal_ids:
                    continue
                if not any(t in final_topics for t in p.get("topics", [])):
                    continue
                diff = p.get("difficulty")
                if diff is not None and not ((lo_lc if p["platform"] == "lc" else lo) <= diff <= hi_stretch):
                    continue
                p_copy = dict(p)
                p_copy["matched_topics"] = [t for t in p.get("topics", []) if t in final_topics]
                p_copy["is_stretch"] = True
                matched = len(p_copy["matched_topics"])
                p_copy["rank_score"] = (matched * self.TOPIC_MATCH_WEIGHT) + math.log1p(p.get("solve_count", 0))
                normal_pool.append(p_copy)

        # ── 6. ABSOLUTE FALLBACK ─────────────────────────────────────
        if len(normal_pool) < 5:
            sorted_problems = sorted(all_problems, key=lambda x: (
                len([t for t in x.get("topics", []) if t in final_topics]) * self.TOPIC_MATCH_WEIGHT +
                math.log1p(x.get("solve_count", 0))
            ), reverse=True)
            normal_ids = {p["problem_id"] for p in normal_pool}
            for p in sorted_problems:
                if p["problem_id"] in solved_problem_ids:
                    continue
                if p["platform"] not in platforms:
                    continue
                if p["problem_id"] in normal_ids:
                    continue
                p_copy = dict(p)
                p_copy["matched_topics"] = [t for t in p.get("topics", []) if t in final_topics]
                p_copy["is_stretch"] = True
                matched = len(p_copy["matched_topics"])
                p_copy["rank_score"] = (matched * self.TOPIC_MATCH_WEIGHT) + math.log1p(p.get("solve_count", 0))
                normal_pool.append(p_copy)
                normal_ids.add(p["problem_id"])
                if len(normal_pool) >= top_k:
                    break

        # ── 7. PLATFORM INTERLEAVING ───────────────────────────────────
        if set(platforms) == {"cf", "lc"}:
            cf_problems = [p for p in normal_pool if p.get("platform") == "cf"]
            lc_problems = [p for p in normal_pool if p.get("platform") == "lc"]
            interleaved = []
            cf_idx, lc_idx = 0, 0
            while len(interleaved) < top_k and (cf_idx < len(cf_problems) or lc_idx < len(lc_problems)):
                if cf_idx < len(cf_problems) and len(interleaved) < top_k:
                    interleaved.append(cf_problems[cf_idx])
                    cf_idx += 1
                if lc_idx < len(lc_problems) and len(interleaved) < top_k:
                    interleaved.append(lc_problems[lc_idx])
                    lc_idx += 1
            normal_pool = interleaved

        # ── 8. RETURN ────────────────────────────────────────────────
        results = normal_pool[:top_k]
        return [
            {
                "problem_id": p["problem_id"],
                "platform": p["platform"],
                "name": p.get("name", ""),
                "difficulty": p.get("difficulty"),
                "topics": p.get("topics", []),
                "solve_count": p.get("solve_count", 0),
                "url": p.get("url", ""),
                "matched_topics": p["matched_topics"],
                "is_stretch": p["is_stretch"],
            }
            for p in results
        ]
