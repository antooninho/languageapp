# Appli russe v2 — Compte et serveur : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Servir l'appli depuis un VM Oracle en HTTPS sur IP publique, avec un compte unique dont les données (mots perso, progression, réglages) sont stockées sur le serveur.

**Architecture :**
- Un serveur FastAPI (package `server/`) avec SQLite expose `/api/*` : connexion par cookie de session, lecture et écriture des données par clé, avec contrôle de version.
- Côté navigateur, `storage.js` reste inchangé : il reçoit un nouveau backend (`js/remote-backend.js`) qui garde les données en mémoire et les envoie au serveur.
- Caddy sert les fichiers (liste blanche), relaie `/api/*` et obtient un certificat Let's Encrypt pour l'IP.
- Des scripts `deploy/*.sh` et un README en français rendent l'installation simple.

**Tech Stack :** Python 3.10+ (FastAPI, uvicorn, sqlite3, hashlib.scrypt), pytest + httpx, JS natif (modules ES), `node --test`, Caddy ≥ 2.11.4, systemd, Ubuntu 22.04/24.04.

**Spec :** `docs/superpowers/specs/2026-09-30-compte-serveur-design.md` (s'appuie sur `docs/superpowers/specs/2026-09-30-appli-russe-design.md`).

## Global Constraints

- **Python :** compatible 3.10 (Ubuntu 22.04). Dépendances d'exécution : `fastapi` et `uvicorn` uniquement. Dépendances de dev en plus : `pytest` et `httpx`.
- **Aucune dépendance JS.** Le front garde ses conventions v1 : chemins relatifs, texte en français, modules purs testés sous Node, et `localStorage` n'est plus utilisé du tout.
- **Cookie de session :** nommé `ru_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` = 2 592 000 s (30 jours). Il est `Secure` sauf en mode `--dev`.
- **Clés synchronisées :** `words-overrides`, `words-perso`, `deleted`, `progress`, `settings`, `meta`.
- **Limites :**
  - corps de requête : 2 Mo au plus (2 097 152 octets) ;
  - identifiant : `^[a-z0-9_-]{1,32}$` après `strip().lower()` ;
  - mot de passe : 8 à 1 024 caractères.
- **Tentatives de connexion :** 5 échecs en 900 s par IP, puis 429.
- **Chemins publics (identiques en mode dev et dans Caddy) :**
  - fichiers exacts : `/`, `/index.html`, `/manifest.webmanifest` ;
  - dossiers : `/css/`, `/js/`, `/data/`, `/icons/`.
- **Variables d'environnement :**
  - `RU_APP_DB` : chemin de la base, par défaut `./data.db` ;
  - `RU_APP_TRUST_PROXY=1` : l'IP du client est lue dans `X-Forwarded-For` ;
  - `RU_APP_DEV=1` : équivalent de `--dev`.
- **Chemins en production :**
  - dépôt : `/opt/languageapp` ;
  - environnement Python : `/opt/languageapp/.venv` ;
  - base : `/var/lib/languageapp/data.db` ;
  - sauvegardes : `/var/lib/languageapp/backups` ;
  - utilisateur système : `languageapp` ;
  - uvicorn écoute sur `127.0.0.1:8000`.
- Tous les messages vus par l'utilisateur sont en français.
- **Commandes de test :** `npm test` et `python -m pytest server/tests -q`. Les tests Python utilisent `TestClient(app, base_url="https://testserver")`, sans quoi httpx n'envoie pas les cookies `Secure`.

## Review Focus

1. **Session expirée pendant une révision (401 au milieu des envois)** : les réponses notées en attente ne doivent pas être perdues, et elles partent après reconnexion. Test dans la tâche 6.
2. **Deux réponses rapides sur la même clé pendant qu'un envoi est en cours** : pas de faux conflit 409. Le second envoi part avec la version renvoyée par le premier, et les écritures intermédiaires sont regroupées. Test dans la tâche 6.
3. **Chemin détourné en mode dev** (`/js/../server/app.py`, `/data/../data.db`, `/.git/config`) : 404, jamais le contenu du fichier. Test dans la tâche 4.
4. **Identifiant saisi avec majuscules ou espaces** (« Antonin ») : la connexion réussit, puisque le nom est normalisé comme à la création. Test dans la tâche 3.
5. **Limitation des tentatives derrière Caddy** : l'IP comptée est celle du client (`X-Forwarded-For`) quand `RU_APP_TRUST_PROXY=1`, et pas `127.0.0.1` pour tout le monde. Test dans la tâche 3.

---

## Structure des fichiers

```
server/__init__.py            (vide)
server/__main__.py            python -m server [--dev] [--host] [--port]
server/auth.py                mots de passe, identifiants, jetons, RateLimiter
server/db.py                  schéma SQLite et accès aux données
server/manage.py              create-user, change-password, backup
server/app.py                 create_app(...) : API + fichiers en mode dev
server/requirements.txt       fastapi, uvicorn
server/requirements-dev.txt   -r requirements.txt, pytest, httpx
server/tests/conftest.py      fixtures (app, client, utilisateur)
server/tests/test_auth.py     server/tests/test_db.py     server/tests/test_manage.py
server/tests/test_api_auth.py server/tests/test_api_data.py server/tests/test_deploy.py
js/api.js                     createApi(fetchFn)
js/remote-backend.js          createRemoteBackend(...)
js/ui/login-screen.js         renderLogin(...)
tests/api.test.js  tests/remote-backend.test.js
deploy/install.sh deploy/create-user.sh deploy/update.sh
deploy/Caddyfile.template deploy/languageapp.service
deploy/languageapp-backup.service deploy/languageapp-backup.timer
README.md
```
Modifiés : `js/app.js`, `js/ui/home.js`, `js/ui/settings-screen.js`, `index.html`, `css/app.css`, `.gitignore`.
Supprimés : `sw.js`, `tests/sw-assets.test.js`.

---

### Task 1 : Fondations du serveur (auth + base)

**Files :**
- Create : `server/__init__.py`, `server/auth.py`, `server/db.py`, `server/requirements.txt`, `server/requirements-dev.txt`, `server/tests/__init__.py`, `server/tests/test_auth.py`, `server/tests/test_db.py`
- Modify : `.gitignore` (ajouter `.venv/`, `data.db`, `*.db-wal`, `*.db-shm`, `.pytest_cache/`)

**Interfaces :**
- Produces (`auth.py`) :
  - `MIN_PASSWORD = 8`, `MAX_PASSWORD = 1024`
  - `normalize_username(name: str) -> str | None` : `strip().lower()`, puis `None` si le résultat ne respecte pas `^[a-z0-9_-]{1,32}$`.
  - `hash_password(password: str) -> str` au format `scrypt$16384$8$1$<sel b64>$<hash b64>` (sel de 16 octets, `dklen=64`) ; `verify_password(password: str, stored: str) -> bool` (temps constant ; `False` si le format stocké est invalide).
  - `new_token() -> str` (`secrets.token_urlsafe(32)`) ; `token_hash(token: str) -> str` (sha256 en hex).
  - `class RateLimiter(max_failures=5, window=900, now=time.time)` avec `retry_after(ip) -> int` (0 si c'est autorisé, sinon les secondes restantes, arrondies au supérieur), `fail(ip)` et `reset(ip)`.
- Produces (`db.py`) : `class Conflict(Exception)` avec l'attribut `current: dict` (`{"value", "version"}`), et :
  - `connect(path: str) -> sqlite3.Connection` : `row_factory = sqlite3.Row`, `journal_mode=WAL`, crée le schéma de la spec §4 s'il manque.
  - `create_user(conn, username, password_hash, created_at: str) -> int` : lève `sqlite3.IntegrityError` si le nom existe déjà.
  - `get_user_by_name(conn, username) -> Row | None`, `get_user(conn, user_id) -> Row | None`, `set_password(conn, user_id, password_hash)`.
  - `create_session(conn, token_hash, user_id, expires_at: int, now: int)`, `get_session(conn, token_hash) -> Row | None`, `extend_session(conn, token_hash, expires_at, now)`, `delete_session(conn, token_hash)`, `delete_user_sessions(conn, user_id)`, `delete_expired_sessions(conn, now)`.
  - `get_all_data(conn, user_id) -> dict[str, dict]` : `{clé: {"value": <JSON décodé>, "version": int}}`.
  - `put_data(conn, user_id, key, value, expected_version: int | None, updated_at: str) -> int` : écrit `json.dumps(value)`. Si la version enregistrée (ou `None`) diffère de `expected_version`, lève `Conflict` sans rien écrire. Renvoie la nouvelle version (ancienne + 1, ou 1).
  - Chaque fonction qui écrit fait un `commit`.

- [ ] **Step 1 : Écrire `server/requirements.txt`** (`fastapi`, `uvicorn`) et `server/requirements-dev.txt` (`-r requirements.txt`, `pytest`, `httpx`). Créer un environnement local (`python -m venv .venv`, puis `.venv/Scripts/python -m pip install -r server/requirements-dev.txt`). Compléter `.gitignore`.

- [ ] **Step 2 : Écrire les tests**

```python
# server/tests/test_auth.py
import pytest
from server.auth import normalize_username, hash_password, verify_password, new_token, token_hash, RateLimiter

def test_normalize_username():
    assert normalize_username("  Antonin ") == "antonin"
    assert normalize_username("a_b-9") == "a_b-9"
    for bad in ["", "   ", "a b", "é", "x" * 33, "a/b"]:
        assert normalize_username(bad) is None

def test_hash_and_verify():
    stored = hash_password("motdepasse")
    assert stored.startswith("scrypt$16384$8$1$")
    assert verify_password("motdepasse", stored)
    assert not verify_password("autre-chose", stored)
    assert hash_password("motdepasse") != stored          # sel aléatoire
    assert not verify_password("motdepasse", "n'importe quoi")

def test_tokens():
    t = new_token()
    assert len(t) >= 40 and t != new_token()
    assert token_hash(t) == token_hash(t) and len(token_hash(t)) == 64

def test_rate_limiter():
    clock = [1000.0]
    rl = RateLimiter(max_failures=5, window=900, now=lambda: clock[0])
    for _ in range(4):
        rl.fail("1.2.3.4")
    assert rl.retry_after("1.2.3.4") == 0
    rl.fail("1.2.3.4")
    assert rl.retry_after("1.2.3.4") == 900
    assert rl.retry_after("5.6.7.8") == 0
    clock[0] += 600
    assert rl.retry_after("1.2.3.4") == 300
    clock[0] += 300
    assert rl.retry_after("1.2.3.4") == 0
    rl.fail("5.6.7.8"); rl.reset("5.6.7.8")
    assert rl.retry_after("5.6.7.8") == 0
```

```python
# server/tests/test_db.py
import pytest, sqlite3
from server import db

@pytest.fixture
def conn(tmp_path):
    return db.connect(str(tmp_path / "t.db"))

def test_users(conn):
    uid = db.create_user(conn, "antonin", "h", "2026-09-30T12:00:00")
    assert db.get_user_by_name(conn, "antonin")["id"] == uid
    assert db.get_user_by_name(conn, "autre") is None
    with pytest.raises(sqlite3.IntegrityError):
        db.create_user(conn, "antonin", "h2", "2026-09-30T12:00:00")
    db.set_password(conn, uid, "h3")
    assert db.get_user(conn, uid)["password_hash"] == "h3"

def test_sessions(conn):
    uid = db.create_user(conn, "a", "h", "x")
    db.create_session(conn, "th", uid, expires_at=2000, now=1000)
    assert db.get_session(conn, "th")["user_id"] == uid
    db.extend_session(conn, "th", expires_at=5000, now=3000)
    assert db.get_session(conn, "th")["expires_at"] == 5000
    assert db.get_session(conn, "th")["extended_at"] == 3000
    db.create_session(conn, "old", uid, expires_at=10, now=0)
    db.delete_expired_sessions(conn, now=100)
    assert db.get_session(conn, "old") is None and db.get_session(conn, "th") is not None
    db.delete_user_sessions(conn, uid)
    assert db.get_session(conn, "th") is None

def test_data_versions_and_conflict(conn):
    uid = db.create_user(conn, "a", "h", "x")
    other = db.create_user(conn, "b", "h", "x")
    assert db.put_data(conn, uid, "progress", {"w": 1}, None, "t") == 1
    assert db.put_data(conn, uid, "progress", {"w": 2}, 1, "t") == 2
    with pytest.raises(db.Conflict) as e:
        db.put_data(conn, uid, "progress", {"w": 3}, 1, "t")
    assert e.value.current == {"value": {"w": 2}, "version": 2}
    with pytest.raises(db.Conflict):
        db.put_data(conn, uid, "settings", {}, 4, "t")      # n'existe pas : attendu None
    assert db.get_all_data(conn, uid) == {"progress": {"value": {"w": 2}, "version": 2}}
    assert db.get_all_data(conn, other) == {}
```

- [ ] **Step 3 : Lancer `.venv/Scripts/python -m pytest server/tests -q`.** Attendu : ÉCHEC (modules introuvables).
- [ ] **Step 4 : Implémenter `server/auth.py` et `server/db.py`.** `RateLimiter` garde, pour chaque IP, une liste d'horodatages d'échecs de moins de `window` secondes. `retry_after` vaut `ceil(oldest + window - now)` quand il y a au moins `max_failures` échecs.
- [ ] **Step 5 : Lancer les tests.** Attendu : PASS.
- [ ] **Step 6 : Commit** — `feat(serveur): hachage, sessions, limitation et base SQLite`

---

### Task 2 : Commandes d'administration

**Files :**
- Create : `server/manage.py`, `server/tests/test_manage.py`

**Interfaces :**
- Consumes : `auth.normalize_username`, `auth.hash_password`, `MIN_PASSWORD`/`MAX_PASSWORD`, et les fonctions `db.*` (tâche 1).
- Produces :
  - `main(argv: list[str], stdin=sys.stdin, stdout=sys.stdout) -> int` : code de sortie 0 en cas de succès, 1 en cas d'erreur, avec un message en français sur `stdout`.
  - `create-user <nom> [--password-stdin]` : sans l'option, `getpass` deux fois (les deux saisies doivent être identiques) ; avec l'option, une ligne lue sur `stdin`. Le nom est normalisé.
  - `change-password <nom> [--password-stdin]` : change le hash et supprime toutes les sessions de l'utilisateur.
  - `backup <dossier>` : `sqlite3.Connection.backup` vers `<dossier>/data-AAAA-MM-JJ.db` (date locale ; si le fichier existe, il est remplacé), puis suppression des plus anciens `data-*.db` au-delà de 14, par ordre de nom.
  - La base vient de `os.environ.get("RU_APP_DB", "data.db")`. Exécutable par `python -m server.manage …`.

- [ ] **Step 1 : Écrire les tests**

```python
# server/tests/test_manage.py
import io, os
from server import db, manage
from server.auth import verify_password

def run(tmp_path, monkeypatch, *argv, stdin=""):
    monkeypatch.setenv("RU_APP_DB", str(tmp_path / "t.db"))
    out = io.StringIO()
    code = manage.main(list(argv), stdin=io.StringIO(stdin), stdout=out)
    return code, out.getvalue()

def test_create_user(tmp_path, monkeypatch):
    code, out = run(tmp_path, monkeypatch, "create-user", "Antonin", "--password-stdin", stdin="motdepasse\n")
    assert code == 0
    user = db.get_user_by_name(db.connect(str(tmp_path / "t.db")), "antonin")
    assert verify_password("motdepasse", user["password_hash"])

def test_create_user_refuses_duplicate_short_password_and_bad_name(tmp_path, monkeypatch):
    assert run(tmp_path, monkeypatch, "create-user", "a", "--password-stdin", stdin="motdepasse\n")[0] == 0
    assert run(tmp_path, monkeypatch, "create-user", "a", "--password-stdin", stdin="motdepasse\n")[0] == 1
    assert run(tmp_path, monkeypatch, "create-user", "b", "--password-stdin", stdin="court\n")[0] == 1
    assert run(tmp_path, monkeypatch, "create-user", "a b", "--password-stdin", stdin="motdepasse\n")[0] == 1

def test_change_password_revokes_sessions(tmp_path, monkeypatch):
    run(tmp_path, monkeypatch, "create-user", "a", "--password-stdin", stdin="motdepasse\n")
    conn = db.connect(str(tmp_path / "t.db"))
    uid = db.get_user_by_name(conn, "a")["id"]
    db.create_session(conn, "th", uid, 9_999_999_999, 0)
    assert run(tmp_path, monkeypatch, "change-password", "a", "--password-stdin", stdin="nouveau-mdp\n")[0] == 0
    conn = db.connect(str(tmp_path / "t.db"))
    assert verify_password("nouveau-mdp", db.get_user(conn, uid)["password_hash"])
    assert db.get_session(conn, "th") is None
    assert run(tmp_path, monkeypatch, "change-password", "inconnu", "--password-stdin", stdin="nouveau-mdp\n")[0] == 1

def test_backup_keeps_14(tmp_path, monkeypatch):
    run(tmp_path, monkeypatch, "create-user", "a", "--password-stdin", stdin="motdepasse\n")
    backups = tmp_path / "backups"
    backups.mkdir()
    for day in range(1, 21):
        (backups / f"data-2026-01-{day:02d}.db").write_text("x")
    assert run(tmp_path, monkeypatch, "backup", str(backups))[0] == 0
    files = sorted(p.name for p in backups.glob("data-*.db"))
    assert len(files) == 14
    assert "data-2026-01-01.db" not in files
    newest = backups / files[-1]
    assert db.get_user_by_name(db.connect(str(newest)), "a") is not None
```

- [ ] **Step 2 : Lancer les tests.** Attendu : ÉCHEC.
- [ ] **Step 3 : Implémenter `server/manage.py`** avec `argparse` (sous-commandes), et le bloc `if __name__ == "__main__": sys.exit(main(sys.argv[1:]))`.
- [ ] **Step 4 : Lancer `python -m pytest server/tests -q`.** Attendu : PASS.
- [ ] **Step 5 : Commit** — `feat(serveur): commandes create-user, change-password et backup`

---

### Task 3 : API de connexion

**Files :**
- Create : `server/app.py`, `server/tests/conftest.py`, `server/tests/test_api_auth.py`

**Interfaces :**
- Consumes : tâches 1 et 2.
- Produces :
  - `create_app(db_path: str, dev: bool = False, trust_proxy: bool = False, now=time.time, root: str | None = None) -> FastAPI` (`root` : dossier des fichiers de l'appli, par défaut le parent de `server/`).
  - Constantes `SESSION_SECONDS = 30*24*3600`, `EXTEND_AFTER = 24*3600`, `COOKIE = "ru_session"`, `SYNC_KEYS`, `MAX_BODY = 2*1024*1024`, `PUBLIC_FILES = ["/", "/index.html", "/manifest.webmanifest"]`, `PUBLIC_DIRS = ["/css/", "/js/", "/data/", "/icons/"]`.
  - `client_ip(request, trust_proxy) -> str` : premier élément de `X-Forwarded-For` si `trust_proxy` et que l'en-tête est présent, sinon `request.client.host`.
  - Routes `POST /api/login`, `POST /api/logout` et `GET /api/me`, conformes à la spec §4.
  - Dépendance interne `current_user` :
    - lit le cookie, cherche `token_hash` et refuse si `expires_at <= now` ;
    - prolonge la session (et renvoie le cookie) si `now - extended_at > EXTEND_AFTER` ;
    - sinon 401 `{"error": "unauthenticated"}`.
  - Une connexion SQLite par requête (`db.connect`).
  - Toutes les erreurs sont en JSON `{"error": …}`.
  - `POST` sans `Content-Type: application/json` → 415 `{"error": "unsupported_media_type"}`.
  - Login avec un identifiant invalide ou un mot de passe de plus de 1 024 caractères → 401 `bad_credentials`, compté comme un échec.
  - À chaque login réussi, `delete_expired_sessions`.

- [ ] **Step 1 : Écrire les fixtures et les tests**

```python
# server/tests/conftest.py
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
```

```python
# server/tests/test_api_auth.py
from server.tests.conftest import login

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
```

- [ ] **Step 2 : Lancer les tests.** Attendu : ÉCHEC.
- [ ] **Step 3 : Implémenter `server/app.py`** (routes d'authentification). Le cookie se pose avec `response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=not dev, samesite="strict", path="/")` et s'efface avec `delete_cookie` et les mêmes attributs.
- [ ] **Step 4 : Lancer `python -m pytest server/tests -q`.** Attendu : PASS.
- [ ] **Step 5 : Commit** — `feat(serveur): API de connexion, sessions et limitation des tentatives`

---

### Task 4 : API des données, fichiers en mode dev, lancement

**Files :**
- Create : `server/__main__.py`, `server/tests/test_api_data.py`
- Modify : `server/app.py`

**Interfaces :**
- Produces :
  - `GET /api/data` et `PUT /api/data/{key}` selon la spec §4 :
    - 404 `{"error": "unknown_key"}` si la clé est inconnue ;
    - 413 `{"error": "too_large"}` si `Content-Length` ou le corps lu dépasse `MAX_BODY` ;
    - 400 `{"error": "bad_request"}` si le JSON est invalide, si `value` n'est ni objet ni tableau, ou si `version` n'est ni un entier ni `null` ;
    - 409 `{"error": "conflict", "current": …}`.
  - En mode `dev` : `GET` sur n'importe quel autre chemin sert le fichier si le chemin est dans `PUBLIC_FILES` ou commence par un des `PUBLIC_DIRS`, et si le chemin résolu reste sous `root` et est un fichier ; `/` sert `index.html`. Sinon 404. Hors mode dev, aucun fichier n'est servi.
  - `python -m server [--dev] [--host 127.0.0.1] [--port 8000]` : lit `RU_APP_DB`, `RU_APP_TRUST_PROXY` et `RU_APP_DEV`, puis `uvicorn.run(create_app(...), host, port)`. En mode dev, affiche `Appli : http://localhost:<port>`.

- [ ] **Step 1 : Écrire les tests**

```python
# server/tests/test_api_data.py
from server.tests.conftest import login

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

def test_no_static_outside_dev(client):
    assert client.get("/index.html").status_code == 404
```

- [ ] **Step 2 : Lancer les tests.** Attendu : ÉCHEC pour les nouveaux tests.
- [ ] **Step 3 : Implémenter les routes de données, le service des fichiers en mode dev et `server/__main__.py`.** Le corps de `PUT` est lu par `await request.body()`, puis décodé avec `json.loads`. Pour les fichiers : `Path(root, path.lstrip("/")).resolve()` doit être relatif à `Path(root).resolve()`, sinon 404.
- [ ] **Step 4 : Lancer `python -m pytest server/tests -q`.** Attendu : PASS.
- [ ] **Step 5 : Vérifier à la main.**
  - `RU_APP_DB=./data.db python -m server.manage create-user antonin`, puis `python -m server --dev`.
  - `curl -i http://localhost:8000/api/me` renvoie 401, et `http://localhost:8000/` renvoie la page (l'appli v1 s'affiche encore telle quelle).
- [ ] **Step 6 : Commit** — `feat(serveur): API des données, fichiers en mode dev et lancement`

---

### Task 5 : Client d'API (navigateur)

**Files :**
- Create : `js/api.js`, `tests/api.test.js`

**Interfaces :**
- Produces : `createApi(fetchFn = (...a) => fetch(...a))`, qui renvoie :
  - `me()`, `login(username, password)`, `logout()`, `loadData()`, `putData(key, value, version)` ;
  - chacune renvoie `Promise<{ status: number, body: any }>`, avec `body` = le JSON décodé si la réponse est en `application/json`, sinon `null` ;
  - une erreur réseau rejette la promesse (l'erreur de `fetch` est propagée telle quelle) ;
  - les URL sont relatives : `./api/me`, `./api/login`, `./api/logout`, `./api/data`, `./api/data/<clé>` ;
  - toutes les requêtes utilisent `credentials: 'same-origin'` ; `POST`/`PUT` ajoutent `Content-Type: application/json` et `JSON.stringify` du corps (`logout` envoie `{}`).

- [ ] **Step 1 : Écrire les tests**

```js
// tests/api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../js/api.js';

const jsonResponse = (status, body) => ({
  status, headers: { get: h => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
});
const recorder = response => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return response; };
  return { calls, fetchFn };
};

test('login envoie du JSON et renvoie statut + corps', async () => {
  const { calls, fetchFn } = recorder(jsonResponse(200, { username: 'antonin' }));
  const r = await createApi(fetchFn).login('antonin', 'motdepasse');
  assert.deepEqual(r, { status: 200, body: { username: 'antonin' } });
  assert.equal(calls[0].url, './api/login');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'antonin', password: 'motdepasse' });
});
test('putData', async () => {
  const { calls, fetchFn } = recorder(jsonResponse(200, { version: 3 }));
  await createApi(fetchFn).putData('progress', { a: 1 }, 2);
  assert.equal(calls[0].url, './api/data/progress');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { value: { a: 1 }, version: 2 });
});
test('me, loadData, logout', async () => {
  const { calls, fetchFn } = recorder({ status: 204, headers: { get: () => null } });
  const api = createApi(fetchFn);
  assert.deepEqual(await api.logout(), { status: 204, body: null });
  await api.me(); await api.loadData();
  assert.deepEqual(calls.map(c => [c.url, c.init.method ?? 'GET']),
    [['./api/logout', 'POST'], ['./api/me', 'GET'], ['./api/data', 'GET']]);
});
test('erreur réseau propagée', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.me(), TypeError);
});
```

- [ ] **Step 2 : Lancer `npm test`.** Attendu : ÉCHEC (module introuvable).
- [ ] **Step 3 : Implémenter `js/api.js`.**
- [ ] **Step 4 : Lancer `npm test`.** Attendu : PASS.
- [ ] **Step 5 : Commit** — `feat: client d'API du navigateur`

---

### Task 6 : Backend distant pour `storage.js`

**Files :**
- Create : `js/remote-backend.js`, `tests/remote-backend.test.js`

**Interfaces :**
- Consumes : l'objet renvoyé par `createApi` (tâche 5), que les tests remplacent par un faux ; `createStorage` (v1) pour un test d'intégration.
- Produces :
  - `SYNC_KEYS` (tableau des 6 clés) ;
  - `createRemoteBackend({ items, api, onStatus = () => {}, onConflict = () => {}, onUnauthorized = () => {}, retryDelay = 5000, setTimer = (fn, ms) => setTimeout(fn, ms) })`, qui renvoie `{ getItem(k), setItem(k, v), removeItem(k), pendingCount(), resume(), idle(): Promise<void> }`.

**Règles :**
- La mémoire est initialisée avec `ru-app:<clé>` → `JSON.stringify(items[clé].value)`, et les versions avec `items[clé].version`.
- `setItem` sur `ru-app:<clé synchronisée>` : la mémoire est mise à jour, `pending[clé] = v` (la dernière valeur gagne), puis la boucle d'envoi démarre si elle ne tourne pas déjà.
- **Boucle d'envoi** (une seule à la fois, arrêtée si `paused`) : pour la première clé en attente, on mémorise `sent = pending[clé]`, puis `await api.putData(clé, JSON.parse(sent), version[clé] ?? null)`.
  - **200** : `version[clé] = body.version`. Si `pending[clé] === sent`, la clé sort de l'attente. On continue.
  - **409** : mémoire et version remplacées par `body.current`, la clé sort de l'attente, `onConflict()`, puis on continue.
  - **401** : `paused = true`, `onUnauthorized()`, la boucle s'arrête. La valeur reste en attente.
  - **Autre statut (≥ 500) ou erreur réseau** : `onStatus('offline')`, `setTimer(relance, retryDelay)`, la boucle s'arrête.
  - **File vide** après au moins un envoi réussi dans cette boucle : `onStatus('saved')`.
- `resume()` lève la pause et relance la boucle.
- `idle()` renvoie la promesse de la boucle en cours, ou une promesse résolue.
- Les autres clés (par exemple `ru-app:corrupt-…`) et `removeItem` n'agissent que sur la mémoire.

- [ ] **Step 1 : Écrire les tests**

```js
// tests/remote-backend.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteBackend } from '../js/remote-backend.js';
import { createStorage } from '../js/storage.js';

// Faux serveur : chaque putData attend une réponse fournie par le test.
function fakeApi() {
  const calls = [];
  return {
    calls,
    putData(key, value, version) {
      return new Promise((resolve, reject) => calls.push({ key, value, version, resolve, reject }));
    },
  };
}
const tick = () => new Promise(r => setImmediate(r));
function setup(items = {}, extra = {}) {
  const api = fakeApi();
  const events = [];
  const timers = [];
  const backend = createRemoteBackend({
    items, api,
    onStatus: s => events.push(s), onConflict: () => events.push('conflict'),
    onUnauthorized: () => events.push('unauthorized'),
    setTimer: (fn, ms) => timers.push({ fn, ms }), ...extra,
  });
  return { api, events, timers, backend };
}

test('lecture des données initiales', () => {
  const { backend } = setup({ progress: { value: { a: 1 }, version: 4 } });
  assert.equal(backend.getItem('ru-app:progress'), '{"a":1}');
  assert.equal(backend.getItem('ru-app:settings'), null);
});
test('écriture envoyée avec la version, puis « saved »', async () => {
  const { api, events, backend } = setup({ progress: { value: {}, version: 4 } });
  backend.setItem('ru-app:progress', '{"a":2}');
  assert.equal(backend.getItem('ru-app:progress'), '{"a":2}');
  await tick();
  assert.deepEqual([api.calls[0].key, api.calls[0].value, api.calls[0].version], ['progress', { a: 2 }, 4]);
  api.calls[0].resolve({ status: 200, body: { version: 5 } });
  await backend.idle();
  assert.deepEqual(events, ['saved']);
  assert.equal(backend.pendingCount(), 0);
});
test('écritures rapides sur la même clé : regroupées, versions enchaînées, pas de faux conflit', async () => {
  const { api, backend } = setup();
  backend.setItem('ru-app:progress', '{"n":1}');
  await tick();
  backend.setItem('ru-app:progress', '{"n":2}');
  backend.setItem('ru-app:progress', '{"n":3}');
  api.calls[0].resolve({ status: 200, body: { version: 1 } });
  await tick(); await tick();
  assert.equal(api.calls.length, 2);
  assert.deepEqual([api.calls[1].value, api.calls[1].version], [{ n: 3 }, 1]);
  api.calls[1].resolve({ status: 200, body: { version: 2 } });
  await backend.idle();
  assert.equal(backend.pendingCount(), 0);
});
test('coupure réseau : « offline », nouvel essai après le délai', async () => {
  const { api, events, timers, backend } = setup({}, { retryDelay: 5000 });
  backend.setItem('ru-app:settings', '{"newPerDay":5}');
  await tick();
  api.calls[0].reject(new TypeError('Failed to fetch'));
  await backend.idle();
  assert.deepEqual(events, ['offline']);
  assert.equal(timers[0].ms, 5000);
  assert.equal(backend.pendingCount(), 1);
  timers[0].fn();
  await tick();
  api.calls[1].resolve({ status: 200, body: { version: 1 } });
  await backend.idle();
  assert.deepEqual(events, ['offline', 'saved']);
});
test('erreur serveur 5xx traitée comme une coupure', async () => {
  const { api, events, backend } = setup();
  backend.setItem('ru-app:meta', '{}');
  await tick();
  api.calls[0].resolve({ status: 502, body: null });
  await backend.idle();
  assert.deepEqual(events, ['offline']);
});
test('session expirée : rien n\'est perdu, reprise après resume()', async () => {
  const { api, events, timers, backend } = setup();
  backend.setItem('ru-app:progress', '{"a":1}');
  await tick();
  api.calls[0].resolve({ status: 401, body: { error: 'unauthenticated' } });
  await backend.idle();
  assert.deepEqual(events, ['unauthorized']);
  assert.equal(timers.length, 0);
  backend.setItem('ru-app:progress', '{"a":2}');
  await tick();
  assert.equal(api.calls.length, 1);                  // en pause
  backend.resume();
  await tick();
  assert.deepEqual(api.calls[1].value, { a: 2 });
  api.calls[1].resolve({ status: 200, body: { version: 1 } });
  await backend.idle();
  assert.equal(backend.pendingCount(), 0);
});
test('conflit : valeur du serveur reprise, « conflict » signalé', async () => {
  const { api, events, backend } = setup({ settings: { value: { newPerDay: 10 }, version: 1 } });
  backend.setItem('ru-app:settings', '{"newPerDay":3}');
  await tick();
  api.calls[0].resolve({ status: 409, body: { error: 'conflict', current: { value: { newPerDay: 7 }, version: 2 } } });
  await backend.idle();
  assert.deepEqual(events, ['conflict']);
  assert.equal(backend.getItem('ru-app:settings'), '{"newPerDay":7}');
  assert.equal(backend.pendingCount(), 0);
});
test('clés non synchronisées et removeItem restent locales', async () => {
  const { api, backend } = setup();
  backend.setItem('ru-app:corrupt-progress-1', 'x');
  backend.removeItem('ru-app:corrupt-progress-1');
  await tick();
  assert.equal(api.calls.length, 0);
  assert.equal(backend.getItem('ru-app:corrupt-progress-1'), null);
});
test('fonctionne avec createStorage', async () => {
  const { api, backend } = setup({ settings: { value: { newPerDay: 4, autoAudio: true }, version: 1 } });
  const storage = createStorage(backend);
  assert.equal(storage.getSettings().newPerDay, 4);
  storage.saveSettings({ autoAudio: false });
  await tick();
  assert.deepEqual([api.calls[0].key, api.calls[0].value], ['settings', { newPerDay: 4, autoAudio: false }]);
});
```

- [ ] **Step 2 : Lancer `npm test`.** Attendu : ÉCHEC.
- [ ] **Step 3 : Implémenter `js/remote-backend.js`.**
- [ ] **Step 4 : Lancer `npm test`.** Attendu : PASS.
- [ ] **Step 5 : Commit** — `feat: backend distant pour le stockage`

---

### Task 7 : Intégration dans l'appli

**Files :**
- Create : `js/ui/login-screen.js`
- Modify : `js/app.js`, `js/ui/home.js`, `js/ui/settings-screen.js`, `index.html`, `css/app.css`
- Delete : `sw.js`, `tests/sw-assets.test.js`

**Interfaces :**
- Consumes : `createApi` (tâche 5), `createRemoteBackend` (tâche 6), `createStorage` (v1).
- Produces :
  - `renderLogin(root, { api, message?: string, onLoggedIn: (username) => void })` ;
  - `ctx` gagne `username` et `logout()` ;
  - `index.html` gagne `<div id="status-banner" class="status-banner" hidden></div>` avant `<main>`.

**Comportement (spec §5) :**

- **`app.js`, démarrage :**
  1. `start()` charge `words.json` et initialise la voix (comme en v1), puis appelle `boot()`.
  2. `boot()` fait `api.me()` :
     - erreur réseau → écran « Impossible de joindre le serveur » avec **Réessayer**, qui relance `boot()` ;
     - 401 → `renderLogin` ;
     - 200 → `enter(username)`.
  3. `enter(username)` fait `api.loadData()` (401 → connexion, erreur réseau → écran de réessai), puis `createRemoteBackend({ items, api, onStatus, onConflict, onUnauthorized })`, `ctx.storage = createStorage(backend)`, et `navigate('home')`.
- **Réactions du backend :**
  - `onStatus('offline')` affiche le bandeau « Connexion perdue — tes dernières réponses ne sont pas encore enregistrées. » ; `'saved'` le masque.
  - `onUnauthorized` affiche la page de connexion avec « Ta session a expiré, reconnecte-toi. ». En cas de succès : `backend.resume()`, puis l'accueil, sans recharger les données.
  - `onConflict` refait `enter(username)`, puis affiche « Données mises à jour depuis un autre appareil. » dans le bandeau pendant 5 s.
- **`ctx.logout()`** appelle `api.logout()` (erreur ignorée), puis affiche la page de connexion.
- **Suppressions dans `app.js`** : enregistrement du service worker et `navigator.storage.persist()`.
- **`login-screen.js`** :
  - un `<form>` avec le titre « Russe », l'identifiant (`autocomplete="username"`, `autocapitalize="off"`, `autocorrect="off"`), le mot de passe (`type="password"`, `autocomplete="current-password"`) et **Se connecter** ;
  - pendant l'envoi, le bouton est désactivé ;
  - messages : 401 → « Identifiant ou mot de passe incorrect. », 429 → « Trop de tentatives. Réessaie dans N minutes. » (N = `ceil(retryAfter/60)`), erreur réseau → « Impossible de joindre le serveur. ».
- **`home.js`** : suppression du bandeau de rappel de sauvegarde (la fonction `needsBackupReminder` de `storage.js` reste).
- **`settings-screen.js`** : une carte en haut avec « Connecté en tant que <username> » et un bouton **Se déconnecter** qui appelle `ctx.logout()`. Le texte de la carte Sauvegarde devient : « Tes données sont enregistrées sur ton serveur. Tu peux aussi exporter une copie. »
- **`css/app.css`** : `.status-banner` fixé en haut (`position: sticky; top: 0`), fond `--warn-bg`, et prise en compte de la zone sûre en haut.

- [ ] **Step 1 : Supprimer `sw.js` et `tests/sw-assets.test.js`, implémenter les changements ci-dessus.**
- [ ] **Step 2 : Lancer `npm test`.** Attendu : PASS (sans le test du service worker).
- [ ] **Step 3 : Vérifier à la main** avec le navigateur piloté (Brave par CDP, profil au chemin court, base temporaire, `python -m server --dev`) :
  - mauvais mot de passe → message ; bon mot de passe → accueil ;
  - session de 10 nouveaux mots, puis rechargement → l'accueil indique 0 nouveau disponible (données relues depuis le serveur) ;
  - serveur arrêté pendant une session → bandeau « Connexion perdue » ; serveur relancé → bandeau masqué, et la progression est bien en base ;
  - écriture concurrente simulée (`PUT` direct avec la bonne version, puis réponse notée dans la page) → bandeau « Données mises à jour depuis un autre appareil » ;
  - **Se déconnecter** → page de connexion ; `GET /api/me` → 401 ;
  - aucune erreur dans la console.
- [ ] **Step 4 : Commit** — `feat: connexion et données enregistrées sur le serveur`

---

### Task 8 : Scripts de déploiement

**Files :**
- Create : `deploy/Caddyfile.template`, `deploy/languageapp.service`, `deploy/languageapp-backup.service`, `deploy/languageapp-backup.timer`, `deploy/install.sh`, `deploy/create-user.sh`, `deploy/update.sh`, `server/tests/test_deploy.py`
- Modify : `.gitattributes` (créé : `*.sh text eol=lf`, `deploy/* text eol=lf`), pour que les scripts gardent des fins de ligne Unix malgré Windows.

**Interfaces :**
- Consumes : `PUBLIC_FILES`, `PUBLIC_DIRS` (tâche 3) ; `python -m server`, `python -m server.manage` (tâches 2 et 4).

**`deploy/Caddyfile.template`** (`__IP__` est remplacé par l'installation) :

```
{
	cert_issuer acme {
		profile shortlived
	}
}

https://__IP__ {
	encode gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	@public path / /index.html /manifest.webmanifest /css/* /js/* /data/* /icons/*
	handle @public {
		root * /opt/languageapp
		header Cache-Control "no-cache"
		file_server
	}
	handle {
		respond 404
	}
}
```

**`deploy/languageapp.service`** :
- `User=languageapp`, `WorkingDirectory=/opt/languageapp` ;
- `Environment=RU_APP_DB=/var/lib/languageapp/data.db` et `Environment=RU_APP_TRUST_PROXY=1` ;
- `ExecStart=/opt/languageapp/.venv/bin/python -m server --host 127.0.0.1 --port 8000` ;
- `Restart=always`, `WantedBy=multi-user.target`.

**Sauvegarde :**
- `languageapp-backup.service` : `Type=oneshot`, même utilisateur et même environnement, `ExecStart=… -m server.manage backup /var/lib/languageapp/backups` ;
- `.timer` : `OnCalendar=*-*-* 03:00:00`, `Persistent=true`.

**`deploy/install.sh`** (`set -euo pipefail` ; messages en français, un `echo` par étape) :
1. Vérifications :
   - `EUID == 0`, sinon « Lance ce script avec sudo » ;
   - `/etc/os-release` contient `ID=ubuntu` ;
   - le script tourne depuis `/opt/languageapp`.
2. `IP="${1:-$(curl -4 -fsS https://ifconfig.me)}"`, qui doit ressembler à une IPv4. Demande de confirmation `[o/N]`, sauf avec `--yes`.
3. `apt-get update` et `apt-get install -y python3-venv curl debian-keyring debian-archive-keyring apt-transport-https gnupg iptables-persistent` (avec `DEBIAN_FRONTEND=noninteractive`).
4. Caddy depuis le dépôt officiel, si `caddy` est absent ou plus ancien que 2.11.4 :
   ```
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
   apt-get update && apt-get install -y caddy
   ```
   Puis vérification de `caddy version` ≥ 2.11.4 (arrêt avec un message sinon).
5. Système :
   - `id languageapp || useradd --system --home /var/lib/languageapp --shell /usr/sbin/nologin languageapp` ;
   - `install -d -o languageapp -g languageapp /var/lib/languageapp /var/lib/languageapp/backups`.
6. Python :
   - `python3 -m venv /opt/languageapp/.venv` ;
   - `/opt/languageapp/.venv/bin/pip install -r server/requirements.txt`.
7. Services :
   - copier les trois fichiers systemd dans `/etc/systemd/system/` ;
   - `systemctl daemon-reload` ;
   - `systemctl enable --now languageapp.service languageapp-backup.timer`.
8. Caddy :
   - `sed "s/__IP__/$IP/" deploy/Caddyfile.template > /etc/caddy/Caddyfile` ;
   - `caddy validate --config /etc/caddy/Caddyfile` ;
   - `systemctl enable caddy` et `systemctl reload caddy || systemctl restart caddy`.
9. Pare-feu : pour les ports 80 puis 443, ajouter la règle seulement si `iptables -C INPUT -p tcp --dport $p -j ACCEPT` échoue.
   - Elle s'insère avant la première règle `REJECT` de la chaîne INPUT (numéro trouvé avec `iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}'`), ou à la fin s'il n'y en a pas.
   - Puis `netfilter-persistent save`.
10. Message final :
    - « C'est prêt : https://$IP » ;
    - « Crée ton compte : sudo /opt/languageapp/deploy/create-user.sh <nom> » ;
    - « Le certificat HTTPS peut mettre une minute à arriver. S'il n'arrive pas, vérifie les ports 80/443 dans la console Oracle (voir le README). »

**Autres scripts :**
- **`deploy/create-user.sh <nom>`** : `sudo -u languageapp env RU_APP_DB=/var/lib/languageapp/data.db /opt/languageapp/.venv/bin/python -m server.manage create-user "$1"`, lancé depuis `/opt/languageapp`. Sans argument : message d'usage.
- **`deploy/update.sh`** :
  - `git -C /opt/languageapp pull --ff-only` ;
  - réinstallation des dépendances ;
  - recopie des fichiers systemd et `daemon-reload` ;
  - Caddyfile régénéré avec l'IP déjà écrite dans `/etc/caddy/Caddyfile` (lue par `sed -n 's#^https://\(.*\) {#\1#p'`), puis `reload` ;
  - `systemctl restart languageapp`.

- [ ] **Step 1 : Écrire le test de cohérence**

```python
# server/tests/test_deploy.py
import re
from pathlib import Path
from server.app import PUBLIC_FILES, PUBLIC_DIRS

DEPLOY = Path(__file__).resolve().parents[2] / "deploy"

def test_caddy_public_paths_match_dev_server():
    line = next(l for l in (DEPLOY / "Caddyfile.template").read_text().splitlines() if "@public path" in l)
    paths = set(line.split("path", 1)[1].split())
    assert paths == set(PUBLIC_FILES) | {d + "*" for d in PUBLIC_DIRS}

def test_service_environment():
    unit = (DEPLOY / "languageapp.service").read_text()
    assert "RU_APP_DB=/var/lib/languageapp/data.db" in unit
    assert "RU_APP_TRUST_PROXY=1" in unit
    assert "--host 127.0.0.1" in unit and "User=languageapp" in unit

def test_scripts_use_unix_line_endings():
    for script in DEPLOY.glob("*.sh"):
        assert b"\r\n" not in script.read_bytes(), script.name
```

- [ ] **Step 2 : Lancer `python -m pytest server/tests -q`.** Attendu : ÉCHEC.
- [ ] **Step 3 : Écrire les fichiers `deploy/*` et `.gitattributes`.**
- [ ] **Step 4 : Lancer `python -m pytest server/tests -q`.** Attendu : PASS. Puis `bash -n deploy/install.sh deploy/create-user.sh deploy/update.sh` : aucune erreur.
- [ ] **Step 5 : Commit** — `feat(deploy): scripts d'installation, services et configuration Caddy`

---

### Task 9 : README

**Files :**
- Create : `README.md`

Contenu selon la spec §7, en français, avec des commandes à copier-coller.

- **Console Oracle** : les noms de menus sont indiqués et accompagnés de la mention « les intitulés peuvent varier légèrement » :
  - **IP réservée :** *Compute → Instances → (ton instance) → Attached VNICs → (la VNIC) → IPv4 Addresses → ⋮ → Edit → Reserved public IP*.
  - **Ports :** *Networking → Virtual Cloud Networks → (ton VCN) → Security Lists → Default Security List → Add Ingress Rules*, deux règles : Source CIDR `0.0.0.0/0`, TCP, ports `80` puis `443`.
- **Restaurer une sauvegarde :** `sudo systemctl stop languageapp`, copier le fichier choisi vers `/var/lib/languageapp/data.db` avec `sudo install -o languageapp -g languageapp …`, puis `sudo systemctl start languageapp`.
- **Récupérer une sauvegarde sur son PC :** `scp ubuntu@<IP>:/var/lib/languageapp/backups/data-AAAA-MM-JJ.db .` (lecture via `sudo cp` vers le dossier personnel si besoin).

- [ ] **Step 1 : Écrire `README.md`.**
- [ ] **Step 2 : Relire en suivant chaque commande depuis zéro** (VM neuf → site en ligne → iPhone), et vérifier que chaque chemin et chaque nom de script correspond aux fichiers de la tâche 8.
- [ ] **Step 3 : Commit** — `docs: README d'installation et d'utilisation`

---

### Task 10 : Mise en ligne sur le VM (avec l'utilisateur)

Action publique sur la machine de l'utilisateur : guidée pas à pas, rien n'est lancé à sa place sans accord.

- [ ] **Step 1 :** fusionner sur `main` et pousser sur GitHub.
- [ ] **Step 2 :** l'utilisateur suit le README : IP réservée, ports, clone, `install.sh`, `create-user.sh`.
- [ ] **Step 3 : Vérifications** (commandes fournies à l'utilisateur) :
  - `curl -I https://<IP>` → 200, sans erreur de certificat ;
  - `curl https://<IP>/server/app.py` → 404 ;
  - `curl https://<IP>/api/me` → 401.
- [ ] **Step 4 : Sur l'iPhone** : ouvrir le site, se connecter, faire une session, l'installer sur l'écran d'accueil ; puis vérifier sur le PC que la progression est la même.
