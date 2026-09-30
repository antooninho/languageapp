#!/usr/bin/env bash
# Installe l'appli sur un VM Ubuntu (Oracle Cloud).
# Usage : sudo /opt/languageapp/deploy/install.sh [IP] [--yes]
# Le script peut être relancé sans risque.
set -euo pipefail

APP_DIR=/opt/languageapp
DATA_DIR=/var/lib/languageapp
MIN_CADDY=2.11.4

step() { echo; echo "==> $*"; }
fail() { echo "Erreur : $*" >&2; exit 1; }

IP=""
YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    *) IP="$arg" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "lance ce script avec sudo."
grep -q '^ID=ubuntu' /etc/os-release || fail "ce script est prévu pour Ubuntu."
[[ "$(cd "$(dirname "$0")/.." && pwd)" == "$APP_DIR" ]] || fail "le dépôt doit être cloné dans $APP_DIR (voir le README)."
cd "$APP_DIR"

step "Adresse IP publique"
if [[ -z "$IP" ]]; then
  IP=$(curl -4 -fsS https://ifconfig.me) || fail "impossible de trouver l'IP publique ; passe-la en argument."
fi
[[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "« $IP » n'est pas une adresse IPv4."
echo "Le site sera servi sur https://$IP"
if [[ $YES -ne 1 ]]; then
  read -r -p "Est-ce bien ton IP publique réservée ? [o/N] " answer
  [[ "$answer" =~ ^[oOyY]$ ]] || fail "installation annulée."
fi

step "Paquets système"
export DEBIAN_FRONTEND=noninteractive
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | debconf-set-selections
apt-get update -q
apt-get install -y -q python3-venv curl debian-keyring debian-archive-keyring apt-transport-https gnupg iptables-persistent

caddy_ok() {
  command -v caddy >/dev/null || return 1
  local installed
  installed=$(caddy version | awk '{print $1}' | tr -d v)
  [[ "$(printf '%s\n' "$MIN_CADDY" "$installed" | sort -V | head -1)" == "$MIN_CADDY" ]]
}

step "Caddy (serveur web et certificat HTTPS)"
if ! caddy_ok; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi
caddy_ok || fail "Caddy $MIN_CADDY ou plus récent est nécessaire (installé : $(caddy version))."

step "Utilisateur et dossiers"
id languageapp >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin languageapp
install -d -o languageapp -g languageapp "$DATA_DIR" "$DATA_DIR/backups"

step "Environnement Python"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/.venv/bin/pip" install --quiet -r "$APP_DIR/server/requirements.txt"

step "Services (serveur Python et sauvegarde nocturne)"
cp deploy/languageapp.service deploy/languageapp-backup.service deploy/languageapp-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now languageapp.service languageapp-backup.timer
systemctl restart languageapp.service

step "Configuration de Caddy"
sed "s/__IP__/$IP/" deploy/Caddyfile.template > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

step "Pare-feu du VM (ports 80 et 443)"
open_port() {
  local port=$1 line
  if iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    return
  fi
  # Les images Oracle finissent la chaîne INPUT par un REJECT : la règle doit passer avant.
  line=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
  if [[ -n "$line" ]]; then
    iptables -I INPUT "$line" -p tcp --dport "$port" -j ACCEPT
  else
    iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
  fi
}
open_port 80
open_port 443
netfilter-persistent save
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

echo
echo "C'est prêt : https://$IP"
echo "Crée ton compte : sudo $APP_DIR/deploy/create-user.sh <nom>"
echo "Le certificat HTTPS peut mettre une minute à arriver. S'il n'arrive pas, vérifie les ports 80/443"
echo "dans la console Oracle (voir le README) et regarde : sudo journalctl -u caddy -n 50"
