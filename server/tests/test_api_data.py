import asyncio

import httpx

from server.app import create_app
from server.tests.conftest import login


def test_oversized_chunked_body_is_cut_off(db_path, clock):
    """Un corps envoyé par morceaux, sans Content-Length, n'est pas lu au-delà de la limite."""
    app = create_app(db_path, now=clock)
    pulled = []

    async def chunks():
        for _ in range(200):  # 200 × 64 Ko = 12,5 Mo
            pulled.append(1)
            yield b"x" * 65536

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as c:
            return await c.post("/api/login", content=chunks(), headers={"Content-Type": "application/json"})

    response = asyncio.run(scenario())
    assert response.status_code == 413
    assert len(pulled) <= 40


def test_deeply_nested_json_is_rejected(client):
    r = client.post("/api/login", content="[" * 100_000, headers={"Content-Type": "application/json"})
    assert r.status_code == 400

def put(client, key, value, version):
    return client.put(f"/api/data/{key}", json={"value": value, "version": version})

def test_requires_session(client):
    assert client.get("/api/data").status_code == 401
    assert put(client, "progress", {}, None).status_code == 401

def test_put_and_get_with_versions(client):
    login(client)
    assert client.get("/api/data").json() == {"items": {}}
    assert put(client, "progress", {"base-0001": {"state": "new"}}, None).json() == {"version": 1}
    assert put(client, "words-perso", [], None).json() == {"version": 1}
    assert put(client, "progress", {"base-0001": {"state": "review"}}, 1).json() == {"version": 2}
    assert client.get("/api/data").json() == {"items": {
        "progress": {"value": {"base-0001": {"state": "review"}}, "version": 2},
        "words-perso": {"value": [], "version": 1}}}

def test_conflict(client):
    login(client)
    put(client, "settings", {"newPerDay": 10}, None)
    r = put(client, "settings", {"newPerDay": 5}, None)
    assert r.status_code == 409
    assert r.json() == {"error": "conflict", "current": {"value": {"newPerDay": 10}, "version": 1}}

def test_rejects_bad_input(client):
    login(client)
    assert put(client, "passwords", {}, None).status_code == 404
    assert put(client, "progress", "texte", None).status_code == 400
    assert put(client, "progress", 3, None).status_code == 400
    assert put(client, "progress", {}, "1").status_code == 400
    assert client.put("/api/data/progress", content="{oops", headers={"Content-Type": "application/json"}).status_code == 400
    assert client.put("/api/data/progress", content='{"value":{},"version":null}',
                      headers={"Content-Type": "text/plain"}).status_code == 415
    big = {"x": "a" * (2 * 1024 * 1024)}
    assert put(client, "progress", big, None).status_code == 413

def test_users_are_isolated(make_client):
    a, b = make_client(), make_client()
    login(a); login(b, username="autre")
    put(a, "progress", {"secret": 1}, None)
    assert b.get("/api/data").json() == {"items": {}}

def test_dev_serves_only_public_files(make_client):
    c = make_client(dev=True)
    assert c.get("/").status_code == 200 and "<main id=\"app\">" in c.get("/").text
    assert c.get("/js/app.js").status_code == 200
    assert c.get("/data/words.json").status_code == 200
    for path in ["/server/app.py", "/js/../server/app.py", "/data/../data.db", "/.git/config",
                 "/README.md", "/js/", "/js/nexiste-pas.js", "/%2e%2e/server/app.py"]:
        assert c.get(path).status_code == 404, path

def test_public_file_rejects_raw_traversal():
    from pathlib import Path
    from server.app import public_file
    root = Path(__file__).resolve().parents[2]
    assert public_file(root, "js/app.js") == (root / "js" / "app.js").resolve()
    for raw in ["js/../server/app.py", "data/../data.db", "js/..", "css/../../etc/passwd", ".git/config", "js"]:
        assert public_file(root, raw) is None, raw

def test_no_static_outside_dev(client):
    assert client.get("/index.html").status_code == 404
