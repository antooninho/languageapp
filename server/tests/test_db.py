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
