"""Platform data normalizer — CF + LC → unified format."""


class Normalizer:
    """Converts raw Codeforces and LeetCode data into the normalized submission format."""

    CF_TAG_MAP = {
        "dfs and similar": "dfs_and_similar",
        "constructive algorithms": "constructive_algorithms",
        "binary search": "binary_search",
        "two pointers": "two_pointers",
        "number theory": "number_theory",
        "data structures": "data_structures",
        "divide and conquer": "divide_and_conquer",
        "brute force": "brute_force",
        "dynamic programming": "dp",
        # ── Additions ──────────────────────────────────────────────────
        "dsu": "dsu",
        "shortest paths": "shortest_paths",
        "string suffix structures": "string_algorithms",
        "matrices": "matrices",
        "graph matchings": "flows",
        "probabilities": "math",
        "games": "dp",
        "fft": "math",
        "ternary search": "binary_search",
        "meet in the middle": "divide_and_conquer",
        "expression parsing": "string_algorithms",
        "2-sat": "graphs",
        "chinese remainder theorem": "number_theory",
    }

    LC_TAG_MAP = {
        "array": "implementation",
        "hash-table": "hashing",
        "dynamic-programming": "dp",
        "math": "math",
        "string": "strings",
        "binary-search": "binary_search",
        "greedy": "greedy",
        "depth-first-search": "dfs_and_similar",
        "breadth-first-search": "dfs_and_similar",
        "graph": "graphs",
        "tree": "trees",
        "sorting": "sortings",
        "two-pointers": "two_pointers",
        "divide-and-conquer": "divide_and_conquer",
        "bit-manipulation": "bitmasks",
        "combinatorics": "combinatorics",
        "number-theory": "number_theory",
        "geometry": "geometry",
        "union-find": "dsu",
        "heap-priority-queue": "data_structures",
        "stack": "data_structures",
        "queue": "data_structures",
        "linked-list": "data_structures",
        "trie": "data_structures",
        "segment-tree": "data_structures",
        "binary-indexed-tree": "data_structures",
        "shortest-path": "shortest_paths",
        # ── Additions ──────────────────────────────────────────────────
        "prefix-sum": "prefix_sum",
        "sliding-window": "sliding_window",
        "backtracking": "backtracking",
        "matrix": "matrices",
        "string-matching": "string_algorithms",
        "rolling-hash": "string_algorithms",
        "topological-sort": "dfs_and_similar",
        "monotonic-stack": "data_structures",
        "memoization": "dp",
        "simulation": "implementation",
        "minimum-spanning-tree": "graphs",
        "counting": "combinatorics",
        "enumeration": "brute_force",
        "recursion": "dfs_and_similar",
    }

    LC_DIFFICULTY_MAP = {
        "EASY": 1000,
        "MEDIUM": 1400,
        "HARD": 1900,
    }

    # ── Tag normalization ────────────────────────────────────────────

    def normalize_cf_tag(self, tag: str) -> str:
        return self.CF_TAG_MAP.get(tag, tag.lower().replace(" ", "_"))

    def normalize_lc_tag(self, slug: str):
        if slug in self.LC_TAG_MAP:
            return self.LC_TAG_MAP[slug]
        return slug.replace("-", "_")

    # ── Submission normalization ─────────────────────────────────────

    def normalize_cf_submission(self, raw: dict) -> dict | None:
        prob = raw.get("problem")
        if not isinstance(prob, dict):
            return None
        contest_id = prob.get("contestId")
        index = prob.get("index")
        if contest_id is None or index is None:
            return None
        return {
            "problem_id": f"cf-{contest_id}{index}",
            "platform": "cf",
            "verdict": "OK" if raw.get("verdict") == "OK" else "WRONG_ANSWER",
            "topics": [self.normalize_cf_tag(t) for t in prob.get("tags", [])],
            "difficulty": prob.get("rating"),
            "timestamp": raw.get("creationTimeSeconds", 0) * 1000,
        }

    def normalize_lc_submission(self, raw: dict) -> dict:
        diff_raw = raw.get("difficulty", "")
        diff_key = diff_raw.upper() if diff_raw else "MEDIUM"
        return {
            "problem_id": f"lc-{raw['titleSlug']}",
            "platform": "lc",
            "verdict": "OK" if raw.get("statusDisplay") == "Accepted" else "WRONG_ANSWER",
            "topics": [
                t
                for t in [
                    self.normalize_lc_tag(tag["slug"])
                    for tag in raw.get("topicTags", [])
                ]
                if t
            ],
            "difficulty": self.LC_DIFFICULTY_MAP.get(diff_key, 1500),
            "timestamp": int(raw.get("timestamp", 0)) * 1000,
        }

    # ── Problem normalization ────────────────────────────────────────

    def normalize_cf_problem(self, raw_problem: dict, raw_stat: dict) -> dict | None:
        contest_id = raw_problem.get("contestId")
        index = raw_problem.get("index")
        if contest_id is None or index is None:
            return None
        return {
            "problem_id": f"cf-{contest_id}{index}",
            "platform": "cf",
            "name": raw_problem.get("name", ""),
            "difficulty": raw_problem.get("rating"),
            "topics": [self.normalize_cf_tag(t) for t in raw_problem.get("tags", [])],
            "solve_count": raw_stat.get("solvedCount", 0),
            "url": f"https://codeforces.com/problemset/problem/{contest_id}/{index}",
        }

    def normalize_lc_problem(self, raw: dict) -> dict:
        diff_raw = raw.get("difficulty", "")
        diff_key = diff_raw.upper() if diff_raw else "MEDIUM"
        # LeetCode API doesn't expose solve counts; use log-scaled estimates by difficulty
        # These are approximate midpoints of real LC solve count distributions (2024)
        _lc_fallback_solves = {
            "EASY": 10_000,
            "MEDIUM": 5_000,
            "HARD": 1_500,
        }
        return {
            "problem_id": f"lc-{raw['titleSlug']}",
            "platform": "lc",
            "name": raw["title"],
            "difficulty": self.LC_DIFFICULTY_MAP.get(diff_key, 1500),
            "topics": [
                t
                for t in [
                    self.normalize_lc_tag(tag["slug"])
                    for tag in raw.get("topicTags", [])
                ]
                if t
            ],
            "solve_count": _lc_fallback_solves.get(diff_key, 5_000),
            "url": f"https://leetcode.com/problems/{raw['titleSlug']}/",
        }


if __name__ == "__main__":
    n = Normalizer()
    cf_raw = {
        "problem": {
            "contestId": 1234,
            "index": "A",
            "tags": ["dfs and similar", "greedy"],
            "rating": 1400,
        },
        "verdict": "OK",
        "creationTimeSeconds": 1700000000,
    }
    lc_raw = {
        "titleSlug": "two-sum",
        "statusDisplay": "Accepted",
        "timestamp": "1700000000",
        "difficulty": "Easy",
        "topicTags": [
            {"slug": "array", "name": "Array"},
            {"slug": "hash-table", "name": "Hash Table"},
        ],
    }
    cf_norm = n.normalize_cf_submission(cf_raw)
    print(cf_norm)
    print(n.normalize_lc_submission(lc_raw))
    assert cf_norm is not None and cf_norm["topics"] == ["dfs_and_similar", "greedy"]
    assert n.normalize_lc_submission(lc_raw)["topics"] == ["implementation", "hashing"]
    print("All assertions passed")
