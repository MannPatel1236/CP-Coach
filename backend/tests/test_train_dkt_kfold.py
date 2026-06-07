"""Test kfold_split for random-seed cross-validation in train_dkt.py."""

from training.train_dkt import kfold_split, split_sequences


def _make_sequences(n: int, seq_len: int = 10) -> list[list[dict]]:
    """Generate n fake user sequences of `seq_len` steps each.

    Each step is a minimal dict (we only need identity for splitting).
    """
    return [[{"topic": "math", "solved": 1}] * seq_len for _ in range(n)]


def test_kfold_split_returns_k_folds():
    """kfold_split returns exactly k (train, val) pairs."""
    sequences = _make_sequences(50)
    folds = kfold_split(sequences, k=5, seed=42)
    assert len(folds) == 5
    for train, val in folds:
        assert isinstance(train, list)
        assert isinstance(val, list)


def test_kfold_split_disjoint_val_sets_cover_all():
    """Each sequence is in exactly one val set; union == all sequences."""
    sequences = _make_sequences(50)
    folds = kfold_split(sequences, k=5, seed=42)
    all_ids = set(id(s) for s in sequences)
    seen_val_ids: set[int] = set()
    for train, val in folds:
        val_ids = set(id(s) for s in val)
        # No overlap with previously seen val sets
        assert seen_val_ids.isdisjoint(val_ids)
        seen_val_ids.update(val_ids)
        # val and train are disjoint
        assert val_ids.isdisjoint(set(id(s) for s in train))
    # Every sequence appeared in exactly one val set
    assert seen_val_ids == all_ids
    assert len(seen_val_ids) == 50


def test_kfold_split_balanced_val_size():
    """With 50 sequences and k=5, each val set has 10 sequences."""
    sequences = _make_sequences(50)
    folds = kfold_split(sequences, k=5, seed=42)
    for train, val in folds:
        assert len(val) == 10
        assert len(train) == 40


def test_kfold_split_deterministic_with_seed():
    """Same seed → identical split across calls."""
    sequences = _make_sequences(50)
    folds_a = kfold_split(sequences, k=5, seed=42)
    folds_b = kfold_split(sequences, k=5, seed=42)
    for (ta, va), (tb, vb) in zip(folds_a, folds_b):
        assert [id(s) for s in ta] == [id(s) for s in tb]
        assert [id(s) for s in va] == [id(s) for s in vb]


def test_kfold_split_different_seeds_differ():
    """Different seeds → different splits (with overwhelming probability)."""
    sequences = _make_sequences(50)
    folds_a = kfold_split(sequences, k=5, seed=42)
    folds_b = kfold_split(sequences, k=5, seed=99)
    val_ids_a = [tuple(sorted(id(s) for s in val)) for _, val in folds_a]
    val_ids_b = [tuple(sorted(id(s) for s in val)) for _, val in folds_b]
    assert val_ids_a != val_ids_b


def test_kfold_split_does_not_mutate_input():
    """kfold_split must not reorder or modify the input list."""
    sequences = _make_sequences(50)
    original_ids = [id(s) for s in sequences]
    _ = kfold_split(sequences, k=5, seed=42)
    assert [id(s) for s in sequences] == original_ids


def test_kfold_split_k1_matches_split_sequences():
    """k=1 should reproduce the old split_sequences behavior (deterministic, no shuffle)."""
    sequences = _make_sequences(50)
    fold = kfold_split(sequences, k=1, seed=42)[0]
    old_train, old_val = split_sequences(sequences, val_ratio=0.2)
    assert [id(s) for s in fold[0]] == [id(s) for s in old_train]
    assert [id(s) for s in fold[1]] == [id(s) for s in old_val]


def test_kfold_split_rejects_k_greater_than_n():
    """k must not exceed the number of sequences."""
    sequences = _make_sequences(5)
    try:
        kfold_split(sequences, k=10, seed=42)
    except ValueError:
        return
    raise AssertionError("Expected ValueError when k > len(sequences)")
