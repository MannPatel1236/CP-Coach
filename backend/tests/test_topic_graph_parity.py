"""Prerequisite-graph parity: the Python graph and the frontend copy must agree.

`CPTopicGraph.EDGES` drives the recommender's prerequisite gating and provenance.
`FALLBACK_GRAPH` in `src/lib/topicGraphLayout.js` drives the DAG the user sees and
the "why this rec" prerequisite path. Two hand-maintained copies, no shared source
— so a one-sided edit makes the UI explain a path the recommender never took, and
nothing else in the suite notices. The tag maps already have this guard
(`src/api.test.js`); the edges did not.
"""

import re
from pathlib import Path

from data.topic_graph import CPTopicGraph

LAYOUT_JS = Path(__file__).resolve().parents[2] / "src" / "lib" / "topicGraphLayout.js"


def _fallback_graph_source() -> str:
    src = LAYOUT_JS.read_text()
    start = src.index("export const FALLBACK_GRAPH")
    end = src.index("export function pillWidth", start)
    return src[start:end]


def test_js_graph_is_readable():
    """Guards the parser itself — a refactor of FALLBACK_GRAPH must fail here, loudly."""
    src = _fallback_graph_source()
    assert src.count("{ source:") >= 39, "FALLBACK_GRAPH edge list not found in expected shape"


def test_edges_match_python():
    js_edges = {
        (m.group(1), m.group(2))
        for m in re.finditer(r'\{ source: "([a-z_]+)", target: "([a-z_]+)" \}',
                             _fallback_graph_source())
    }
    py_edges = set(CPTopicGraph.EDGES)

    assert js_edges == py_edges, (
        f"only in JS: {sorted(js_edges - py_edges)}; "
        f"only in Python: {sorted(py_edges - js_edges)}"
    )


def test_nodes_match_python():
    js_nodes = set(re.findall(r'\{ id: "([a-z_]+)", label:', _fallback_graph_source()))
    assert js_nodes == set(CPTopicGraph.TOPICS)
