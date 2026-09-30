"""Mots de passe, identifiants, jetons de session et limitation des tentatives."""
import base64
import hashlib
import hmac
import math
import re
import secrets
import time

MIN_PASSWORD = 8
MAX_PASSWORD = 1024

_USERNAME_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _DKLEN = 16384, 8, 1, 64


def normalize_username(name: str) -> str | None:
    """Identifiant en minuscules sans espaces autour, ou None s'il est invalide."""
    name = name.strip().lower()
    return name if _USERNAME_RE.match(name) else None


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p,
                          maxmem=128 * n * r * 2, dklen=_DKLEN)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class RateLimiter:
    """Refuse les connexions d'une IP après `max_failures` échecs en `window` secondes."""

    def __init__(self, max_failures: int = 5, window: int = 900, now=time.time):
        self.max_failures = max_failures
        self.window = window
        self.now = now
        self._failures: dict[str, list[float]] = {}

    def _recent(self, ip: str) -> list[float]:
        now = self.now()
        recent = [t for t in self._failures.get(ip, []) if now - t < self.window]
        if recent:
            self._failures[ip] = recent
        else:
            self._failures.pop(ip, None)
        return recent

    def retry_after(self, ip: str) -> int:
        recent = self._recent(ip)
        if len(recent) < self.max_failures:
            return 0
        return max(1, math.ceil(recent[-self.max_failures] + self.window - self.now()))

    def fail(self, ip: str) -> None:
        self._failures.setdefault(ip, []).append(self.now())

    def reset(self, ip: str) -> None:
        self._failures.pop(ip, None)
