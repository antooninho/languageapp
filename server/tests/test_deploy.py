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
