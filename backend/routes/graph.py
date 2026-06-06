"""Graph route — GET /api/graph"""

from fastapi import APIRouter

from data.topic_graph import CPTopicGraph
from routes.schemas import GraphResponse

router = APIRouter(prefix="/api", tags=["graph"])

_topic_graph = CPTopicGraph()


@router.get("/graph", response_model=GraphResponse)
async def graph():
    return _topic_graph.to_json()
