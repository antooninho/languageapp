import asyncio

import httpx

from server.app import create_app
from server.tests.conftest import login


def test_login_burst_cannot_bypass_rate_limit(db_path, clock):
    """10 connexions ouvertes d'un coup, corps envoyés ensemble : au plus 5 essais vérifiés."""
    app = create_app(db_path, now=clock)

    async def scenario():
        gate = asyncio.Event()

        async def body():
            await gate.wait()
            yield b'{"username": "antonin", "password": "mauvais"}'

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as c:
            tasks = [asyncio.create_task(c.post("/api/login", content=body(),
                                                headers={"Content-Type": "application/json"}))
                     for _ in range(10)]
            await asyncio.sleep(0.1)  # toutes les requêtes sont arrivées et attendent leur corps
            gate.set()
            return [(await t).status_code for t in tasks]

    statuses = asyncio.run(scenario())
    assert statuses.count(401) <= 5
    assert statuses.count(429) >= 5

def test_login_sets_secure_cookie(client):
    r = login(client)
    assert r.status_code == 200 and r.json() == {"username": "antonin"}
    cookie = r.headers["set-cookie"].lower()
    for part in ["ru_session=", "httponly", "secure", "samesite=strict", "path=/", "max-age=2592000"]:
        assert part in cookie
    assert client.get("/api/me").json() == {"username": "antonin"}

def test_dev_cookie_not_secure(make_client):
    r = login(make_client(dev=True))
    assert "secure" not in r.headers["set-cookie"].lower()

def test_login_normalizes_username(client):
    assert login(client, username="  Antonin ").status_code == 200

def test_bad_credentials(client):
    assert login(client, password="mauvais").status_code == 401
    assert login(client, password="mauvais").json() == {"error": "bad_credentials"}
    assert login(client, username="inconnu").status_code == 401
    assert login(client, username="a b").status_code == 401
    assert login(client, password="x" * 2000).status_code == 401

def test_requires_json_content_type(client):
    r = client.post("/api/login", content="username=antonin&password=motdepasse",
                    headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 415

def test_rate_limit_then_reset_on_success(client, clock):
    for _ in range(5):
        login(client, password="mauvais")
    r = login(client)
    assert r.status_code == 429 and r.json()["error"] == "too_many_attempts" and r.json()["retryAfter"] == 900
    clock.t += 901
    assert login(client).status_code == 200
    for _ in range(4):
        login(client, password="mauvais")
    assert login(client).status_code == 200          # le compteur avait été remis à zéro

def test_rate_limit_uses_forwarded_ip_behind_proxy(make_client):
    c = make_client(trust_proxy=True)
    for _ in range(5):
        login(c, password="mauvais", headers={"X-Forwarded-For": "1.1.1.1"})
    assert login(c, headers={"X-Forwarded-For": "1.1.1.1"}).status_code == 429
    assert login(c, headers={"X-Forwarded-For": "2.2.2.2"}).status_code == 200

def test_unauthenticated(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me").json() == {"error": "unauthenticated"}
    client.cookies.set("ru_session", "faux-jeton")
    assert client.get("/api/me").status_code == 401

def test_session_expires_and_slides(client, clock):
    login(client)
    clock.t += 29 * 24 * 3600
    assert client.get("/api/me").status_code == 200    # prolongée ici
    clock.t += 29 * 24 * 3600
    assert client.get("/api/me").status_code == 200
    clock.t += 31 * 24 * 3600
    assert client.get("/api/me").status_code == 401

def test_logout(client):
    login(client)
    assert client.post("/api/logout", json={}).status_code == 204
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/logout", json={}).status_code == 204
