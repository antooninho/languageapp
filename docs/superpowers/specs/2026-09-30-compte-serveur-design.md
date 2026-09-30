# Appli de révision du russe v2 — Compte et serveur

Date : 2026-09-30
S'appuie sur : `docs/superpowers/specs/2026-09-30-appli-russe-design.md` (v1). Tout ce qui n'est pas modifié ici reste valable.

## 1. Objectif

Héberger l'appli sur un VM Oracle Cloud allumé en permanence, accessible par `https://<IP publique>`, avec un **compte personnel** : les mots perso, la progression et les réglages sont stockés sur le serveur. L'utilisateur retrouve tout sur iPhone comme sur PC, et ne perd rien en changeant de téléphone.

**Critères de réussite :**
- Un README en français permet d'installer le serveur en suivant des étapes simples, avec un script qui fait l'essentiel.
- Le site est servi en HTTPS avec un certificat valide pour l'IP publique, renouvelé automatiquement.
- Sans session valide, seule la page de connexion est utilisable ; aucune donnée n'est accessible sans connexion.
- Une réponse notée sur l'iPhone est visible sur le PC après rechargement.

## 2. Périmètre

**Dans la v2 :**
- Serveur Python (FastAPI + SQLite) exposant une API de connexion et de données.
- Caddy en frontal : HTTPS par certificat Let's Encrypt pour adresse IP (profil `shortlived`), service des fichiers de l'appli, relais de `/api/*`.
- Un seul compte, créé en ligne de commande sur le serveur ; pas d'inscription publique.
- Page de connexion, déconnexion, session de 30 jours glissants.
- Données de l'appli chargées depuis le serveur et enregistrées sur le serveur à chaque modification.
- Scripts `deploy/install.sh`, `deploy/create-user.sh`, `deploy/update.sh` pour Ubuntu, sauvegarde nocturne de la base.
- README en français.

**Retiré par rapport à la v1 :**
- Fonctionnement hors ligne : la connexion au serveur est requise. Le service worker est supprimé.
- Rappel de sauvegarde sur l'accueil : le serveur sauvegarde chaque nuit. L'export/import manuel reste disponible dans les Réglages.

**Hors v2 :** plusieurs utilisateurs, inscription, mot de passe oublié par e-mail, nom de domaine, fonctionnement hors ligne.

**Note :** la v1 n'a jamais été installée sur le téléphone. Il n'y a donc ni données locales à transférer ni ancien service worker à désinstaller ; ces deux points, évoqués pendant la conception, sont abandonnés.

## 3. Architecture

```
iPhone / PC ──HTTPS──▶ Caddy (ports 80/443)
                          ├─ fichiers de l'appli (liste blanche de chemins)
                          └─ /api/*  → uvicorn 127.0.0.1:8000 (FastAPI)
                                          └─ SQLite : /var/lib/languageapp/data.db
```

### Arborescence ajoutée

| Chemin | Rôle |
|---|---|
| `server/app.py` | Application FastAPI : routes de l'API, mode développement qui sert aussi les fichiers de l'appli. |
| `server/db.py` | Accès SQLite : création du schéma, utilisateurs, sessions, données. |
| `server/auth.py` | Hachage des mots de passe (scrypt), jetons de session, limitation des tentatives. |
| `server/manage.py` | Commandes : `create-user`, `change-password`, `backup`. |
| `server/__main__.py` | `python -m server --dev` : lance le serveur de développement sur `http://localhost:8000`. |
| `server/requirements.txt` | `fastapi`, `uvicorn`. |
| `server/requirements-dev.txt` | `pytest`, `httpx` (en plus des précédentes). |
| `server/tests/` | Tests pytest de l'API. |
| `js/api.js` | Appels à l'API depuis le navigateur. |
| `js/remote-backend.js` | Backend de `storage.js` : données en mémoire, envoyées au serveur à chaque modification. |
| `js/ui/login-screen.js` | Page de connexion. |
| `deploy/install.sh` | Installation complète sur Ubuntu. |
| `deploy/create-user.sh` | Création du compte. |
| `deploy/update.sh` | Mise à jour. |
| `deploy/Caddyfile.template` | Configuration Caddy, l'IP est substituée à l'installation. |
| `deploy/languageapp.service` | Service systemd du serveur Python. |
| `deploy/languageapp-backup.service`, `deploy/languageapp-backup.timer` | Sauvegarde nocturne. |
| `README.md` | Documentation en français. |

Supprimés : `sw.js`, `tests/sw-assets.test.js`.

## 4. Serveur

### Base de données (SQLite)

```sql
users    (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)
sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, extended_at INTEGER NOT NULL)
data     (user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL,
          updated_at TEXT NOT NULL, PRIMARY KEY (user_id, key))
```

- Chemin de la base : variable d'environnement `RU_APP_DB`. En production, `/var/lib/languageapp/data.db` ; en développement, `./data.db`, ignoré par git.
- Le schéma est créé au démarrage s'il n'existe pas.

### Mots de passe

- Hachage avec `hashlib.scrypt` (n=2¹⁴, r=8, p=1, sel aléatoire de 16 octets), stocké sous la forme `scrypt$16384$8$1$<sel base64>$<hash base64>`.
- Comparaison en temps constant (`hmac.compare_digest`).
- Au moins 8 caractères, vérifié par `create-user` et `change-password`.
- Identifiant : 1 à 32 caractères parmi `a-z`, `0-9`, `_`, `-`, en minuscules.

### Sessions

- Le jeton est tiré avec `secrets.token_urlsafe(32)`. Il est envoyé dans le cookie `ru_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age` = 30 jours). Seul son SHA-256 est stocké.
- Durée : 30 jours. À chaque requête authentifiée, si la dernière prolongation date de plus d'un jour, `expires_at` est repoussé à maintenant + 30 jours et le cookie est renvoyé.
- Les sessions expirées sont refusées, et supprimées lors de la connexion suivante.
- `change-password` supprime toutes les sessions de l'utilisateur.

### Limitation des tentatives

En mémoire, par adresse IP du client. Après 5 échecs de connexion en 15 minutes, `POST /api/login` répond 429 jusqu'à ce que le plus ancien de ces échecs ait plus de 15 minutes. Une connexion réussie remet le compteur de cette IP à zéro. L'IP réelle vient de l'en-tête `X-Forwarded-For` posé par Caddy (uvicorn `--proxy-headers --forwarded-allow-ips 127.0.0.1`).

### API

Toutes les réponses sont en JSON. Les requêtes `POST` et `PUT` doivent avoir `Content-Type: application/json` (sinon 415) : c'est la protection contre les requêtes venant d'autres sites, en plus de `SameSite=Strict`.

| Requête | Corps | Réponses |
|---|---|---|
| `POST /api/login` | `{ "username", "password" }` | 200 `{ "username" }` + cookie · 401 `{ "error": "bad_credentials" }` · 429 `{ "error": "too_many_attempts", "retryAfter": <secondes> }` |
| `POST /api/logout` | — | 204, session supprimée, cookie effacé (toujours 204, même sans session) |
| `GET /api/me` | — | 200 `{ "username" }` · 401 |
| `GET /api/data` | — | 200 `{ "items": { "<clé>": { "value": <JSON>, "version": <entier> } } }` · 401 |
| `PUT /api/data/<clé>` | `{ "value": <objet ou tableau JSON>, "version": <entier ou null> }` | 200 `{ "version": <nouvelle> }` · 400 · 401 · 404 (clé inconnue) · 409 `{ "error": "conflict", "current": { "value", "version" } }` · 413 |

- Sauf `login`, toute route sans session valide répond 401 `{ "error": "unauthenticated" }`.
- Clés acceptées : `words-overrides`, `words-perso`, `deleted`, `progress`, `settings`, `meta`.
- `value` doit être un objet ou un tableau JSON (sinon 400). Un corps de plus de 2 Mo reçoit 413.
- **Contrôle de version** : l'écriture n'est acceptée que si `version` vaut la version enregistrée (`null` si la clé n'existe pas encore). La nouvelle version vaut l'ancienne + 1 (ou 1). Sinon, 409 avec la valeur actuelle.
- En mode développement (`--dev`), le serveur sert aussi les fichiers de l'appli, avec la même liste blanche que Caddy.

### Commandes (`python -m server.manage …`)

- `create-user <nom>` : demande le mot de passe deux fois (sans l'afficher) et refuse un nom déjà pris.
- `change-password <nom>`
- `backup <dossier>` : copie la base avec l'API de sauvegarde de SQLite vers `<dossier>/data-AAAA-MM-JJ.db`, puis ne garde que les 14 copies les plus récentes.

## 5. Appli (navigateur)

### Démarrage

1. Chargement de `data/words.json` et initialisation de la voix, comme en v1.
2. `GET /api/me`.
   - 401 → page de connexion.
   - Erreur réseau → écran « Impossible de joindre le serveur » avec un bouton **Réessayer**.
3. Si l'utilisateur est connecté : `GET /api/data`, création du backend distant, `createStorage(backend)`, puis l'accueil.

### Page de connexion (`js/ui/login-screen.js`)

- Champ identifiant (`autocomplete="username"`, `autocapitalize="off"`), champ mot de passe (`type="password"`, `autocomplete="current-password"`) et bouton **Se connecter**, dans un `<form>`, pour que l'iPhone propose d'enregistrer le mot de passe.
- Messages :
  - 401 → « Identifiant ou mot de passe incorrect. »
  - 429 → « Trop de tentatives. Réessaie dans N minutes. »
  - erreur réseau → « Impossible de joindre le serveur. »
- En cas de succès, on reprend le démarrage à l'étape 3.

### Backend distant (`js/remote-backend.js`)

`createRemoteBackend({ items, api, onStatus, onConflict, onUnauthorized, retryDelay = 5000, setTimer = setTimeout })` renvoie un backend compatible avec `createStorage` : `getItem`, `setItem`, `removeItem`, plus `pendingCount()`.

- Les valeurs sont gardées en mémoire sous les clés `ru-app:<clé>`, déjà sérialisées en JSON comme en v1.
- `setItem` sur une clé synchronisée met à jour la mémoire, puis programme l'envoi (`PUT`) de la **dernière** valeur de cette clé. Les envois partent un par un, dans l'ordre.
- Les clés non synchronisées (`ru-app:corrupt-…`) restent en mémoire seulement. `removeItem` agit sur la mémoire seulement.
- Réponse 200 : la version est mise à jour et `onStatus('saved')` est appelé quand il ne reste rien à envoyer.
- Erreur réseau ou réponse 5xx : `onStatus('offline')`, nouvel essai après `retryDelay`, puis `onStatus('saved')` une fois tout envoyé.
- 401 : les envois sont suspendus (rien n'est perdu) et `onUnauthorized()` est appelé. Après reconnexion, `resume()` relance les envois.
- 409 : la valeur et la version du serveur remplacent celles en mémoire pour cette clé, la modification locale en attente sur cette clé est abandonnée, et `onConflict()` est appelé.

### Réactions de l'interface

- `offline` → bandeau fixe en haut : « Connexion perdue — tes dernières réponses ne sont pas encore enregistrées. » Il disparaît sur `saved`.
- `onUnauthorized` → page de connexion avec le message « Ta session a expiré, reconnecte-toi. » Après reconnexion : `resume()`, puis retour à l'accueil.
- `onConflict` → rechargement complet des données (`GET /api/data`), recréation du stockage, retour à l'accueil avec le bandeau « Données mises à jour depuis un autre appareil. »
- Réglages : « Connecté en tant que <nom> » et bouton **Se déconnecter** (`POST /api/logout`, puis page de connexion).
- Accueil : le bandeau de rappel de sauvegarde n'est plus affiché.

## 6. Déploiement

### Caddy

Caddy vient du dépôt officiel Caddy pour Ubuntu (version récente, nécessaire pour les certificats d'IP). Configuration générée depuis `deploy/Caddyfile.template` :

- site `https://<IP>` avec un certificat Let's Encrypt profil `shortlived`, renouvelé automatiquement par Caddy ;
- `/api/*` → `reverse_proxy 127.0.0.1:8000` ;
- fichiers servis depuis le dossier du dépôt, **uniquement** `/`, `/index.html`, `/manifest.webmanifest`, `/css/*`, `/js/*`, `/data/*`, `/icons/*` ; tout le reste (`/server`, `/deploy`, `/.git`, `/docs`, `/tests`, `/tools`) répond 404 ;
- en-tête `Cache-Control: no-cache` sur les fichiers de l'appli, pour qu'une mise à jour soit visible au rechargement suivant.

La syntaxe exacte de la configuration IP + `shortlived` est vérifiée dans la documentation de la version de Caddy installée au moment de l'implémentation.

### `deploy/install.sh` (Ubuntu 22.04 ou 24.04, x86 ou ARM ; lancé avec `sudo` depuis le dépôt cloné dans `/opt/languageapp`)

1. Vérifie qu'il tourne en root, sous Ubuntu, depuis `/opt/languageapp`.
2. Détermine l'IP publique (argument facultatif, sinon `curl -4 https://ifconfig.me`) et demande confirmation.
3. `apt` : `python3-venv`, `curl`, `iptables-persistent`, puis Caddy depuis son dépôt officiel.
4. Crée l'utilisateur système `languageapp` et le dossier `/var/lib/languageapp` (base et `backups/`) qui lui appartient.
5. Crée l'environnement Python `/opt/languageapp/.venv` et installe `server/requirements.txt`.
6. Installe et active `languageapp.service` (uvicorn sur `127.0.0.1:8000`, `RU_APP_DB=/var/lib/languageapp/data.db`, redémarrage automatique) et le timer de sauvegarde (chaque nuit à 3 h).
7. Écrit `/etc/caddy/Caddyfile` depuis le modèle et recharge Caddy.
8. Ouvre les ports 80 et 443 dans iptables (règles insérées avant le `REJECT` des images Oracle), puis les enregistre avec `netfilter-persistent save`.
9. Affiche l'adresse du site et la commande pour créer le compte.

Le script peut être relancé sans dommage.

### `deploy/create-user.sh <nom>` et `deploy/update.sh`

- `create-user.sh` lance `manage.py create-user` en tant que `languageapp`, avec la bonne base.
- `update.sh` : `git pull`, réinstallation des dépendances, redémarrage du service, rechargement de Caddy.

## 7. README (`README.md`, en français)

1. Présentation de l'appli en quelques lignes.
2. **Installer sur Oracle Cloud**, étape par étape, avec les noms exacts des menus de la console (pas de captures d'écran) :
   - réserver l'IP publique ;
   - ouvrir les ports 80 et 443 dans la « security list » ;
   - se connecter en SSH ;
   - `sudo git clone https://github.com/antooninho/languageapp.git /opt/languageapp` ;
   - `sudo /opt/languageapp/deploy/install.sh` ;
   - `sudo /opt/languageapp/deploy/create-user.sh <nom>`.
3. **Installer sur l'iPhone** : ouvrir `https://<IP>` dans Safari, Partager → « Sur l'écran d'accueil », installer la voix russe.
4. **Mettre à jour** : `sudo /opt/languageapp/deploy/update.sh`.
5. **Sauvegardes** : où elles sont, comment en copier une sur son PC (`scp`), comment restaurer.
6. **Changer de mot de passe.**
7. **En cas de problème** : voir les journaux (`journalctl -u languageapp`, `journalctl -u caddy`), les ports fermés, l'IP qui a changé.
8. **Développer en local** : `pip install -r server/requirements-dev.txt`, `python -m server --dev`, `npm test`, `pytest`.

## 8. Tests

- **pytest** (`server/tests/`) :
  - connexion réussie ou échouée, cookie posé avec ses attributs ;
  - 429 après 5 échecs, puis remise à zéro après une réussite ;
  - 401 sur toutes les routes sans session, session expirée refusée, prolongation ;
  - déconnexion ;
  - `GET`/`PUT` des données, version, 409, clé inconnue 404, valeur non objet 400, corps trop gros 413, mauvais `Content-Type` 415 ;
  - isolation entre deux utilisateurs ;
  - `create-user` refuse un doublon ou un mot de passe trop court ;
  - `backup` garde 14 copies ;
  - en mode dev, les fichiers hors liste blanche répondent 404.
- **Node** (`tests/remote-backend.test.js`, `tests/api.test.js`) : backend distant avec un faux `api` et un faux minuteur (envoi, regroupement des écritures d'une même clé, échec puis nouvel essai, 401 puis reprise, 409), et `api.js` avec un faux `fetch`.
- **Manuel** : parcours complet dans le navigateur piloté contre `python -m server --dev` ; installation réelle sur le VM en suivant le README ; essai sur l'iPhone.
