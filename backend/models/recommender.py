"""Recommendation engine."""

import math

from data.topic_graph import CPTopicGraph


class Recommender:
    """Graph-aware problem recommender with prerequisite gating."""

    TOPIC_MATCH_WEIGHT = 100_000
    # Prerequisite matches rank below requested-topic matches but above the
    # popularity tie-breaker, so supplemented-prereq problems never crowd out
    # the topic the user actually asked to practise.
    PREREQ_MATCH_WEIGHT = 1_000
    DEFAULT_MASTERY_THRESHOLD = 0.6
    STRETCH_MULTIPLIER = 2
    # Pedagogy tuning (plan: fix/recommender-pedagogy). Lexicographic tiers with 10×
    # gaps — each tier dominates all below it combined:
    #   FOUNDATION(1e6) > primary_count(1e5) > weakness(1e4) > prereq_count(1e3)
    #   > diff_fit(1e2) > log1p(popularity)
    MAX_WEAK_TOPICS = 8  # Gap 3: cap auto weak set to weakest 8 (sorted asc)
    FOUNDATION_WEIGHT = 1_000_000  # Gap 2: unmet prereq of a weak topic → first
    PRIMARY_WEAKESS = 10_000  # Gap 4: weaker matched primary outranks less-weak
    DIFF_FIT_WEIGHT = 100  # Gap 1: calibration nudge (float-up, not a filter)
    DIFF_STEP = 500  # Gap 1: rating pts per unit (threshold − mastery)

    def __init__(self, topic_graph: CPTopicGraph, mastery_threshold=0.6, difficulty_band=350):
        self.topic_graph = topic_graph
        self.mastery_threshold = mastery_threshold
        self.difficulty_band = difficulty_band

    def _rank_score(
        self,
        matched_topics: list[str],
        solve_count: int,
        primary_set: set[str],
        mastery_scores: dict[str, float],
        unmet_prereqs: set[str],
        diff: int | None,
        user_rating: int,
    ) -> float:
        # Problems matching a REQUESTED (primary) weak topic rank above those
        # matching only a supplemented prerequisite, both above the popularity
        # tie-breaker. primary_set = topics the user actually asked to practise.
        primary = sum(1 for t in matched_topics if t in primary_set)
        prereq = len(matched_topics) - primary
        # Gap 2 — foundation tier: a problem matching an UNMET prerequisite of a
        # flagged weak topic surfaces FIRST (above topic practice). Only active in
        # auto-detect mode; focus mode passes an empty set so topic-first is unchanged.
        foundation = sum(1 for t in matched_topics if t in unmet_prereqs)
        # Gap 4 — weakest-first tie-break WITHIN the same primary count: a never-solved
        # topic (mastery 0) outranks a barely-weak one (mastery 0.59). Sits below the
        # primary-count tier, so it never beats matching one extra primary topic.
        primary_weakness = sum(
            max(0.0, self.mastery_threshold - mastery_scores.get(t, 0.0))
            for t in matched_topics
            if t in primary_set
        )
        # Gap 1 — difficulty calibrated per weak topic, not globally. The weakest
        # matched primary drives the target, which drops as the topic weakens (rebuild
        # foundations easier). diff_fit floats well-matched problems up without
        # narrowing the candidate pool. Foundation-only problems get no signal here.
        diff_fit = 0.0
        if diff is not None:
            matched_prim = [t for t in matched_topics if t in primary_set]
            if matched_prim:
                weakest = min(matched_prim, key=lambda t: mastery_scores.get(t, 0.0))
                target = user_rating - self.DIFF_STEP * (
                    self.mastery_threshold - mastery_scores.get(weakest, 0.0)
                )
                diff_fit = max(0.0, 1.0 - abs(diff - target) / self.difficulty_band)
        return (
            foundation * self.FOUNDATION_WEIGHT
            + primary * self.TOPIC_MATCH_WEIGHT
            + primary_weakness * self.PRIMARY_WEAKESS
            + prereq * self.PREREQ_MATCH_WEIGHT
            + diff_fit * self.DIFF_FIT_WEIGHT
            + math.log1p(solve_count)
        )

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
            # Gap 3 — cap the auto-detected weak set to the weakest 8 (already sorted
            # ascending by mastery). Bounds weak-set size for low-activity users whose
            # many unattempted topics otherwise flood recommendations. Focus mode is an
            # explicit request and is intentionally NOT capped.
            weak_topics = weak_topics[: self.MAX_WEAK_TOPICS]
            if not weak_topics:
                # Take bottom 3 by mastery score
                weak_topics = sorted(mastery_scores, key=lambda t: mastery_scores[t])[:3]

        # ── 2. PREREQUISITE GATING ───────────────────────────────────
        # Keep the requested weak topic — the user asked to practise it. If its
        # prerequisites are unmet, SUPPLEMENT (do not replace) with them; those
        # prerequisite-matching problems then rank lower via PREREQ_MATCH_WEIGHT.
        primary_set = set(weak_topics)
        # Gap 2 — unmet prereqs of flagged weak topics get a FOUNDATION tier (above
        # TOPIC_MATCH) so rebuild-foundations problems surface FIRST. Collected only in
        # auto-detect mode; focus mode keeps this empty ⇒ topic-first is preserved.
        unmet_prereqs: set[str] = set()
        final_topics = []
        for topic in weak_topics:
            final_topics.append(topic)
            if self.topic_graph.are_prerequisites_met(topic, mastery_scores, threshold=0.5):
                # ── Threshold rationale ──
                # Three distinct thresholds serve different purposes:
                #   0.65 = UI "weak area" flag (preprocessor.py) — alarming enough to highlight
                #   0.60 = practice recommendation trigger (this file) — needs improvement
                #   0.50 = prerequisite gate (are_prerequisites_met) — "good enough" to move on
                # The gaps are intentional. A topic with 0.55 mastery isn't alarming (skip weak flag),
                # but still worth practicing (hit by 0.6 practice threshold).
                # A prerequisite at 0.55 is solid enough to build on (passes 0.5 gate).
                continue
            unmet = [
                p for p in self.topic_graph.get_prerequisites(topic)
                if mastery_scores.get(p, 0) < 0.5
            ]
            final_topics.extend(unmet)
            if not focus_topics:
                unmet_prereqs.update(unmet)
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
            p_copy["rank_score"] = self._rank_score(
                p_copy["matched_topics"],
                p.get("solve_count", 0),
                primary_set,
                mastery_scores,
                unmet_prereqs,
                diff,
                user_rating,
            )
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
                p_copy["rank_score"] = self._rank_score(
                    p_copy["matched_topics"],
                    p.get("solve_count", 0),
                    primary_set,
                    mastery_scores,
                    unmet_prereqs,
                    diff,
                    user_rating,
                )
                normal_pool.append(p_copy)

        # ── 6. ABSOLUTE FALLBACK ─────────────────────────────────────
        if len(normal_pool) < 5:
            sorted_problems = sorted(
                all_problems,
                key=lambda x: self._rank_score(
                    [t for t in x.get("topics", []) if t in final_topics],
                    x.get("solve_count", 0),
                    primary_set,
                    mastery_scores,
                    unmet_prereqs,
                    x.get("difficulty"),
                    user_rating,
                ),
                reverse=True,
            )
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
                p_copy["rank_score"] = self._rank_score(
                    p_copy["matched_topics"],
                    p.get("solve_count", 0),
                    primary_set,
                    mastery_scores,
                    unmet_prereqs,
                    p.get("difficulty"),
                    user_rating,
                )
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
