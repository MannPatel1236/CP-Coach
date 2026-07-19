"""Pedagogy tests for Recommender — the 4 gap fixes + 1 focus-mode regression.

Each gap assertion is written to *contradict the OLD behavior*: the old
``_rank_score`` primary/prereq/popularity terms produced *ties* on these inputs,
so old ordering fell back to ``all_problems`` insertion order. We list the
``all_problems`` array so that insertion order yields the *wrong* answer; the test
can therefore only pass once the new tie-break term (weakness / diff_fit /
foundation / the cap) actually flips the order.

Graph edges used here (see ``data/topic_graph.py``):
  ("dfs_and_similar", "dp"), ("greedy", "dp")  → dp's DIRECT prereqs
  ("math", "greedy"), ("sortings", "greedy")   → greedy's DIRECT prereqs
``get_prerequisites`` returns DIRECT prereqs only, so we exercise the foundation
tier through greedy (an actual direct prereq of dp).
"""
from data.topic_graph import CPTopicGraph
from models.recommender import Recommender

GRAPH = CPTopicGraph()


def _problem(pid, topics, difficulty, solve_count=100, platform="cf"):
    return {
        "problem_id": pid,
        "platform": platform,
        "name": pid,
        "difficulty": difficulty,
        "topics": list(topics),
        "solve_count": solve_count,
        "url": f"https://example.com/{pid}",
    }


def _mastery(**overrides) -> dict[str, float]:
    """All 29 topics default to a solid 0.9 (prereqs met), overridden per-test.

    Defaults are non-weak (>= 0.6), so the only *weak* topics are the ones we
    explicitly override below 0.6 — making weak detection deterministic. Unlisted
    prerequisites stay at 0.9, i.e. met (>= 0.5), unless overridden.
    """
    base = {t: 0.9 for t in CPTopicGraph.TOPICS}
    base.update(overrides)
    return base


def _ranking(recs) -> list[str]:
    return [r["problem_id"] for r in recs]


# ── Gap 2 — unmet prerequisite surfaces ABOVE the requested weak topic ───────

def test_gap2_unmet_prereq_ranks_above_requested_topic():
    """Auto-detect: dp is weak AND greedy (its unmet direct prereq) is weak.

    New: the greedy-tagged problem gets the FOUNDATION tier (1e6) ⇒ it ranks
    above the dp-tagged problem (1e5 primary). Old: both earned primary*1e5 and
    tied; with dp listed first in all_problems, old returned dp first.
    """
    rec = Recommender(GRAPH)
    # greedy is an unmet prereq of dp (0.1 < 0.5); dfs_and_similar is met.
    mastery = _mastery(dp=0.1, greedy=0.1, dfs_and_similar=0.6)
    problems = [
        _problem("p-dp", ["dp"], difficulty=1500),
        _problem("p-greedy", ["greedy"], difficulty=1500),
    ]
    recs = rec.recommend(
        user_rating=1500,
        mastery_scores=mastery,
        solved_problem_ids=set(),
        all_problems=problems,
        platforms=["cf"],
        top_k=10,
    )
    order = _ranking(recs)
    assert order[0] == "p-greedy", order          # ← contradicts old (old: p-dp first)
    assert order.index("p-greedy") < order.index("p-dp")


# ── Gap 4 — the absolute-weakest matched primary outranks a barely-weak one ─

def test_gap4_weakest_matched_primary_ranks_first():
    """Two single-tag primaries, dp (mastery 0.0) vs greedy (mastery 0.55).

    New: the PRIMARY_WEAKESS tie-break lifts dp above greedy within the same
    primary count. Old: both earned primary*1e5 and tied; with greedy listed
    first in all_problems, old returned greedy first.
    """
    rec = Recommender(GRAPH)
    mastery = _mastery(dp=0.0, greedy=0.55)  # both weak; their prereqs met (0.9)
    problems = [
        _problem("p-greedy", ["greedy"], difficulty=1500),
        _problem("p-dp", ["dp"], difficulty=1500),
    ]
    recs = rec.recommend(
        user_rating=1500,
        mastery_scores=mastery,
        solved_problem_ids=set(),
        all_problems=problems,
        platforms=["cf"],
        top_k=10,
    )
    order = _ranking(recs)
    assert order[0] == "p-dp", order              # ← contradicts old (old: p-greedy first)
    assert order.index("p-dp") < order.index("p-greedy")


# ── Gap 3 — auto-detected weak set is capped to the weakest 8 ────────────────

def test_gap3_weak_set_capped_to_max_weakest_topics():
    """All 29 topics weak (<0.6) ⇒ recommendations cover <= MAX_WEAK_TOPICS
    distinct primary topics. Old: no cap ⇒ up to 29 distinct primaries surfaced.
    """
    rec = Recommender(GRAPH)
    mastery = {t: 0.5 for t in CPTopicGraph.TOPICS}   # all weak; all prereqs met (>=0.5)
    problems = [_problem(f"p-{t}", [t], difficulty=1500) for t in CPTopicGraph.TOPICS]
    recs = rec.recommend(
        user_rating=1500,
        mastery_scores=mastery,
        solved_problem_ids=set(),
        all_problems=problems,
        platforms=["cf"],
        top_k=20,
    )
    primary_topics = set()
    for r in recs:
        primary_topics.update(r["matched_topics"])   # matched_topics ⊆ primary_set
    assert len(primary_topics) <= Recommender.MAX_WEAK_TOPICS   # the new guarantee
    # The cap actually bound a 29-topic weakness, not trivially an empty result:
    assert len(primary_topics) == Recommender.MAX_WEAK_TOPICS
    assert len(primary_topics) < len(CPTopicGraph.TOPICS)       # contradicts old (29)


# ── Gap 1 — easier problems float up for a weak topic ─────────────────────────

def test_gap1_easier_problem_outranks_harder_equal_topic():
    """dp weak (0.0): an easier problem (diff < user_rating) outranks an
    otherwise-equal harder one. New: diff_fit float-up. Old: equal terms ⇒ tie ⇒
    harder listed first in all_problems ⇒ old returned harder first.
    """
    rec = Recommender(GRAPH)
    mastery = _mastery(dp=0.0)  # only dp weak; prereqs met (0.9)
    problems = [
        _problem("p-harder", ["dp"], difficulty=1850),
        _problem("p-easier", ["dp"], difficulty=1400),
    ]
    recs = rec.recommend(
        user_rating=1500,
        mastery_scores=mastery,
        solved_problem_ids=set(),
        all_problems=problems,
        platforms=["cf"],
        top_k=10,
    )
    order = _ranking(recs)
    assert order[0] == "p-easier", order          # ← contradicts old (old: p-harder first)
    assert recs[0]["difficulty"] < 1500           # "easier" = diff below user_rating


# ── Regression — focus_topics mode stays topic-first (no foundations-first) ─

def test_focus_mode_topic_first_regression():
    """focus_topics=["dp"]: the dp-tagged problem ranks FIRST (topic-first
    preserved). Same inputs in auto-detect would rank greedy (its unmet prereq)
    first via the FOUNDATION tier — so focus mode must NOT activate foundations.
    """
    rec = Recommender(GRAPH)
    mastery = _mastery(dp=0.1, dfs_and_similar=0.1, greedy=0.1)  # dp's prereqs unmet
    problems = [
        _problem("p-greedy", ["greedy"], difficulty=1500),
        _problem("p-dp", ["dp"], difficulty=1500),
    ]

    focus_recs = rec.recommend(
        user_rating=1500,
        mastery_scores=mastery,
        solved_problem_ids=set(),
        all_problems=problems,
        focus_topics=["dp"],
        platforms=["cf"],
        top_k=10,
    )
    assert _ranking(focus_recs)[0] == "p-dp", _ranking(focus_recs)   # topic-first

    # Contrast: auto-detect on the SAME inputs surfaces the foundation first.
    auto_recs = rec.recommend(
        user_rating=1500,
        mastery_scores=mastery,
        solved_problem_ids=set(),
        all_problems=problems,
        focus_topics=None,
        platforms=["cf"],
        top_k=10,
    )
    assert _ranking(auto_recs)[0] == "p-greedy", _ranking(auto_recs)
