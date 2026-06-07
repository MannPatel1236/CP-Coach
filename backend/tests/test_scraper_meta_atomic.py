"""Tests for atomic _meta.json writes in scrape_cf_data."""
import json
from unittest.mock import patch

from training.scrape_cf_data import _save_checkpoint, _meta_path


def test_save_checkpoint_atomic_on_crash(tmp_path):
    """A simulated crash mid-write must not corrupt the .meta.json."""
    out = tmp_path / "training.csv"
    out.touch()
    meta = _meta_path(out)

    # First write succeeds — sets baseline state
    _save_checkpoint(out, {"alice", "bob"}, 2)
    assert meta.exists()
    assert json.loads(meta.read_text()) == {"done": ["alice", "bob"], "next_uid": 2}

    # Simulate crash mid-write: os.fdopen raises before os.replace
    with patch("os.fdopen", side_effect=RuntimeError("simulated crash")):
        try:
            _save_checkpoint(out, {"alice", "bob", "charlie"}, 3)
        except RuntimeError:
            pass

    # Meta file is unchanged from the last successful write
    assert json.loads(meta.read_text()) == {"done": ["alice", "bob"], "next_uid": 2}

    # No .tmp sidecar left behind
    assert not list(tmp_path.glob("*.tmp"))


def test_save_checkpoint_normal_path(tmp_path):
    """A normal successful write updates the .meta.json correctly."""
    out = tmp_path / "training.csv"
    out.touch()
    _save_checkpoint(out, {"x"}, 1)
    assert json.loads(_meta_path(out).read_text()) == {"done": ["x"], "next_uid": 1}
