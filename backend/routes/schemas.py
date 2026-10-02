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


class RecommendationProvenance(BaseModel):
    trigger_weak_tag: str
    prereq_path: list[str]
    band: list[int]
    margin_vs_next: int | None = None


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
    provenance: RecommendationProvenance | None = None


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


class ActivityWeek(BaseModel):
    solved: int = 0
    total: int = 0
    active_days: int = 0


class ProgressResponse(BaseModel):
    handle: str
    platform: str
    topic_progress: dict[str, list[WeeklyEntry]] = Field(default_factory=dict)
    activity: dict[str, ActivityWeek] = Field(default_factory=dict)


# ── Rating trajectory (Phase 4a) ──────────────────────────────────────────────


class RatingPoint(BaseModel):
    contest_id: int | None = None
    contest_name: str = ""
    rank: int | None = None
    old_rating: int | None = None
    new_rating: int | None = None
    timestamp: int = 0


class RatingTrajectoryResponse(BaseModel):
    handle: str
    platform: str
    points: list[RatingPoint] | None = None


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


# ── Mastery history (Phase 4b) ────────────────────────────────────────────────


class MasteryCheckpoint(BaseModel):
    ts: int = 0
    p: float


class MasteryHistoryResponse(BaseModel):
    handle: str
    platform: str
    mastery_history: dict[str, list[MasteryCheckpoint]] | None = None
    note: str | None = None


# ── Weekly mastery (retroactive fused-head buckets) ──────────────────────────


class WeeklyMasteryPoint(BaseModel):
    week: str   # ISO "YYYY-Www" (UTC, Monday-based)
    p: float    # 0..1 fused mastery estimate


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
    # Phase 4b: temporal checkpoints when Graph-DKT ran; null on rule-based paths
    mastery_history: dict[str, list[MasteryCheckpoint]] | None = None
    # Retroactive weekly fused-mastery curve (12 ISO weeks, oldest first);
    # null on rule-based / stats_only paths
    mastery_weekly: dict[str, list[WeeklyMasteryPoint | None]] | None = None
    # Stats-only fields (unused for CF, present for LC stats_only variant)
    note: str | None = None


# ── User / GDPR ──────────────────────────────────────────────────────────────


class DeleteUserResponse(BaseModel):
    message: str


# ── Plans / Workbook (Phase 5b) ──────────────────────────────────────────────


class PlanIn(BaseModel):
    # Bounded to the plans.name VARCHAR(120) column so an over-long name is a
    # 422 validation error, not a 502 from a swallowed DB write failure.
    name: str = Field(min_length=1, max_length=120)
    payload: dict = Field(default_factory=dict)


class PlanOut(BaseModel):
    id: int
    name: str
    payload: dict = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class PlanDeleteResponse(BaseModel):
    deleted: bool


# ── Health ──────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    version: str
    platforms: list[str]
    model_loaded: bool = False
    # False = the lifespan DB init failed (tables missing) — new features
    # degrade (plans → [], writes 502, mastery-history 'unavailable') while
    # /health still says ok. Surfaced so ops can detect that state.
    database: bool = False


class DeepHealthDownstream(BaseModel):
    codeforces: str | None = None
    leetcode: str | None = None


class HealthDeepResponse(BaseModel):
    status: str
    downstream: DeepHealthDownstream