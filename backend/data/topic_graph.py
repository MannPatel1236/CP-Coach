"""CP prerequisite topic graph."""

try:
    import torch
except ImportError:
    torch = None  # type: ignore


class CPTopicGraph:
    """Directed prerequisite graph over 22 canonical CP topics."""

    TOPICS = [
        "implementation", "math", "greedy", "constructive_algorithms", "binary_search",
        "two_pointers", "sortings", "strings", "number_theory", "combinatorics",
        "dfs_and_similar", "graphs", "trees", "dp", "dp_on_trees", "data_structures",
        "bitmasks", "divide_and_conquer", "hashing", "geometry", "flows", "brute_force",
    ]

    EDGES = [
        ("implementation", "math"),
        ("math", "greedy"),
        ("math", "constructive_algorithms"),
        ("greedy", "binary_search"),
        ("binary_search", "data_structures"),
        ("data_structures", "trees"),
        ("data_structures", "graphs"),
        ("trees", "dfs_and_similar"),
        ("graphs", "dfs_and_similar"),
        ("dfs_and_similar", "dp"),
        ("dp", "dp_on_trees"),
        ("greedy", "dp"),
        ("math", "number_theory"),
        ("number_theory", "combinatorics"),
        ("binary_search", "sortings"),
        ("sortings", "data_structures"),
        ("math", "two_pointers"),
        ("two_pointers", "binary_search"),
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
