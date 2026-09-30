"""Accès à la base SQLite : utilisateurs, sessions et données de l'appli."""
import json
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    extended_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS data (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
"""


class Conflict(Exception):
    """La version envoyée ne correspond pas à celle enregistrée."""

    def __init__(self, current: dict | None):
        super().__init__("conflict")
        self.current = current


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


# --- Utilisateurs ---

def create_user(conn, username: str, password_hash: str, created_at: str) -> int:
    with conn:
        cur = conn.execute("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                           (username, password_hash, created_at))
    return cur.lastrowid


def get_user_by_name(conn, username: str):
    return conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def get_user(conn, user_id: int):
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def set_password(conn, user_id: int, password_hash: str) -> None:
    with conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


# --- Sessions ---

def create_session(conn, token_hash: str, user_id: int, expires_at: int, now: int) -> None:
    with conn:
        conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at, extended_at) VALUES (?, ?, ?, ?)",
                     (token_hash, user_id, expires_at, now))


def get_session(conn, token_hash: str):
    return conn.execute("SELECT * FROM sessions WHERE token_hash = ?", (token_hash,)).fetchone()


def extend_session(conn, token_hash: str, expires_at: int, now: int) -> None:
    with conn:
        conn.execute("UPDATE sessions SET expires_at = ?, extended_at = ? WHERE token_hash = ?",
                     (expires_at, now, token_hash))


def delete_session(conn, token_hash: str) -> None:
    with conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def delete_user_sessions(conn, user_id: int) -> None:
    with conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def delete_expired_sessions(conn, now: int) -> None:
    with conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))


# --- Données ---

def get_all_data(conn, user_id: int) -> dict:
    rows = conn.execute("SELECT key, value, version FROM data WHERE user_id = ?", (user_id,))
    return {row["key"]: {"value": json.loads(row["value"]), "version": row["version"]} for row in rows}


def put_data(conn, user_id: int, key: str, value, expected_version: int | None, updated_at: str) -> int:
    """Enregistre `value` si `expected_version` est la version actuelle ; lève Conflict sinon."""
    with conn:
        row = conn.execute("SELECT value, version FROM data WHERE user_id = ? AND key = ?",
                           (user_id, key)).fetchone()
        current_version = row["version"] if row else None
        if current_version != expected_version:
            raise Conflict({"value": json.loads(row["value"]), "version": row["version"]} if row else None)
        new_version = (current_version or 0) + 1
        conn.execute("""INSERT INTO data (user_id, key, value, version, updated_at) VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value,
                        version = excluded.version, updated_at = excluded.updated_at""",
                     (user_id, key, json.dumps(value, ensure_ascii=False), new_version, updated_at))
    return new_version
