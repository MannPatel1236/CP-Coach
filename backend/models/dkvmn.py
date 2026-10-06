"""DKVMN-style model — TOPIC-LEVEL ADAPTATION for the CP-Coach comparison.

This is NOT the original question-level DKVMN (Zhang et al., 2017): there,
each question maps to one latent concept and reads/writes address that
concept.  Here every timestep must yield a full per-topic distribution
(for the EXISTING P@K pipeline), so the adaptation reads ALL 29 topics at
every step from the same value memory:

    write:  w_t   = softmax(topic_emb[c_t] . M^k / sqrt(d_k))   # [B, N]
            e_t   = sigmoid(Linear(v_t))                        # erase gate
            a_t   = tanh(Linear(v_t))                           # add gate
            M^v  <- M^v * (1 - w_t e_t) + w_t a_t   (masked)    # per-sample
    read:   W_ji  = softmax_i(q_j . M^k_i), q_j = topic_emb[j]  # static [29, N]
            r[b,t,j] = sum_i W_ji M^v[b,t,i]
            f     = tanh(W_f [r ; q_j])
            p_j   = sigmoid(w_o f)

M^k [N, d_k] is static (precomputed read weights once per forward);
M^v [B, N, d_v] is per-sample and updated sequentially, so prediction at t
depends only on inputs at positions <= t (verified by the causality test).

Fairness: same input features as DKT (topic, correctness, difficulty,
ts_delta via the same 67-dim interaction), d_v=128 matches DKT's hidden
size, N=20 slots is the standard DKVMN value, same optimizer/lr/batch/
epochs/folds/seed — no per-model hyperparameter search.

Cost note: the write loop is sequential over T (inherently recurrent, like
an RNN unroll).  Per-step work is fully batched over B and over the 29
read topics, so GPU training is practical; see the smoke-test projection.
"""

import logging
import math
import os

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)


class DKVMNStyleModel(nn.Module):
    """Key-value memory KT model with per-topic sigmoid outputs."""

    def __init__(self, num_topics, embedding_dim=64, key_dim=64, value_dim=128,
                 memory_slots=20, dropout=0.2, **kwargs):
        super().__init__()
        assert embedding_dim == key_dim, "topic queries dot key memory: need embedding_dim == key_dim"
        self.num_topics = num_topics
        self.key_dim = key_dim
        self.value_dim = value_dim
        self.memory_slots = memory_slots
        self.config = {
            "model_type": "dkvmn",
            "num_topics": num_topics,
            "embedding_dim": embedding_dim,
            "key_dim": key_dim,
            "value_dim": value_dim,
            "memory_slots": memory_slots,
            "dropout": dropout,
        }

        # Same 67-dim interaction as DKT: topic emb + solved + difficulty + ts_delta.
        self.topic_embedding = nn.Embedding(num_topics, embedding_dim)
        self.input_proj = nn.Linear(embedding_dim + 3, value_dim)
        self.dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()

        # Static key memory + learned initial value memory.
        self.key_memory = nn.Parameter(torch.randn(memory_slots, key_dim) * 0.5)
        self.init_value_memory = nn.Parameter(torch.randn(memory_slots, value_dim) * 0.1)

        # Erase / add gates from the interaction embedding.
        self.erase_gate = nn.Linear(value_dim, value_dim)
        self.add_gate = nn.Linear(value_dim, value_dim)

        # Read fusion: [r (d_v) ; q_j (d_k)] -> f -> p.
        self.read_fusion = nn.Linear(value_dim + key_dim, value_dim)
        self.output_w = nn.Linear(value_dim, 1)

    def _read_weights(self):
        """Static topic->slot attention [29, N] (no batch/time dependence)."""
        q = self.topic_embedding.weight  # (29, d_k); embedding_dim == key_dim
        scores = (q @ self.key_memory.t()) / math.sqrt(self.key_dim)
        return torch.softmax(scores, dim=-1)  # (29, N)

    def forward(self, batch: dict):
        """
        batch keys: topic_ids (B,T), solved (B,T,1), difficulty (B,T,1),
                     ts_delta (B,T,1), mask (B,T)
        Returns: (predictions (B,T,num_topics), value-memory summary (B,value_dim))
        """
        B, T = batch["topic_ids"].shape
        K = self.topic_embedding(batch["topic_ids"])  # (B,T,d_k)
        x = torch.cat([K, batch["solved"], batch["difficulty"], batch["ts_delta"]], dim=-1)
        v = torch.relu(self.input_proj(x))            # (B,T,d_v)
        v = self.dropout(v)
        mask = batch["mask"]                          # (B,T) bool

        W_read = self._read_weights()                 # (29, N) static
        q_topics = self.topic_embedding.weight        # (29, d_k)

        value_mem = self.init_value_memory.unsqueeze(0).expand(B, -1, -1).contiguous()
        preds = []
        for t in range(T):
            m_t = mask[:, t].float()                  # (B,) 0 on padding
            # Write: correlate current topic with key slots.
            w = torch.softmax((K[:, t, :] @ self.key_memory.t()) / math.sqrt(self.key_dim),
                              dim=-1)                 # (B, N)
            e = torch.sigmoid(self.erase_gate(v[:, t, :]))  # (B, d_v)
            a = torch.tanh(self.add_gate(v[:, t, :]))       # (B, d_v)
            gate = (m_t.unsqueeze(-1) * w).unsqueeze(-1)    # (B, N, 1)
            value_mem = (value_mem * (1.0 - gate * e.unsqueeze(1))
                         + gate * a.unsqueeze(1))
            # Read all 29 topics from the updated memory.
            r = torch.einsum("jn,bnd->bjd", W_read, value_mem)  # (B, 29, d_v)
            rq = torch.cat([r, q_topics.unsqueeze(0).expand(B, -1, -1)], dim=-1)
            f = torch.tanh(self.read_fusion(rq))      # (B, 29, d_v)
            f = self.dropout(f)
            p = torch.sigmoid(self.output_w(f)).squeeze(-1)  # (B, 29)
            preds.append(p)

        predictions = torch.stack(preds, dim=1)       # (B, T, 29)
        predictions = predictions * mask.unsqueeze(-1).float()
        return predictions, value_mem.mean(dim=1)

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
