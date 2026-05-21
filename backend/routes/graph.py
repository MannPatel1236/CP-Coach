"""Graph route — GET /api/graph"""

from fastapi import APIRouter

from data.topic_graph import CPTopicGraph

router = APIRouter(prefix="/api", tags=["graph"])

_topic_graph = CPTopicGraph()


@router.get("/graph")
async def graph():
    return _topic_graph.to_json()
