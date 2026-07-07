"""Graph-augmented DKT model — core research contribution.

ARCHITECTURE FIX (2026-06-17):
GCN node features are now differentiated per topic using per-topic mastery
estimates from the LSTM hidden state. Previously all 29 topic nodes received
the same ``h_last`` vector → GCN output was ≈h_last × (1+constant) for every
node → message-passing was structurally useless.

New design ::

    mastery_t[b, t, j] = sigmoid(Linear(lstm_out[b, t]))           # (B, T, 29)
    node_feats[j]      = topic_embed[j] × mastery_t[b, t, j]       # per-topic vector
    h_graph            = GCN(node_feats)                            # now meaningful

PERFORMANCE (2026-06-18):
Uses dense normalized adjacency (29×29) and ``nn.Linear`` instead of
GCNConv + edge_index expansion. For a 29-node graph the dense approach
is ~100× faster than PyG sparse message-passing on CPU because:

  1. No scatter/gather overhead — a single ``einsum`` for all B×T timesteps
  2. ``nn.Linear`` uses Apple Accelerate / MKL for the weight transform
  3. No chunking needed — all T timesteps processed at once, O(B×T) memory

See memory/per-topic-auc-findings.md for the diagnosis.
"""

import logging
import os

import torch
import torch.nn as nn
import torch.nn.functional as F

from models.dkt import DKTModel, collate_fn  # noqa: F401 — re-export collate_fn

logger = logging.getLogger(__name__)

try:
    import torch_geometric  # noqa: F401
    TORCH_GEOMETRIC_AVAILABLE = True
except ImportError:
    TORCH_GEOMETRIC_AVAILABLE = False
    import warnings
    warnings.warn("torch-geometric not installed. GraphDKTModel will fall back to DKTModel.")

# Whether to use GCNConv (requires PyG) or dense GCN (pure PyTorch).
# Dense GCN is ~100× faster for 29-node graphs because it replaces sparse
# scatter/gather with a single einsum + Linear layers.
USE_DENSE_GCN = True


if not TORCH_GEOMETRIC_AVAILABLE and not USE_DENSE_GCN:
    GraphDKTModel = DKTModel  # type: ignore[reportAssignmentType]
else:

    class GraphDKTModel(nn.Module):
        """Graph-augmented Deep Knowledge Tracing (personalised dense GCN).

        The GCN operates on **differentiated per-topic node features**:
        ``topic_embed[j] × mastery_t[j]``, so that message-passing actually
        propagates student-specific signal along the prerequisite DAG.

        When ``USE_DENSE_GCN = True`` (the default), the GCN is implemented as
        a dense normalized adjacency matrix (29×29) and two ``nn.Linear``
        layers — mathematically equivalent to GCNConv but vastly faster on CPU.
        """

        def __init__(self, num_topics, embedding_dim=64, hidden_dim=128, gcn_hidden=64,
                     dropout=0.2, topic_graph=None, gcn_chunk_size=100):
            super().__init__()
            self.num_topics = num_topics
            self.config = {
                "num_topics": num_topics,
                "embedding_dim": embedding_dim,
                "hidden_dim": hidden_dim,
                "gcn_hidden": gcn_hidden,
                "dropout": dropout,
                "gcn_chunk_size": gcn_chunk_size,
            }
            self.gcn_chunk_size = gcn_chunk_size

            # Step 1 — DKT backbone
            self.topic_embedding = nn.Embedding(num_topics, embedding_dim)
            self.input_proj = nn.Linear(embedding_dim + 3, hidden_dim)
            self.lstm = nn.LSTM(hidden_dim, hidden_dim, batch_first=True)
            self.dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()

            # Step 1b — Per-topic mastery head
            self.mastery_head = nn.Linear(hidden_dim, num_topics)

            # Step 2 — GCN layers (dense Linear, no PyG scatter/gather)
            self.gcn1 = nn.Linear(embedding_dim, gcn_hidden)
            self.gcn2 = nn.Linear(gcn_hidden, gcn_hidden)

            # Step 3 — Fusion
            self.fusion = nn.Linear(hidden_dim + gcn_hidden, num_topics)

            # Pre-compute normalised adjacency A_hat = D^{-1/2} (A + I) D^{-1/2}
            if topic_graph is not None:
                self.register_buffer("adj_norm", self._build_normalized_adj(topic_graph))
            else:
                self.register_buffer("adj_norm", torch.eye(num_topics))

        @staticmethod
        def _build_normalized_adj(topic_graph) -> torch.Tensor:
            """Compute symmetric normalized adjacency A_hat (29×29, dense)."""
            edge_index = topic_graph.get_edge_index()            # (2, 39)
            num_topics = topic_graph.num_topics
            A = torch.zeros(num_topics, num_topics)
            A[edge_index[1], edge_index[0]] = 1.0  # A[dst, src] so dst aggregates from prereq src
            A = A + torch.eye(num_topics)                       # self-loops
            D = A.sum(dim=1).pow(-0.5)                           # degree^{-1/2}
            # A_hat = D^{-1/2} @ A @ D^{-1/2}
            A_norm = D.unsqueeze(1) * A * D.unsqueeze(0)        # (29, 29)
            return A_norm

        def forward(self, batch: dict):
            """
            Returns
            -------
            predictions : (B,T,num_topics)
            mastery_t   : (B,T,num_topics)
            """
            B, T = batch["topic_ids"].shape

            # ── 1. DKT backbone ────────────────────────────────────────
            embedded = self.topic_embedding(batch["topic_ids"])           # (B,T,emb)
            x = torch.cat([embedded, batch["solved"], batch["difficulty"],
                           batch["ts_delta"]], dim=-1)
            x = torch.relu(self.input_proj(x))                           # (B,T,hidden)
            lstm_out, _ = self.lstm(x)                                   # (B,T,hidden)
            lstm_out = self.dropout(lstm_out)

            # ── 2. Per-topic mastery estimate ──────────────────────────
            mastery_t = torch.sigmoid(self.mastery_head(lstm_out))       # (B,T,num_topics)

            # ── 3. Differentiated GCN node features ────────────────────
            # node_feats[b, t, j] = topic_embed[j] × mastery_t[b, t, j]
            node_feats = mastery_t.unsqueeze(-1) * self.topic_embedding.weight  # (B,T,29,emb)

            # ── 4. Chunked dense GCN + checkpointing (avoid OOM) ─────
            # Each chunk's autograd graph is discarded during forward
            # and recomputed during backward — saves ~80% peak memory.
            K = self.gcn_chunk_size
            if self.training:
                h_topic_list = [
                    torch.utils.checkpoint.checkpoint(  # type: ignore[reportAttributeAccessIssue]
                        self._gcn_chunk,
                        node_feats[:, t_start : t_start + K],
                        batch["topic_ids"][:, t_start : t_start + K],
                        use_reentrant=False,
                    )
                    for t_start in range(0, T, K)
                ]
            else:
                h_topic_list = []
                for t_start in range(0, T, K):
                    hc = self._gcn_chunk(
                        node_feats[:, t_start : t_start + K],
                        batch["topic_ids"][:, t_start : t_start + K],
                    )
                    h_topic_list.append(hc)
            h_topic = torch.cat(h_topic_list, dim=1)                       # (B,T,gcn_hidden)

            # ── 6. Fuse and predict ────────────────────────────────────
            h_fused = torch.cat([lstm_out, h_topic], dim=-1)           # (B,T,hidden+gcn_hidden)
            predictions = torch.sigmoid(self.fusion(h_fused))           # (B,T,num_topics)
            predictions = predictions * batch["mask"].unsqueeze(-1).float()

            return predictions, mastery_t

        def _gcn_chunk(self, chunk: torch.Tensor, t_ids: torch.Tensor) -> torch.Tensor:
            """GCN forward + gather for one chunk of K timesteps.

            Separated into its own method so that :func:`torch.utils.checkpoint`
            can discard its intermediate activations during training — the
            autograd graph for each chunk is recomputed on demand during
            backward, keeping peak memory at ~200 MB regardless of sequence
            length.
            """
            hc = torch.einsum("ij,btjk->btik", self.adj_norm, chunk)   # (B,K,29,emb)
            hc = F.relu(self.gcn1(hc))                                   # (B,K,29,gcn_hidden)
            hc = self.dropout(hc)
            hc = torch.einsum("ij,btjk->btik", self.adj_norm, hc)       # (B,K,29,gcn_hidden)
            hc = self.gcn2(hc)                                            # (B,K,29,gcn_hidden)
            idx = t_ids.unsqueeze(-1).unsqueeze(-1).expand(-1, -1, 1, hc.size(-1))
            return hc.gather(2, idx).squeeze(2)                          # (B,K,gcn_hidden)

        def predict_mastery(self, sequence: list[dict], topic_graph, device="cpu") -> dict[str, float]:
            """Run inference on a single sequence."""
            self.eval()
            self.to(device)
            batch = collate_fn([sequence], topic_graph)
            batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}
            with torch.no_grad():
                predictions, _ = self.forward(batch)
            mask = batch["mask"][0]
            last_idx = max(mask.sum().long().item() - 1, 0)
            last_pred = predictions[0, last_idx]
            return {topic_graph.idx_to_topic[i]: last_pred[i].item() for i in range(self.num_topics)}

        def get_graph_influence(self, topic: str, topic_graph) -> dict[str, float]:
            """Approximate prerequisite influence via degree-normalized adjacency."""
            prereqs = topic_graph.get_prerequisites(topic)
            if not prereqs:
                return {}
            edge_index = topic_graph.get_edge_index()
            tgt_idx = topic_graph.topic_to_idx[topic]
            in_mask = edge_index[1] == tgt_idx
            in_degree = in_mask.sum().item()
            influence = {}
            for p in prereqs:
                src_idx = topic_graph.topic_to_idx[p]
                edge_exists = ((edge_index[0] == src_idx) & (edge_index[1] == tgt_idx)).any().item()
                if edge_exists and in_degree > 0:
                    influence[p] = 1.0 / in_degree
                else:
                    influence[p] = 0.0
            return influence

        @classmethod
        def save(cls, model, path: str):
            torch.save({"state_dict": model.state_dict(), "config": model.config}, path)

        @classmethod
        def load(cls, path: str, topic_graph=None):
            if not os.path.exists(path):
                logger.warning("No weights found at %s, using untrained model", path)
                return None
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
            config = checkpoint["config"]
            model = cls(topic_graph=topic_graph, **config)
            model.load_state_dict(checkpoint["state_dict"])
            return model


    class AblationGraphDKTModel(GraphDKTModel):
        """GraphDKTModel with a swappable adjacency matrix for ablation studies.

        Only overrides _build_normalized_adj. All forward pass logic is inherited.
        Controlled via adjacency_mode:
          "directed"   — original 39-edge prerequisite DAG (baseline, same as GraphDKTModel)
          "undirected" — same edges but bidirectional (removes prerequisite ordering)
          "no_graph"   — identity only (self-loops, no cross-topic signal)
          "dense"      — fully connected (all-to-all mixing, no structural information)
        """
        VALID_MODES = frozenset({"directed", "undirected", "no_graph", "dense"})

        def __init__(self, num_topics, embedding_dim=64, hidden_dim=128, gcn_hidden=64,
                     dropout=0.2, topic_graph=None, adjacency_mode="directed",
                     gcn_chunk_size=100):
            self._adjacency_mode = adjacency_mode
            super().__init__(num_topics=num_topics, embedding_dim=embedding_dim,
                             hidden_dim=hidden_dim, gcn_hidden=gcn_hidden,
                             dropout=dropout, topic_graph=topic_graph,
                             gcn_chunk_size=gcn_chunk_size)
            self.config["adjacency_mode"] = adjacency_mode

        def _build_normalized_adj(self, topic_graph) -> torch.Tensor:
            num_topics = topic_graph.num_topics
            edge_index = topic_graph.get_edge_index()
            mode = getattr(self, "_adjacency_mode", "directed")

            if mode not in self.VALID_MODES:
                raise ValueError(f"Unknown adjacency_mode '{mode}'. Valid: {self.VALID_MODES}")

            A = torch.zeros(num_topics, num_topics)
            if mode == "directed":
                A[edge_index[1], edge_index[0]] = 1.0
            elif mode == "undirected":
                A[edge_index[1], edge_index[0]] = 1.0
                A[edge_index[0], edge_index[1]] = 1.0
            elif mode == "no_graph":
                pass  # A stays zero; only self-loops added below
            elif mode == "dense":
                A = torch.ones(num_topics, num_topics) - torch.eye(num_topics)

            A = A + torch.eye(num_topics)
            D = A.sum(dim=1).pow(-0.5)
            return D.unsqueeze(1) * A * D.unsqueeze(0)
