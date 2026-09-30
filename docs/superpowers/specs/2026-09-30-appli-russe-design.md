# Appli de révision du russe — Conception

Date : 2026-09-30

## 1. Objectif

Une appli personnelle pour réviser le **vocabulaire russe** en petites sessions (5–10 min) sur **iPhone**, y compris hors ligne.

**Utilisateur :** une seule personne, qui lit le cyrillique, niveau débutant (A1–A2), vocabulaire encore limité. Bon niveau en Python (un peu rouillé), pas de JS récent.

**Critères de réussite :**
- L'appli s'installe sur l'écran d'accueil de l'iPhone et fonctionne en mode avion.
- Une session se lance en un tap et propose les mots dus + quelques nouveaux mots.
- Les mots reviennent selon une répétition espacée : les mots sus reviennent de moins en moins souvent, les mots ratés reviennent vite.
- Les données peuvent être exportées et réimportées sans perte.

## 2. Périmètre

**Dans la v1 :**
- Liste de base d'environ 500 mots fréquents (A1–A2), avec accent tonique et traductions françaises.
- Ajout, modification et suppression de mots personnels ; modification des mots de base.
- 4 types d'exercices : carte recto/verso, QCM, réponse tapée en cyrillique, prononciation audio.
- Répétition espacée (SM-2 simplifié).
- Export/import JSON, rappel de sauvegarde.
- Compteur de jours d'affilée.
- Réglages : nombre de nouveaux mots par jour, lecture audio automatique on/off.

**Hors v1 :** exercices de grammaire (cas, conjugaisons, aspects), graphiques de statistiques, synchronisation entre appareils, comptes, notifications.

## 3. Architecture

**Techno :** PWA en HTML/CSS/JavaScript natif (modules ES), sans framework ni étape de compilation. Hébergement sur GitHub Pages.

**Hors ligne :** un service worker met en cache tous les fichiers de l'appli et `data/words.json`. Stratégie : cache d'abord, puis mise à jour en arrière-plan. La version du cache est incrémentée à chaque déploiement.

**Installation iPhone :** Safari → Partager → « Sur l'écran d'accueil ». Le `manifest.webmanifest` fournit le nom, les icônes et `display: standalone`.

### Modules

| Fichier | Rôle | Dépend de |
|---|---|---|
| `js/srs.js` | Calcul de la prochaine révision à partir de l'état d'un mot et d'une note. Fonctions pures. | — |
| `js/answers.js` | Normalisation et vérification d'une réponse tapée. Fonctions pures. | — |
| `js/session.js` | Construction d'une session et choix du type d'exercice pour chaque mot. Fonctions pures (la date et le hasard sont injectés en paramètres). | `srs.js` |
| `js/storage.js` | Lecture/écriture des mots, de la progression et des réglages ; export/import ; fusion de la liste de base. Seul module à toucher `localStorage`. | — |
| `js/speech.js` | Synthèse vocale russe (`speechSynthesis`, voix `ru-RU`) ; détection de la disponibilité d'une voix. | — |
| `js/ui/*.js` | Écrans : accueil, session, liste de mots, formulaire de mot, réglages. | tous |
| `js/app.js` | Point d'entrée, navigation entre écrans. | `ui/*` |
| `data/words.json` | Liste de base. | — |
| `tools/check_words.py` | Script de validation de `words.json`. | — |
| `sw.js` | Service worker. | — |

Les modules purs (`srs`, `answers`, `session`) ne touchent ni au DOM ni au stockage, et sont testés avec `node --test`.

## 4. Données

### Mot

```json
{
  "id": "base-0042",
  "ru": "молоко́",
  "fr": ["lait"],
  "type": "nom",
  "genre": "n",
  "theme": "nourriture",
  "source": "base"
}
```

- `ru` : accent tonique noté avec le caractère combinant U+0301, placé après la voyelle accentuée. Il est facultatif pour les mots perso et absent pour les mots d'une syllabe.
- `fr` : au moins une traduction ; toutes sont acceptées comme bonne réponse.
- `type` : `nom` | `verbe` | `adjectif` | `adverbe` | `autre`.
- `genre` : `m` | `f` | `n`, seulement pour les noms.
- `theme` : facultatif.
- `source` : `base` | `perso`.
- Identifiants : `base-NNNN` pour la liste de base, rangés par fréquence ; `perso-<horodatage>` pour les mots perso.

### Progression (séparée des mots, une entrée par id de mot)

```json
{
  "state": "new",
  "due": "2026-10-01",
  "interval": 0,
  "ease": 2.5,
  "reps": 0,
  "lapses": 0
}
```

- `state` : `new` (jamais vu) | `review`.
- `due` : date locale au format AAAA-MM-JJ.

### Stockage (`localStorage`, clés préfixées `ru-app:`)

- `ru-app:words-overrides` : mots de base modifiés par l'utilisateur, indexés par id.
- `ru-app:words-perso` : mots perso.
- `ru-app:deleted` : ids de mots de base supprimés par l'utilisateur.
- `ru-app:progress` : progression, indexée par id.
- `ru-app:settings` : `{ newPerDay: 10, autoAudio: true }`.
- `ru-app:meta` : `{ lastExport, streak, lastSessionDate, newIntroducedToday, newIntroducedDate }`.

Au démarrage, la liste effective est : mots de `words.json`, moins les ids supprimés, avec les modifications appliquées, plus les mots perso. Un mot de base ajouté à `words.json` lors d'une mise à jour apparaît simplement comme nouveau ; rien n'est écrasé.

Au premier lancement, l'appli appelle `navigator.storage.persist()`.

### Liste de base

- Environ 500 mots, rédigés pour le projet, rangés par fréquence, niveau A1–A2.
- `tools/check_words.py` vérifie : JSON valide, ids uniques, pas de doublon sur `ru` (accent ignoré), champs obligatoires présents, valeurs de `type`/`genre` valides, `genre` présent pour tous les noms et seulement pour eux, exactement un accent sur chaque mot de plus d'une voyelle (sauf s'il contient ё, qui est toujours accentué), aucun accent sur les mots d'une seule voyelle.
- Des erreurs de traduction ou d'accent restent possibles : l'utilisateur peut corriger tout mot de base depuis l'appli.

## 5. Session

### Accueil

Affiche le nombre de mots dus, le nombre de nouveaux mots disponibles aujourd'hui, les jours d'affilée et, si besoin, le rappel de sauvegarde. Bouton **Commencer**.

### Construction d'une session

1. Mots dus : `state = review` et `due ≤ aujourd'hui`, les plus en retard d'abord.
2. Nouveaux mots : `state = new`, dans l'ordre des ids (fréquence), dans la limite de `newPerDay` moins le nombre de nouveaux mots déjà introduits aujourd'hui.
3. Une session compte **20 cartes au maximum** : les révisions dues d'abord, puis les nouveaux mots. Les nouveaux mots sont répartis parmi les révisions, pas regroupés à la fin.
4. En fin de session, s'il reste des mots dus ou nouveaux : bouton **Continuer**.

### Choix de l'exercice selon le stade du mot

| Stade | Condition | Exercices possibles |
|---|---|---|
| Nouveau | `state = new` | Carte découverte (russe + audio + traduction + genre), suivie d'un QCM russe → français |
| Jeune | `interval < 3` | QCM russe → français **ou** carte recto/verso russe → français |
| Installé | `3 ≤ interval < 21` | Carte recto/verso français → russe **ou** QCM français → russe |
| Solide | `interval ≥ 21` | Réponse tapée français → russe (80 %) **ou** carte recto/verso français → russe (20 %) |

Quand plusieurs exercices sont possibles, le choix est aléatoire (50/50 sauf indication contraire).

### Notation

Quatre notes : `again` (Raté), `hard` (Difficile), `good` (Bien), `easy` (Facile).

- **Carte recto/verso** : l'utilisateur choisit parmi les 4 boutons après avoir retourné la carte.
- **QCM** : bonne réponse = `good`, mauvaise = `again`. Les 3 leurres sont des mots du même `type`, tirés au hasard, dont aucune traduction n'est identique à celle de la bonne réponse. S'il n'y a pas assez de mots du même type, on complète avec des mots d'autres types.
- **Réponse tapée** (voir `answers.js`) : exacte = `good` ; « presque » = `hard`, avec la correction affichée ; sinon `again`, avec la bonne réponse affichée.
- **Carte découverte** : pas de note ; le QCM qui suit fournit la note.
- Un mot noté `again` est remis en fin de file de la session actuelle, une seule fois. Seule la **première** note d'un mot dans la session est prise en compte par l'algorithme.

### Vérification d'une réponse tapée (`answers.js`)

Normalisation de la réponse et de chaque forme attendue : suppression des espaces en début et en fin, minuscules, suppression de U+0301, remplacement de ё par е.
- Identique à la forme attendue → exacte.
- Distance de Levenshtein = 1 et forme attendue d'au moins 5 lettres → presque.
- Sinon → fausse.

Pour une réponse tapée français → russe, la forme attendue est `ru`.

### Audio (`speech.js`)

- Utilise une voix `ru-RU` de `speechSynthesis`, de préférence « Milena » si elle est présente.
- Le mot russe est lu automatiquement quand il s'affiche, si `autoAudio` est activé, sauf dans les exercices français → russe, où il n'est lu qu'**après** la réponse.
- Bouton 🔊 pour réécouter.
- Si aucune voix russe n'est disponible : les boutons 🔊 sont masqués et une aide s'affiche une fois (Réglages iOS → Accessibilité → Contenu énoncé → Voix → Russe).

## 6. Répétition espacée (`srs.js`)

Entrée : progression actuelle, note, date du jour, générateur aléatoire. Sortie : nouvelle progression.

**Mot nouveau (`state = new`) :**
- `again` : reste `new`, sans changement (il revient en fin de session).
- `hard` ou `good` : `interval = 1`.
- `easy` : `interval = 3`.
- Dans ces trois derniers cas : `state = review`, `reps = 1`.

**Mot en révision :**
- `again` : `interval = 1`, `ease -= 0.2`, `lapses += 1`.
- `hard` : `interval = interval × 1.2`, `ease -= 0.15`.
- `good` : `interval = interval × ease`.
- `easy` : `interval = interval × ease × 1.3`, `ease += 0.15`.
- `reps += 1`.

**Règles communes :**
- `ease` est borné à [1.3, 3.0].
- Le nouvel intervalle est arrondi à l'entier le plus proche, puis vaut au moins `ancien intervalle + 1` pour `hard`, `good` et `easy`.
- Au-delà de 7 jours, on ajoute un bruit de ±5 % (arrondi), puis on plafonne à 365.
- `due = aujourd'hui + interval` (en jours calendaires locaux).

## 7. Sauvegarde et erreurs

- **Export** : un fichier `ru-app-sauvegarde-AAAA-MM-JJ.json` contenant `{ version: 1, exportedAt, overrides, perso, deleted, progress, settings, meta }`. Il est partagé via `navigator.share` avec un fichier si c'est possible, sinon téléchargé. Met à jour `meta.lastExport`.
- **Import** : le fichier est lu puis validé entièrement (version connue, structure et types attendus) **avant** toute écriture. S'il est invalide : message d'erreur, rien n'est modifié. S'il est valide : demande de confirmation (« remplace toutes les données actuelles »), puis remplacement.
- **Rappel** : sur l'accueil, si `lastExport` est absent ou date de plus de 7 jours et qu'au moins une session a été faite.
- **Données locales illisibles** (JSON corrompu) : la clé concernée est ignorée, un message invite à importer une sauvegarde, et la valeur brute est conservée sous `ru-app:corrupt-<clé>-<horodatage>`.
- **`words.json` impossible à charger** (premier lancement hors ligne, par exemple) : message « Connecte-toi une fois pour télécharger la liste de mots » ; les mots perso restent utilisables.

## 8. Écrans

1. **Accueil** : compteurs, jours d'affilée, rappel de sauvegarde, bouton Commencer, accès aux mots et aux réglages.
2. **Session** : un exercice à la fois, barre de progression, bouton pour quitter. Écran de fin avec un résumé (nombre de mots revus, nombre de ratés).
3. **Mes mots** : liste avec recherche et filtre base/perso ; tap sur un mot → formulaire.
4. **Formulaire de mot** : russe, traductions (plusieurs possibles), type, genre (si nom), thème. Placement de l'accent en touchant une voyelle du mot affiché. Actions : enregistrer, supprimer, remettre la progression à zéro, restaurer la version de base (pour un mot de base modifié).
5. **Réglages** : nouveaux mots par jour, audio automatique, export, import.

Interface pensée pour le téléphone : une colonne, gros boutons en bas de l'écran, respect des zones sûres de l'iPhone (`env(safe-area-inset-*)`), thème clair et sombre.

## 9. Tests

- **Automatisés** (`node --test`) : `srs.js` (chaque note, chaque état, bornes de `ease`, plafond, bruit contrôlé par un générateur injecté), `answers.js` (normalisation, ё/е, accent, seuil de Levenshtein), `session.js` (limite de nouveaux mots, ordre, taille maximale, choix d'exercice par stade, remise en file des ratés), validation de l'import dans `storage.js`.
- **Liste de base** : `python tools/check_words.py`.
- **Manuels sur iPhone** : installation sur l'écran d'accueil, mode avion, audio, clavier russe, export puis import.
