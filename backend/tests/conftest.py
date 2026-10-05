"""Exercise backend HTTP adapters against the real root FastAPI/scorer in tests."""
import pytest
from fastapi.testclient import TestClient
from ai_engine.service import app as ai_app
import app.ai_adapters.client as adapter


@pytest.fixture(autouse=True)
def ai_transport(monkeypatch):
    # Only replace transport; actual FastAPI validation and root inference execute.
    original = adapter.httpx.Client
    def client(**kwargs):
        return TestClient(ai_app)
    monkeypatch.setattr(adapter.httpx, "Client", client)
    yield
    monkeypatch.setattr(adapter.httpx, "Client", original)
