import pytest
from fastapi.testclient import TestClient
from server import db
from server.app import create_app
from server.auth import hash_password

class Clock:
    def __init__(self): self.t = 1_800_000_000.0
    def __call__(self): return self.t

@pytest.fixture
def clock():
    return Clock()

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "t.db")
    conn = db.connect(path)
    db.create_user(conn, "antonin", hash_password("motdepasse"), "x")
    db.create_user(conn, "autre", hash_password("motdepasse"), "x")
    conn.close()
    return path

@pytest.fixture
def make_client(db_path, clock):
    def make(**kw):
        return TestClient(create_app(db_path, now=clock, **kw), base_url="https://testserver")
    return make

@pytest.fixture
def client(make_client):
    return make_client()

def login(client, username="antonin", password="motdepasse", **kw):
    return client.post("/api/login", json={"username": username, "password": password}, **kw)
