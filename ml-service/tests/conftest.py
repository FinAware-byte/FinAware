import json
from pathlib import Path

import pandas as pd
import pytest

from ml.config import ARTIFACT_DIR, DATA_PATH

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def dataset() -> pd.DataFrame:
    return pd.read_csv(DATA_PATH)


@pytest.fixture(scope="session")
def sample_request() -> dict:
    return json.loads((FIXTURES / "sample_request.json").read_text())


requires_model = pytest.mark.skipif(
    not (ARTIFACT_DIR / "pipeline.joblib").exists(), reason="model not trained — run `python -m ml.train` first"
)
