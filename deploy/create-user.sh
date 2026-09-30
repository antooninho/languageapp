#!/usr/bin/env bash
# Crée ton compte. Usage : sudo /opt/languageapp/deploy/create-user.sh <nom>
set -euo pipefail

[[ $# -eq 1 ]] || { echo "Usage : sudo $0 <nom>"; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Lance ce script avec sudo."; exit 1; }

cd /opt/languageapp
sudo -u languageapp env RU_APP_DB=/var/lib/languageapp/data.db \
  /opt/languageapp/.venv/bin/python -m server.manage create-user "$1"
