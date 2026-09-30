import io
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
