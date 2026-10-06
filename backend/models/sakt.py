"""SAKT-style model — TOPIC-LEVEL ADAPTATION for the CP-Coach comparison.

This is NOT the original question-level SAKT (Pandey & Karypis, 2019):
there, the query is the embedding of the NEXT exercise and keys/values are
past (exercise, response) interactions.  Here, ranking requires a full
per-topic distribution at every timestep, so the adaptation is a causal
(decoder-only) self-attention encoder over past interactions:

    x_t = ReLU(Linear([topic_emb(c_t); solved_t; difficulty_t; ts_delta_t]))
          + sinusoidal_position(t)                                   # (B,T,d)
    h   = TransformerBlock(x) with causal mask (keys/values <= t)    # (B,T,d)
    p_t = sigmoid(Linear(h_t))  for all 29 topics                    # (B,T,29)

The EXISTING get_target_prediction() helper and the EXISTING P@K pipeline
run unchanged on this output.  Fairness: same input features (topic,
correctness, difficulty, ts_delta), same d=128 hidden size as DKT, same
optimizer/lr/batch/epochs/folds/seed — no per-model hyperparameter search.

Positional information: fixed sinusoidal encodings (Vaswani et al.), zero
extra parameters.  Attention backends: 'sdpa' (torch scaled_dot_product_
attention, used for training) and 'naive' (explicit softmax(QK^T/sqrt(d)+
causal mask)V, kept for the efficiency benchmark).  Both are exactly causal.
"""

import logging
import math
import os

import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


class SAKTStyleModel(nn.Module):
    """Causal self-attention KT model with per-topic sigmoid outputs."""

    def __init__(self, num_topics, embedding_dim=64, hidden_dim=128,
                 num_heads=8, ffn_dim=256, dropout=0.2,
                 max_positions=2048, pos_encoding="sinusoidal", attn="sdpa",
                 **kwargs):
        super().__init__()
        assert hidden_dim % num_heads == 0, "hidden_dim must divide num_heads"
        assert pos_encoding == "sinusoidal", "only sinusoidal positions supported"
        assert attn in ("sdpa", "naive"), "attn must be 'sdpa' or 'naive'"
        self.num_topics = num_topics
        self.hidden_dim = hidden_dim
        self.num_heads = num_heads
        self.attn = attn
        self.config = {
            "model_type": "sakt",
            "num_topics": num_topics,
            "embedding_dim": embedding_dim,
            "hidden_dim": hidden_dim,
            "num_heads": num_heads,
            "ffn_dim": ffn_dim,
            "dropout": dropout,
            "max_positions": max_positions,
            "pos_encoding": pos_encoding,
            "attn": attn,
        }

        # Same 67-dim interaction as DKT: topic emb (64) + solved + difficulty + ts_delta.
        self.topic_embedding = nn.Embedding(num_topics, embedding_dim)
        self.input_proj = nn.Linear(embedding_dim + 3, hidden_dim)
        self.dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()

        # Single transformer block (pre-norm).
        self.ln1 = nn.LayerNorm(hidden_dim)
        self.qkv = nn.Linear(hidden_dim, 3 * hidden_dim)
        self.attn_out = nn.Linear(hidden_dim, hidden_dim)
        self.ln2 = nn.LayerNorm(hidden_dim)
        self.ffn = nn.Sequential(
            nn.Linear(hidden_dim, ffn_dim),
            nn.ReLU(),
            nn.Dropout(dropout) if dropout > 0 else nn.Identity(),
            nn.Linear(ffn_dim, hidden_dim),
        )
        self.output_head = nn.Sequential(
            nn.Linear(hidden_dim, num_topics),
            nn.Sigmoid(),
        )

        # Fixed sinusoidal positional table (buffer, not a parameter).
        self.pos_table: torch.Tensor
        pe = torch.zeros(max_positions, hidden_dim)
        position = torch.arange(max_positions, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, hidden_dim, 2).float()
                             * (-math.log(10000.0) / hidden_dim))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pos_table", pe)

    def _causal_attention(self, h):
        B, T, D = h.shape
        H = self.num_heads
        dk = D // H
        qkv = self.qkv(h).view(B, T, 3, H, dk).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]  # each (B,H,T,dk)
        if self.attn == "sdpa":
            a = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        else:  # naive: explicit scores + additive causal mask
            scores = (q @ k.transpose(-2, -1)) / math.sqrt(dk)  # (B,H,T,T)
            causal = torch.ones(T, T, dtype=torch.bool, device=h.device).triu(diagonal=1)
            scores = scores.masked_fill(causal, float("-inf"))
            a = torch.softmax(scores, dim=-1) @ v
        a = a.permute(0, 2, 1, 3).reshape(B, T, D)
        return self.attn_out(a)

    def forward(self, batch: dict):
        """
        batch keys: topic_ids (B,T), solved (B,T,1), difficulty (B,T,1),
                     ts_delta (B,T,1), mask (B,T)
        Returns: (predictions (B,T,num_topics), h_last (B,hidden))
        """
        B, T = batch["topic_ids"].shape
        if T > self.pos_table.shape[0]:
            raise ValueError(f"sequence length {T} exceeds max_positions "
                             f"{self.pos_table.shape[0]}")
        embedded = self.topic_embedding(batch["topic_ids"])           # (B,T,emb)
        x = torch.cat([embedded, batch["solved"], batch["difficulty"],
                       batch["ts_delta"]], dim=-1)
        h = torch.relu(self.input_proj(x)) + self.pos_table[:T]        # (B,T,d)
        h = self.dropout(h)
        h = h + self.dropout(self._causal_attention(self.ln1(h)))
        h = h + self.dropout(self.ffn(self.ln2(h)))
        predictions = self.output_head(h)                              # (B,T,29)

        mask = batch["mask"].unsqueeze(-1).float()
        predictions = predictions * mask
        return predictions, h[:, -1, :]

    def set_attn(self, attn: str):
        """Switch attention backend (for the efficiency benchmark)."""
        assert attn in ("sdpa", "naive")
        self.attn = attn
        self.config["attn"] = attn

    @classmethod
    def save(cls, model, path: str):
        torch.save({"state_dict": model.state_dict(), "config": model.config}, path)

    @classmethod
    def load(cls, path: str, **kwargs):
        if not os.path.exists(path):
            logger.warning("No weights found at %s, using untrained model", path)
            return None
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        model = cls(**checkpoint["config"])
        model.load_state_dict(checkpoint["state_dict"])
        return model
