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
        "union-find": "data_structures",
        "heap-priority-queue": "data_structures",
        "stack": "data_structures",
        "queue": "data_structures",
        "linked-list": "data_structures",
        "trie": "data_structures",
        "segment-tree": "data_structures",
        "binary-indexed-tree": "data_structures",
        "shortest-path": "shortest_paths",
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

    def normalize_cf_submission(self, raw: dict) -> dict:
        prob = raw["problem"]
        return {
            "problem_id": f"cf-{prob['contestId']}{prob['index']}",
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

    def normalize_cf_problem(self, raw_problem: dict, raw_stat: dict) -> dict:
        return {
            "problem_id": f"cf-{raw_problem['contestId']}{raw_problem['index']}",
            "platform": "cf",
            "name": raw_problem["name"],
            "difficulty": raw_problem.get("rating"),
            "topics": [self.normalize_cf_tag(t) for t in raw_problem.get("tags", [])],
            "solve_count": raw_stat.get("solvedCount", 0),
            "url": f"https://codeforces.com/problemset/problem/{raw_problem['contestId']}/{raw_problem['index']}",
        }

    def normalize_lc_problem(self, raw: dict) -> dict:
        diff_raw = raw.get("difficulty", "")
        diff_key = diff_raw.upper() if diff_raw else "MEDIUM"
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
            "solve_count": 0,
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
    print(n.normalize_cf_submission(cf_raw))
    print(n.normalize_lc_submission(lc_raw))
    assert n.normalize_cf_submission(cf_raw)["topics"] == ["dfs_and_similar", "greedy"]
    assert n.normalize_lc_submission(lc_raw)["topics"] == ["implementation", "hashing"]
    print("All assertions passed")
