"""API du serveur : connexion par cookie de session et données de l'appli."""
import json
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from server import db
from server.auth import (MAX_PASSWORD, RateLimiter, hash_password, new_token, normalize_username,
                         token_hash, verify_password)

SESSION_SECONDS = 30 * 24 * 3600
EXTEND_AFTER = 24 * 3600
COOKIE = "ru_session"
SYNC_KEYS = ["words-overrides", "words-perso", "deleted", "progress", "settings", "meta"]
MAX_BODY = 2 * 1024 * 1024
PUBLIC_FILES = ["/", "/index.html", "/manifest.webmanifest"]
PUBLIC_DIRS = ["/css/", "/js/", "/data/", "/icons/"]

# Hash factice : un identifiant inconnu prend autant de temps à vérifier qu'un vrai.
_DUMMY_HASH = hash_password("mot-de-passe-factice")


class ApiError(Exception):
    def __init__(self, status: int, error: str, **extra):
        super().__init__(error)
        self.status, self.body = status, {"error": error, **extra}


def client_ip(request: Request, trust_proxy: bool) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if trust_proxy and forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "inconnu"


def require_json(request: Request) -> None:
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type != "application/json":
        raise ApiError(415, "unsupported_media_type")


async def read_json(request: Request):
    require_json(request)
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY:
        raise ApiError(413, "too_large")
    body = await request.body()
    if len(body) > MAX_BODY:
        raise ApiError(413, "too_large")
    try:
        return json.loads(body)
    except ValueError:
        raise ApiError(400, "bad_request")


def create_app(db_path: str, dev: bool = False, trust_proxy: bool = False, now=time.time,
               root: str | None = None) -> FastAPI:
    root_dir = Path(root) if root else Path(__file__).resolve().parent.parent
    db.connect(db_path).close()  # crée le schéma dès le démarrage
    limiter = RateLimiter(now=now)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def api_error(request, error: ApiError):
        return JSONResponse(error.body, status_code=error.status)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, error: StarletteHTTPException):
        names = {404: "not_found", 405: "method_not_allowed"}
        return JSONResponse({"error": names.get(error.status_code, "error")}, status_code=error.status_code)

    def get_conn():
        conn = db.connect(db_path)
        try:
            yield conn
        finally:
            conn.close()

    def set_session_cookie(response: Response, token: str) -> None:
        response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=not dev,
                            samesite="strict", path="/")

    def current_user(request: Request, response: Response, conn=Depends(get_conn)):
        token = request.cookies.get(COOKIE)
        if not token:
            raise ApiError(401, "unauthenticated")
        hashed = token_hash(token)
        session = db.get_session(conn, hashed)
        t = int(now())
        if session is None or session["expires_at"] <= t:
            raise ApiError(401, "unauthenticated")
        if t - session["extended_at"] > EXTEND_AFTER:
            db.extend_session(conn, hashed, t + SESSION_SECONDS, t)
            set_session_cookie(response, token)
        user = db.get_user(conn, session["user_id"])
        if user is None:
            raise ApiError(401, "unauthenticated")
        return user

    @app.post("/api/login")
    async def login(request: Request, response: Response, conn=Depends(get_conn)):
        ip = client_ip(request, trust_proxy)
        wait = limiter.retry_after(ip)
        if wait:
            raise ApiError(429, "too_many_attempts", retryAfter=wait)
        data = await read_json(request)
        raw_name = data.get("username") if isinstance(data, dict) else None
        password = data.get("password") if isinstance(data, dict) else None
        name = normalize_username(raw_name) if isinstance(raw_name, str) else None
        user = db.get_user_by_name(conn, name) if name else None
        valid_password = isinstance(password, str) and len(password) <= MAX_PASSWORD
        ok = verify_password(password if valid_password else "", user["password_hash"] if user else _DUMMY_HASH)
        if not (user and valid_password and ok):
            limiter.fail(ip)
            raise ApiError(401, "bad_credentials")
        limiter.reset(ip)
        t = int(now())
        db.delete_expired_sessions(conn, t)
        token = new_token()
        db.create_session(conn, token_hash(token), user["id"], t + SESSION_SECONDS, t)
        set_session_cookie(response, token)
        return {"username": user["username"]}

    @app.post("/api/logout", status_code=204)
    async def logout(request: Request, conn=Depends(get_conn)):
        require_json(request)
        token = request.cookies.get(COOKIE)
        if token:
            db.delete_session(conn, token_hash(token))
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, httponly=True, secure=not dev, samesite="strict", path="/")
        return response

    @app.get("/api/me")
    def me(user=Depends(current_user)):
        return {"username": user["username"]}

    return app
