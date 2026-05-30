"""Graph-augmented DKT model — core research contribution."""

import logging
import os

import torch
import torch.nn as nn

from models.dkt import DKTModel, collate_fn  # noqa: F401 — re-export collate_fn

logger = logging.getLogger(__name__)

try:
    from torch_geometric.nn import GCNConv
    TORCH_GEOMETRIC_AVAILABLE = True
except ImportError:
    TORCH_GEOMETRIC_AVAILABLE = False
    import warnings
    warnings.warn("torch-geometric not installed. GraphDKTModel will fall back to DKTModel.")


if not TORCH_GEOMETRIC_AVAILABLE:
    # Complete functional fallback
    GraphDKTModel = DKTModel
else:

    class GraphDKTModel(nn.Module):
        """Graph-augmented Deep Knowledge Tracing (GCN + LSTM fusion)."""

        def __init__(self, num_topics, embedding_dim=64, hidden_dim=128, gcn_hidden=64,
                     dropout=0.2, topic_graph=None):
            super().__init__()
            self.num_topics = num_topics
            self.config = {
                "num_topics": num_topics,
                "embedding_dim": embedding_dim,
                "hidden_dim": hidden_dim,
                "gcn_hidden": gcn_hidden,
                "dropout": dropout,
            }

            # Step 1 — DKT backbone (same as DKTModel)
            self.topic_embedding = nn.Embedding(num_topics, embedding_dim)
            self.input_proj = nn.Linear(embedding_dim + 3, hidden_dim)
            self.lstm = nn.LSTM(hidden_dim, hidden_dim, batch_first=True)
            self.dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()

            # Step 2 — GCN layers
            self.gcn1 = GCNConv(hidden_dim, gcn_hidden)
            self.gcn2 = GCNConv(gcn_hidden, gcn_hidden)

            # Step 3 — Fusion
            self.fusion = nn.Linear(hidden_dim + gcn_hidden, num_topics)

            # Register edge_index as buffer
            if topic_graph is not None:
                self.register_buffer("edge_index", topic_graph.get_edge_index())
            else:
                self.register_buffer("edge_index", torch.zeros(2, 0, dtype=torch.long))

        def forward(self, batch: dict):
            """
            Returns: (predictions (B,T,num_topics), h (1,B,hidden))
            """
            # Step 1: DKT backbone
            embedded = self.topic_embedding(batch["topic_ids"])       # (B,T,emb)
            x = torch.cat([embedded, batch["solved"], batch["difficulty"], batch["ts_delta"]], dim=-1)
            x = torch.relu(self.input_proj(x))                       # (B,T,hidden)
            lstm_out, (h, c) = self.lstm(x)                          # (B,T,hidden)
            lstm_out = self.dropout(lstm_out)

            B, T, H = lstm_out.shape

            # Step 2: GCN over prerequisite graph
            h_last = h.squeeze(0)                                    # (B, hidden)
            # Expand to per-topic: (B*num_topics, hidden)
            h_topic = h_last.unsqueeze(1).expand(-1, self.num_topics, -1).reshape(-1, H)
            # Batched graph
            batch_edge_index = self._expand_edge_index(B)
            h_graph = torch.relu(self.gcn1(h_topic, batch_edge_index))  # (B*num_topics, gcn_hidden)
            h_graph = self.gcn2(h_graph, batch_edge_index)              # (B*num_topics, gcn_hidden)
            h_graph = h_graph.reshape(B, self.num_topics, -1)           # (B, num_topics, gcn_hidden)

            # Step 3: Fusion — per-timestep topic selection (not mean-pooling)
            # Index h_graph[b, topic_ids[b,t]] at each timestep for structured graph signal
            topic_ids = batch["topic_ids"]  # (B, T)
            # Use gather to select the GCN embedding for each timestep's active topic
            idx = topic_ids.unsqueeze(-1).expand(-1, -1, h_graph.size(-1))  # (B, T, gcn_hidden)
            h_graph_per_topic = torch.gather(h_graph, 1, idx)             # (B, T, gcn_hidden)
            h_fused = torch.cat([lstm_out, h_graph_per_topic], dim=-1)   # (B,T,hidden+gcn_hidden)
            predictions = torch.sigmoid(self.fusion(h_fused))          # (B,T,num_topics)

            # Mask padded positions
            predictions = predictions * batch["mask"].unsqueeze(-1).float()
            return predictions, h

        def _expand_edge_index(self, batch_size: int) -> torch.Tensor:
            """Repeat edge_index for each batch item with node offset (standard PyG batching)."""
            if self.edge_index.size(1) == 0:
                return self.edge_index

            edge_indices = []
            for i in range(batch_size):
                offset = i * self.num_topics
                edge_indices.append(self.edge_index + offset)
            return torch.cat(edge_indices, dim=1)

        def predict_mastery(self, sequence: list[dict], topic_graph, device="cpu") -> dict[str, float]:
            """Run inference on a single sequence, return {topic_name: mastery}."""
            self.eval()
            self.to(device)

            batch = collate_fn([sequence], topic_graph)
            batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

            with torch.no_grad():
                predictions, _ = self.forward(batch)

            mask = batch["mask"][0]
            last_idx = mask.sum().long().item() - 1
            last_idx = max(last_idx, 0)

            last_pred = predictions[0, last_idx]
            return {topic_graph.idx_to_topic[i]: last_pred[i].item() for i in range(self.num_topics)}

        def get_graph_influence(self, topic: str, topic_graph) -> dict[str, float]:
            """Approximate prerequisite influence via degree-normalized adjacency."""
            prereqs = topic_graph.get_prerequisites(topic)
            if not prereqs:
                return {}

            # Compute degree-normalized weights
            edge_index = self.edge_index
            tgt_idx = topic_graph.topic_to_idx[topic]

            # Count in-degree for target
            in_mask = edge_index[1] == tgt_idx
            in_degree = in_mask.sum().item()

            influence = {}
            for p in prereqs:
                src_idx = topic_graph.topic_to_idx[p]
                # Check if edge exists
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
