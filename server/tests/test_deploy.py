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

def test_caddy_limits_api_request_bodies():
    text = (DEPLOY / "Caddyfile.template").read_text()
    api_block = text.split("handle /api/*", 1)[1].split("@public", 1)[0]
    assert "request_body" in api_block and "max_size 2MB" in api_block

def test_install_opens_firewall_before_configuring_caddy():
    script = (DEPLOY / "install.sh").read_text()
    assert script.index("open_port 443") < script.index("> /etc/caddy/Caddyfile")

def test_apt_waits_for_the_dpkg_lock():
    script = (DEPLOY / "install.sh").read_text()
    calls = [l for l in script.splitlines() if "apt-get" in l and not l.strip().startswith("#")]
    assert calls and all("DPkg::Lock::Timeout" in l for l in calls)

def test_runtime_requirements_are_pinned():
    lines = [l.strip() for l in (DEPLOY.parent / "server" / "requirements.txt").read_text().splitlines()]
    assert all("==" in l for l in lines if l and not l.startswith("#"))

def test_scripts_use_unix_line_endings():
    for script in DEPLOY.glob("*.sh"):
        assert b"\r\n" not in script.read_bytes(), script.name
