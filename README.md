# Russe — révisions

Une appli web pour réviser le vocabulaire russe sur iPhone (ou sur PC) :

- ~500 mots fréquents avec l'accent tonique, et tes propres mots ;
- cartes recto/verso, QCM, réponse tapée en cyrillique, prononciation audio ;
- répétition espacée : un mot bien su revient de moins en moins souvent ;
- un compte personnel : ta progression est enregistrée sur ton serveur et tu la retrouves sur tous tes appareils.

L'appli tourne sur un petit serveur (un VM Oracle Cloud allumé en permanence) et s'ouvre dans le navigateur à l'adresse `https://<IP de ton serveur>`.

---

## Sommaire

1. [Installer sur Oracle Cloud](#1-installer-sur-oracle-cloud)
2. [Installer sur l'iPhone](#2-installer-sur-liphone)
3. [Mettre à jour](#3-mettre-à-jour)
4. [Sauvegardes](#4-sauvegardes)
5. [Changer de mot de passe](#5-changer-de-mot-de-passe)
6. [En cas de problème](#6-en-cas-de-problème)
7. [Développer en local](#7-développer-en-local)

---

## 1. Installer sur Oracle Cloud

**Ce qu'il te faut :** un VM Oracle Cloud sous **Ubuntu** (22.04 ou 24.04), et la clé SSH que tu as téléchargée en le créant.

> Les intitulés de la console Oracle peuvent varier légèrement selon la langue et les mises à jour de l'interface.

### Étape 1 — Réserver l'adresse IP publique (console Oracle)

Par défaut, l'IP publique d'un VM est « éphémère » : elle peut changer, et l'adresse du site changerait avec elle. On la rend fixe (c'est gratuit).

1. Menu ☰ → **Compute** → **Instances** → clique sur ton instance.
2. En bas : **Attached VNICs** → clique sur la VNIC.
3. En bas : **IPv4 Addresses** → sur la ligne de l'adresse, menu **⋮** → **Edit**.
4. Choisis **No public IP** → **Update** (l'ancienne IP éphémère est libérée).
5. Recommence : **⋮** → **Edit** → **Reserved public IP** → **Create a new reserved IP** (donne-lui un nom, par exemple `russe`) → **Update**.
6. Note la nouvelle adresse IP : c'est l'adresse de ton site.

> ⚠️ L'IP change à cette étape. Fais-la **avant** l'installation.

### Étape 2 — Ouvrir les ports 80 et 443 (console Oracle)

1. Menu ☰ → **Networking** → **Virtual Cloud Networks** → clique sur le VCN de ton instance.
2. **Security Lists** → **Default Security List for …**
3. **Add Ingress Rules**, puis remplis :
   - Source CIDR : `0.0.0.0/0`
   - IP Protocol : `TCP`
   - Destination Port Range : `80`
4. **Add Ingress Rules** encore une fois, pareil avec le port `443`.

Le port 80 sert à obtenir et renouveler le certificat HTTPS, et le port 443 au site lui-même.

### Étape 3 — Se connecter au VM

Depuis ton PC (PowerShell ou le Terminal) :

```bash
ssh -i chemin/vers/ta-cle.key ubuntu@<IP>
```

### Étape 4 — Télécharger l'appli et lancer l'installation

Sur le VM :

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/antooninho/languageapp.git /opt/languageapp
sudo /opt/languageapp/deploy/install.sh
```

Le script trouve ton IP publique et te demande de la confirmer : réponds `o`. Il installe ensuite tout le nécessaire :

- Python et le serveur de l'appli ;
- Caddy, le serveur web qui gère le HTTPS ;
- la sauvegarde nocturne ;
- l'ouverture des ports dans le pare-feu du VM.

Ça prend quelques minutes. À la fin, il affiche `C'est prêt : https://<IP>`.

### Étape 5 — Créer ton compte

```bash
sudo /opt/languageapp/deploy/create-user.sh antonin
```

Remplace `antonin` par l'identifiant de ton choix : 1 à 32 caractères, lettres minuscules, chiffres, `_` ou `-`. Le script te demande ton mot de passe deux fois. Il faut au moins 8 caractères ; comme le site est accessible depuis Internet, choisis-en un vrai.

C'est fini : ouvre `https://<IP>` dans ton navigateur.

> Le certificat HTTPS peut mettre une minute à arriver après l'installation. Il est renouvelé automatiquement tous les quelques jours : tu n'as rien à faire.

---

## 2. Installer sur l'iPhone

1. Ouvre **Safari** (pas Chrome) et va sur `https://<IP>`.
2. Connecte-toi. L'iPhone propose d'enregistrer le mot de passe : accepte, il le remplira ensuite tout seul.
3. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**. L'appli a maintenant son icône « Я » et s'ouvre en plein écran.
4. **Pour entendre la prononciation :** Réglages → Accessibilité → Contenu énoncé → Voix → **Russe**, puis télécharge la voix **Milena**.
5. **Pour taper en cyrillique :** Réglages → Général → Clavier → Claviers → Ajouter un clavier → **Russe**.

Tu restes connecté 30 jours après ta dernière utilisation.

---

## 3. Mettre à jour

Quand une nouvelle version est sur GitHub, connecte-toi au VM et lance :

```bash
sudo /opt/languageapp/deploy/update.sh
```

Recharge ensuite la page sur ton téléphone.

---

## 4. Sauvegardes

Chaque nuit à 3 h, une copie de la base est faite dans `/var/lib/languageapp/backups/`. Les 14 dernières sont gardées (`data-AAAA-MM-JJ.db`).

**Voir les sauvegardes :**

```bash
sudo ls -l /var/lib/languageapp/backups/
```

**Faire une sauvegarde tout de suite :**

```bash
sudo systemctl start languageapp-backup.service
```

**Copier une sauvegarde sur ton PC.** Sur le VM, mets d'abord une copie lisible dans ton dossier :

```bash
sudo cp /var/lib/languageapp/backups/data-2026-10-01.db ~/ && sudo chown ubuntu ~/data-2026-10-01.db
```

Puis, depuis ton PC :

```bash
scp -i chemin/vers/ta-cle.key ubuntu@<IP>:data-2026-10-01.db .
```

**Restaurer une sauvegarde** (remplace toutes les données actuelles) :

```bash
sudo systemctl stop languageapp
sudo install -o languageapp -g languageapp -m 600 /var/lib/languageapp/backups/data-2026-10-01.db /var/lib/languageapp/data.db
sudo rm -f /var/lib/languageapp/data.db-wal /var/lib/languageapp/data.db-shm
sudo systemctl start languageapp
```

Tu peux aussi exporter une copie de tes données depuis l'appli : **Réglages → Exporter une sauvegarde**.

---

## 5. Changer de mot de passe

```bash
sudo /opt/languageapp/deploy/change-password.sh antonin
```

Tous tes appareils sont alors déconnectés : reconnecte-toi avec le nouveau mot de passe.

---

## 6. En cas de problème

**Le site ne s'ouvre pas du tout.**
- Vérifie les ports 80 et 443 dans la console Oracle (étape 2).
- Sur le VM, vérifie le pare-feu : `sudo iptables -L INPUT -n --line-numbers`. Les lignes `tcp dpt:80` et `tcp dpt:443` en `ACCEPT` doivent apparaître **avant** la ligne `REJECT`. Relancer `install.sh` les rajoute.

**Le navigateur affiche une erreur de certificat.** Regarde ce que dit Caddy :

```bash
sudo journalctl -u caddy -n 50
```

La cause la plus fréquente est le port 80 fermé : Let's Encrypt en a besoin pour vérifier que l'IP est bien à toi.

**« Impossible de joindre le serveur » dans l'appli.** Le serveur Python est peut-être arrêté :

```bash
sudo systemctl status languageapp
sudo journalctl -u languageapp -n 50
sudo systemctl restart languageapp
```

**L'adresse IP a changé** (si elle n'était pas réservée). Relance l'installation avec la nouvelle adresse :

```bash
sudo /opt/languageapp/deploy/install.sh <nouvelle-IP>
```

Tes données sont conservées.

**Trop de tentatives de connexion.** Après 5 mots de passe faux en 15 minutes, les connexions sont bloquées 15 minutes. Attends, ou redémarre le serveur (`sudo systemctl restart languageapp`).

---

## 7. Développer en local

Prérequis : Python 3.10+ et Node.js 20+.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r server/requirements-dev.txt     # Windows
# .venv/bin/python -m pip install -r server/requirements-dev.txt       # Linux / macOS

.venv/Scripts/python -m server.manage create-user test                 # crée un compte dans ./data.db
.venv/Scripts/python -m server --dev                                   # http://localhost:8000
```

**Tests :**

```bash
npm test                                       # logique de l'appli (Node)
.venv/Scripts/python -m pytest server/tests    # serveur (Python)
python tools/check_words.py data/words.json    # vérifie la liste de mots
```

**Organisation :**

| Dossier | Contenu |
|---|---|
| `index.html`, `css/`, `js/` | l'appli (JavaScript sans framework) |
| `data/words.json` | la liste de mots de base |
| `server/` | le serveur Python (FastAPI + SQLite) |
| `deploy/` | scripts d'installation, services systemd, configuration Caddy |
| `tools/` | vérification de la liste de mots, génération des icônes |
| `docs/superpowers/` | documents de conception et plans |
