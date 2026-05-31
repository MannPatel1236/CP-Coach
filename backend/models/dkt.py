"""DKT LSTM backbone model."""

import logging

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset
except ImportError:
    raise ImportError(
        "PyTorch is required for the backend. Install:\n"
        "  pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu\n"
        "  pip install torch-geometric==2.5.3\n"
        "See backend/README.md for full instructions."
    ) from None

logger = logging.getLogger(__name__)


class DKTModel(nn.Module):
    """Deep Knowledge Tracing with LSTM backbone."""

    def __init__(self, num_topics, embedding_dim=64, hidden_dim=128, dropout=0.2, **kwargs):
        super().__init__()
        self.num_topics = num_topics
        self.config = {
            "num_topics": num_topics,
            "embedding_dim": embedding_dim,
            "hidden_dim": hidden_dim,
            "dropout": dropout,
        }

        self.topic_embedding = nn.Embedding(num_topics, embedding_dim)
        self.input_proj = nn.Linear(embedding_dim + 3, hidden_dim)  # +solved +difficulty +ts_delta
        self.lstm = nn.LSTM(hidden_dim, hidden_dim, num_layers=1, batch_first=True)
        self.dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()
        self.output_head = nn.Sequential(
            nn.Linear(hidden_dim, num_topics),
            nn.Sigmoid(),
        )

    def forward(self, batch: dict):
        """
        batch keys: topic_ids (B,T), solved (B,T,1), difficulty (B,T,1),
                     ts_delta (B,T,1), mask (B,T)
        Returns: (predictions (B,T,num_topics), h (1,B,hidden))
        """
        embedded = self.topic_embedding(batch["topic_ids"])         # (B,T,emb)
        x = torch.cat([embedded, batch["solved"], batch["difficulty"], batch["ts_delta"]], dim=-1)
        x = torch.relu(self.input_proj(x))                         # (B,T,hidden)
        out, (h, c) = self.lstm(x)                                 # (B,T,hidden)
        out = self.dropout(out)                                     # apply explicit dropout after LSTM
        predictions = self.output_head(out)                        # (B,T,num_topics)

        # Zero out padded positions
        mask = batch["mask"].unsqueeze(-1).float()                 # (B,T,1)
        predictions = predictions * mask
        return predictions, h

    def predict_mastery(self, sequence: list[dict], topic_graph, device="cpu") -> dict[str, float]:
        """Run inference on a single sequence, return {topic_name: mastery}."""
        self.eval()
        self.to(device)

        batch = collate_fn([sequence], topic_graph)
        batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

        with torch.no_grad():
            predictions, _ = self.forward(batch)

        # Find last valid timestep
        mask = batch["mask"][0]  # (T,)
        last_idx = mask.sum().long().item() - 1
        last_idx = max(last_idx, 0)

        last_pred = predictions[0, last_idx]  # (num_topics,)
        return {topic_graph.idx_to_topic[i]: last_pred[i].item() for i in range(self.num_topics)}

    @classmethod
    def save(cls, model, path: str):
        torch.save({"state_dict": model.state_dict(), "config": model.config}, path)

    @classmethod
    def load(cls, path: str, **kwargs):
        import os
        if not os.path.exists(path):
            logger.warning("No weights found at %s, using untrained model", path)
            # Return None — caller must supply num_topics to create fresh model
            return None
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        model = cls(**checkpoint["config"])
        model.load_state_dict(checkpoint["state_dict"])
        return model


def collate_fn(batch: list[list[dict]], topic_graph=None) -> dict:
    """Pad variable-length sequences to max length in batch."""
    B = len(batch)
    T = max(len(seq) for seq in batch) if batch else 1

    topic_ids = torch.zeros(B, T, dtype=torch.long)
    solved = torch.zeros(B, T, 1)
    difficulty = torch.zeros(B, T, 1)
    ts_delta = torch.zeros(B, T, 1)
    mask = torch.zeros(B, T, dtype=torch.bool)

    for b, seq in enumerate(batch):
        for t, step in enumerate(seq):
            topic_name = step.get("topic", "implementation")
            if topic_graph is not None:
                tid = topic_graph.topic_to_idx.get(topic_name, 0)
            else:
                tid = 0
            topic_ids[b, t] = tid
            solved[b, t, 0] = float(step.get("solved", 0))
            difficulty[b, t, 0] = float(step.get("difficulty", 0.375))
            ts_delta[b, t, 0] = float(step.get("timestamp_delta", 0.0))
            mask[b, t] = True

    return {
        "topic_ids": topic_ids,
        "solved": solved,
        "difficulty": difficulty,
        "ts_delta": ts_delta,
        "mask": mask,
    }


class DKTDataset(Dataset):
    """Dataset of user submission sequences for DKT training."""

    def __init__(self, sequences: list[list[dict]], topic_graph):
        self.sequences = sequences
        self.topic_graph = topic_graph

    def __len__(self):
        return len(self.sequences)

    def __getitem__(self, idx):
        return self.sequences[idx]
