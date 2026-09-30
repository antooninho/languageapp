#!/usr/bin/env bash
# Met l'appli à jour avec la dernière version de GitHub.
# Usage : sudo /opt/languageapp/deploy/update.sh
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Lance ce script avec sudo."; exit 1; }
cd /opt/languageapp

echo "==> Récupération de la dernière version"
git pull --ff-only

echo "==> Dépendances Python"
.venv/bin/pip install --quiet -r server/requirements.txt

echo "==> Services"
cp deploy/languageapp.service deploy/languageapp-backup.service deploy/languageapp-backup.timer /etc/systemd/system/
systemctl daemon-reload

echo "==> Caddy"
IP=$(sed -n 's#^https://\(.*\) {#\1#p' /etc/caddy/Caddyfile | head -1)
[[ -n "$IP" ]] || { echo "Adresse IP introuvable dans /etc/caddy/Caddyfile : relance install.sh."; exit 1; }
sed "s/__IP__/$IP/" deploy/Caddyfile.template > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy

echo "==> Redémarrage du serveur"
systemctl restart languageapp

echo
echo "Mise à jour terminée : https://$IP"
