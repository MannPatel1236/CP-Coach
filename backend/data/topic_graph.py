"""CP prerequisite topic graph."""

try:
    import torch
except ImportError:
    torch = None  # type: ignore


class CPTopicGraph:
    """Directed prerequisite graph over 29 canonical CP topics."""

    TOPICS = [
        "implementation", "math", "greedy", "constructive_algorithms", "binary_search",
        "two_pointers", "sortings", "strings", "number_theory", "combinatorics",
        "dfs_and_similar", "graphs", "trees", "dp", "dp_on_trees", "data_structures",
        "bitmasks", "divide_and_conquer", "hashing", "geometry", "flows", "brute_force",
        # 7 new topics
        "prefix_sum", "sliding_window", "dsu", "shortest_paths",
        "backtracking", "string_algorithms", "matrices",
    ]

    EDGES = [
        # Root: implementation → foundational topics
        ("implementation", "math"),
        ("implementation", "sortings"),
        ("implementation", "strings"),
        ("implementation", "brute_force"),
        ("implementation", "prefix_sum"),

        # Math cluster
        ("math", "greedy"),
        ("math", "number_theory"),
        ("math", "geometry"),
        ("math", "constructive_algorithms"),
        ("math", "bitmasks"),

        # Sortings cluster
        ("sortings", "binary_search"),
        ("sortings", "two_pointers"),
        ("sortings", "data_structures"),
        ("sortings", "greedy"),

        # Strings cluster
        ("strings", "hashing"),

        # Sequence techniques
        ("two_pointers", "sliding_window"),
        ("binary_search", "data_structures"),
        ("binary_search", "divide_and_conquer"),

        # Math → combinatorics
        ("number_theory", "combinatorics"),

        # Data structures → graph family
        ("data_structures", "graphs"),
        ("data_structures", "trees"),
        ("data_structures", "dsu"),
        ("data_structures", "shortest_paths"),

        # Graph family
        ("graphs", "dfs_and_similar"),
        ("graphs", "shortest_paths"),
        ("graphs", "flows"),
        ("graphs", "dsu"),

        # Trees
        ("trees", "dfs_and_similar"),
        ("trees", "dp_on_trees"),

        # DFS/BFS → advanced
        ("dfs_and_similar", "dp"),
        ("dfs_and_similar", "backtracking"),
        ("dfs_and_similar", "dp_on_trees"),
        ("dfs_and_similar", "flows"),

        # DP cluster
        ("greedy", "dp"),
        ("dp", "dp_on_trees"),
        ("dp", "string_algorithms"),
        ("dp", "matrices"),

        # String algorithms
        ("hashing", "string_algorithms"),

        # Backtracking
        ("brute_force", "backtracking"),
    ]

    def __init__(self):
        self.num_topics = len(self.TOPICS)
        self.topic_to_idx = {t: i for i, t in enumerate(self.TOPICS)}
        self.idx_to_topic = {i: t for i, t in enumerate(self.TOPICS)}

        # adjacency: target → list of prerequisites (sources)
        self._prereqs: dict[str, list[str]] = {t: [] for t in self.TOPICS}
        for src, tgt in self.EDGES:
            self._prereqs[tgt].append(src)

    def get_edge_index(self):  # returns torch.Tensor when torch is installed
        """PyG format: shape (2, num_edges), dtype=torch.long."""
        if torch is None:
            raise ImportError("torch is required for CPTopicGraph.get_edge_index()")
        src_indices = []
        tgt_indices = []
        for src, tgt in self.EDGES:
            src_indices.append(self.topic_to_idx[src])
            tgt_indices.append(self.topic_to_idx[tgt])
        return torch.tensor([src_indices, tgt_indices], dtype=torch.long)

    def get_prerequisites(self, topic: str) -> list[str]:
        """Direct prerequisites of this topic."""
        return self._prereqs.get(topic, [])

    def are_prerequisites_met(self, topic: str, mastery: dict[str, float], threshold: float = 0.5) -> bool:
        """True if all prerequisites have mastery >= threshold."""
        prereqs = self.get_prerequisites(topic)
        if not prereqs:
            return True
        return all(mastery.get(p, 0) >= threshold for p in prereqs)

    def to_json(self) -> dict:
        return {
            "nodes": [{"id": t, "label": t} for t in self.TOPICS],
            "edges": [{"source": s, "target": t, "weight": 1.0} for s, t in self.EDGES],
        }
