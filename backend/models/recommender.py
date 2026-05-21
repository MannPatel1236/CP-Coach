"""Recommendation engine."""

from data.topic_graph import CPTopicGraph


class Recommender:
    """Graph-aware problem recommender with prerequisite gating."""

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
        platforms: list[str] = None,
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

        normal_pool = []
        for p in all_problems:
            if p["platform"] not in platforms:
                continue
            if p["problem_id"] in solved_problem_ids:
                continue
            if not any(t in final_topics for t in p.get("topics", [])):
                continue
            diff = p.get("difficulty")
            if diff is not None and not (lo <= diff <= hi):
                continue
            p_copy = dict(p)
            p_copy["matched_topics"] = [t for t in p.get("topics", []) if t in final_topics]
            p_copy["is_stretch"] = False
            matched = len(p_copy["matched_topics"])
            if p["platform"] == "lc":
                p_copy["rank_score"] = (matched * 100_000) + 5_000
            else:
                p_copy["rank_score"] = (matched * 100_000) + min(p.get("solve_count", 0), 10_000)
            normal_pool.append(p_copy)

        # ── 4. RANKING ───────────────────────────────────────────────
        normal_pool.sort(key=lambda p: p.get("rank_score", 0), reverse=True)

        # ── 5. STRETCH FALLBACK ──────────────────────────────────────
        if len(normal_pool) < 5:
            hi_stretch = user_rating + self.difficulty_band * 2
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
                if diff is not None and not (lo <= diff <= hi_stretch):
                    continue
                p_copy = dict(p)
                p_copy["matched_topics"] = [t for t in p.get("topics", []) if t in final_topics]
                p_copy["is_stretch"] = True
                matched = len(p_copy["matched_topics"])
                if p["platform"] == "lc":
                    p_copy["rank_score"] = (matched * 100_000) + 5_000
                else:
                    p_copy["rank_score"] = (matched * 100_000) + min(p.get("solve_count", 0), 10_000)
                normal_pool.append(p_copy)

        # ── 6. ABSOLUTE FALLBACK ─────────────────────────────────────
        if len(normal_pool) < 5:
            sorted_problems = sorted(all_problems, key=lambda x: (
                len([t for t in x.get("topics", []) if t in final_topics]) * 100_000 +
                (5_000 if x["platform"] == "lc" else min(x.get("solve_count", 0), 10_000))
            ), reverse=True)
            for p in sorted_problems:
                if p["problem_id"] in solved_problem_ids:
                    continue
                if p["platform"] not in platforms:
                    continue
                if any(p["problem_id"] == ep["problem_id"] for ep in normal_pool):
                    continue
                p_copy = dict(p)
                p_copy["matched_topics"] = [t for t in p.get("topics", []) if t in final_topics]
                p_copy["is_stretch"] = True
                matched = len(p_copy["matched_topics"])
                if p["platform"] == "lc":
                    p_copy["rank_score"] = (matched * 100_000) + 5_000
                else:
                    p_copy["rank_score"] = (matched * 100_000) + min(p.get("solve_count", 0), 10_000)
                normal_pool.append(p_copy)
                if len(normal_pool) >= top_k:
                    break

        # ── 7. PLATFORM INTERLEAVING ───────────────────────────────────
        if set(platforms) == {"cf", "lc"}:
            cf_problems = [p for p in normal_pool if p.get("platform") == "cf"]
            lc_problems = [p for p in normal_pool if p.get("platform") == "lc"]
            interleaved = []
            cf_idx, lc_idx = 0, 0
            while len(interleaved) < top_k and (cf_idx < len(cf_problems) or lc_idx < len(lc_problems)):
                if cf_idx < len(cf_problems):
                    interleaved.append(cf_problems[cf_idx])
                    cf_idx += 1
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
