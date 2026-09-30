#!/usr/bin/env bash
# Change ton mot de passe (et déconnecte tous tes appareils).
# Usage : sudo /opt/languageapp/deploy/change-password.sh <nom>
set -euo pipefail

[[ $# -eq 1 ]] || { echo "Usage : sudo $0 <nom>"; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Lance ce script avec sudo."; exit 1; }

cd /opt/languageapp
sudo -u languageapp env RU_APP_DB=/var/lib/languageapp/data.db \
  /opt/languageapp/.venv/bin/python -m server.manage change-password "$1"
