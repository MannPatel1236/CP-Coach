"""FastAPI response schemas — Pydantic models for all route response_model annotations."""

from pydantic import BaseModel, ConfigDict, Field


# ── Topic profile ────────────────────────────────────────────────────────────


class PlatformBreakdown(BaseModel):
    cf: int = 0
    lc: int = 0


class TopicProfileEntry(BaseModel):
    topic: str
    attempts: int
    solved: int
    solve_rate: float
    avg_difficulty: float = 0.0
    recency_weight: float = 0.0
    platform_breakdown: PlatformBreakdown | None = None
    solved_problems: list[str] = Field(default_factory=list)


# ── Weak areas ────────────────────────────────────────────────────────────────


class WeakAreaEntry(BaseModel):
    topic: str
    priority: int


# ── Recommendations ──────────────────────────────────────────────────────────


class Recommendation(BaseModel):
    problem_id: str
    platform: str
    name: str = ""
    difficulty: int | None = None
    topics: list[str] = Field(default_factory=list)
    solve_count: int = 0
    url: str = ""
    matched_topics: list[str] = Field(default_factory=list)
    is_stretch: bool = False


class RecommendationsResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    handle: str
    platforms: list[str]
    focus_topics: list[str]
    recommendations: list[Recommendation] = Field(default_factory=list)
    model_used: str = "rule_based"
    partial_success: bool = False
    errors: list[str] = Field(default_factory=list)


# ── Progress ──────────────────────────────────────────────────────────────────


class WeeklyEntry(BaseModel):
    week: str
    solve_rate: float


class ProgressResponse(BaseModel):
    handle: str
    platform: str
    topic_progress: dict[str, list[WeeklyEntry]] = Field(default_factory=dict)


# ── Graph ─────────────────────────────────────────────────────────────────────


class GraphNode(BaseModel):
    id: str
    label: str


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float = 1.0


class GraphResponse(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


# ── Analyze (CF, LC normal) ──────────────────────────────────────────────────


class AnalyzeResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    handle: str
    platform: str
    rating: int | None = None
    rank: str | None = None
    maxRating: int | None = None
    maxRank: str | None = None
    avatar: str | None = None
    country: str | None = None
    organization: str | None = None
    easy_solved: int | None = None
    medium_solved: int | None = None
    hard_solved: int | None = None
    topic_profile: list[TopicProfileEntry] = Field(default_factory=list)
    weak_areas: list[str] = Field(default_factory=list)
    mastery_scores: dict[str, float] = Field(default_factory=dict)
    model_used: str = "rule_based"
    total_submissions: int = 0
    # Stats-only fields (unused for CF, present for LC stats_only variant)
    note: str | None = None


# ── User / GDPR ──────────────────────────────────────────────────────────────


class DeleteUserResponse(BaseModel):
    message: str


# ── Health ──────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    version: str
    platforms: list[str]
    model_loaded: bool = False


class DeepHealthDownstream(BaseModel):
    codeforces: str | None = None
    leetcode: str | None = None


class HealthDeepResponse(BaseModel):
    status: str
    downstream: DeepHealthDownstream