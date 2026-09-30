# Appli de révision du russe — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Une PWA hors ligne pour iPhone qui fait réviser du vocabulaire russe par répétition espacée, avec cartes, QCM, réponse tapée et audio.

**Architecture :** Des modules JavaScript natifs, sans framework ni compilation. La logique pure (`dates`, `srs`, `stress`, `answers`, `session`, `validate`) est testée sous Node. `storage.js` est le seul accès à `localStorage`, dont le backend est injectable pour les tests. Les écrans sont des fonctions `render*(root, ctx)`. Un service worker assure le hors-ligne et l'hébergement se fait sur GitHub Pages.

**Tech Stack :** HTML/CSS/JS (modules ES), Web Speech API, Service Worker, `node --test` (Node 24), Python 3.13 (script de validation, génération d'icônes avec Pillow).

**Spec :** `docs/superpowers/specs/2026-09-30-appli-russe-design.md`

## Global Constraints

- Aucune dépendance d'exécution, aucun framework. `package.json` ne contient que `"type": "module"` et le script `test`.
- Tous les chemins sont **relatifs** (`./js/app.js`, `./data/words.json`…), car l'appli est servie sous `https://<user>.github.io/<repo>/`.
- Tout le texte de l'interface est en français.
- L'accent tonique est le caractère combinant U+0301, placé juste après la voyelle accentuée.
- Les dates sont des chaînes locales `AAAA-MM-JJ`, produites et manipulées uniquement par `js/dates.js`.
- `localStorage` n'est lu ou écrit que par `js/storage.js`, avec des clés préfixées `ru-app:`.
- Les modules purs (`dates`, `srs`, `stress`, `answers`, `session`, `validate`) ne touchent ni au DOM ni au stockage, et reçoivent l'heure et le hasard en paramètres (`now`, `today`, `rand`).
- Voyelles russes : `аеёиоуыэюя` (et leurs majuscules).
- Mise en page pour mobile (iPhone Safari) : une colonne, zones sûres `env(safe-area-inset-*)`, thème clair et sombre via `prefers-color-scheme`.
- Commandes de test : `npm test` et `python -m unittest discover -s tools`.

## Review Focus

1. **Réponse tapée vide ou faite d'espaces** : doit être notée `wrong`, jamais `exact` ni `almost`. Test dans la tâche 2.
2. **Trop peu de mots pour un QCM** (par exemple 2 mots au total) : `pickDistractors` renvoie ce qui existe, et l'écran bascule sur une carte recto/verso si aucun leurre n'est disponible. Test dans la tâche 3, comportement d'interface dans la tâche 7.
3. **`newPerDay` abaissé sous le nombre de mots déjà introduits aujourd'hui** : zéro nouveau mot, sans valeur négative. Tests dans la tâche 3.
4. **Progression orpheline** (mot supprimé mais progression restante, ou sauvegarde importée incohérente) : ignorée par `buildSession` et `sessionCounts`. Test dans la tâche 3.
5. **Import d'un JSON valide mais sans rapport** (`null`, un tableau, version 2, `newPerDay: "10"`, `ease: "2.5"`) : refusé avec un message, et le stockage n'est pas modifié. Test dans la tâche 4.

---

## Structure des fichiers

```
index.html                 coquille HTML, <main id="app">
manifest.webmanifest       manifeste PWA
sw.js                      service worker (précache + mise à jour en arrière-plan)
css/app.css                styles
icons/                     icon-192.png, icon-512.png, apple-touch-icon.png
data/words.json            liste de base (~500 mots)
js/dates.js                todayISO, addDays, daysBetween
js/srs.js                  newProgress, grade
js/stress.js               STRESS, stripStress, vowelIndexes, setStress, stressedIndex
js/answers.js              normalize, levenshtein, checkTyped
js/session.js              stageOf, pickExercise, buildSession, sessionCounts, pickDistractors, shuffle, createRun…
js/validate.js             TYPES, isValidWord, isValidProgress, validateBackup
js/storage.js              createStorage(backend)
js/speech.js               initSpeech, hasRussianVoice, speak
js/app.js                  point d'entrée, routeur, contexte
js/ui/dom.js               h(), clear()
js/ui/home.js              écran d'accueil
js/ui/exercises.js         rendu des 6 exercices
js/ui/session-screen.js    déroulement d'une session
js/ui/words-screen.js      liste « Mes mots »
js/ui/word-form.js         formulaire de mot
js/ui/settings-screen.js   réglages, export/import
tools/check_words.py       validation de words.json
tools/test_check_words.py  tests du validateur
tools/make_icons.py        génération des icônes (Pillow)
tests/*.test.js            tests Node
```

---

### Task 1 : Mise en place, dates et répétition espacée

**Files :**
- Create : `package.json`, `.gitignore`, `js/dates.js`, `js/srs.js`
- Test : `tests/dates.test.js`, `tests/srs.test.js`

**Interfaces :**
- Produces :
  - `todayISO(now: Date = new Date()): string` renvoie la date locale `AAAA-MM-JJ`.
  - `addDays(iso: string, n: number): string`
  - `daysBetween(a: string, b: string): number` renvoie `b − a` en jours.
  - `newProgress(today: string): Progress` renvoie `{ state:'new', due:today, interval:0, ease:2.5, reps:0, lapses:0 }`.
  - `grade(p: Progress, rating: 'again'|'hard'|'good'|'easy', today: string, rand: () => number = Math.random): Progress` renvoie un **nouvel** objet.

- [ ] **Step 1 : Créer `package.json`** avec `{ "name": "ru-app", "private": true, "type": "module", "scripts": { "test": "node --test" } }`, et un `.gitignore` contenant `node_modules/`, `__pycache__/` et `.DS_Store`.

- [ ] **Step 2 : Écrire les tests de dates**

```js
// tests/dates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, addDays, daysBetween } from '../js/dates.js';

test('todayISO utilise la date locale', () => {
  assert.equal(todayISO(new Date(2026, 8, 30, 23, 59)), '2026-09-30');
  assert.equal(todayISO(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
});
test('addDays traverse mois, années et changements d\'heure', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-10-01', 0), '2026-10-01');
});
test('daysBetween', () => {
  assert.equal(daysBetween('2026-09-30', '2026-10-07'), 7);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-07', '2026-09-30'), -7);
});
```

- [ ] **Step 3 : Lancer `npm test`.** Attendu : ÉCHEC (module introuvable).

- [ ] **Step 4 : Implémenter `js/dates.js`.** `addDays` et `daysBetween` calculent en `Date.UTC(y, m-1, d)`, pour ne pas être faussés par le changement d'heure. `todayISO` utilise `getFullYear/getMonth/getDate`, complétés par des zéros.

- [ ] **Step 5 : Lancer `npm test`.** Attendu : les tests de dates PASSENT.

- [ ] **Step 6 : Écrire les tests SRS**

```js
// tests/srs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, grade } from '../js/srs.js';

const T = '2026-09-30';
const mid = () => 0.5;                       // facteur de bruit = 1.0
const rev = (interval, ease) => ({ state: 'review', due: T, interval, ease, reps: 3, lapses: 0 });

test('newProgress', () => {
  assert.deepEqual(newProgress(T), { state: 'new', due: T, interval: 0, ease: 2.5, reps: 0, lapses: 0 });
});
test('nouveau mot', () => {
  const n = newProgress(T);
  assert.deepEqual(grade(n, 'good', T, mid), { state: 'review', due: '2026-10-01', interval: 1, ease: 2.5, reps: 1, lapses: 0 });
  assert.equal(grade(n, 'hard', T, mid).interval, 1);
  assert.equal(grade(n, 'hard', T, mid).ease, 2.5);
  const e = grade(n, 'easy', T, mid);
  assert.equal(e.interval, 3); assert.equal(e.due, '2026-10-03');
  assert.deepEqual(grade(n, 'again', T, mid), n);
  assert.notEqual(grade(n, 'again', T, mid), n); // copie, pas le même objet
});
test('révision : good', () => {
  const a = grade(rev(1, 2.5), 'good', T, mid);
  assert.equal(a.interval, 3); assert.equal(a.due, '2026-10-03'); assert.equal(a.reps, 4);
  assert.equal(grade(rev(3, 2.5), 'good', T, mid).interval, 8);
});
test('révision : again', () => {
  assert.deepEqual(grade(rev(10, 2.5), 'again', T, mid),
    { state: 'review', due: '2026-10-01', interval: 1, ease: 2.3, reps: 4, lapses: 1 });
});
test('révision : hard et easy', () => {
  const h = grade(rev(10, 2.5), 'hard', T, mid);
  assert.equal(h.interval, 12); assert.equal(h.ease, 2.35);
  const e = grade(rev(20, 2.5), 'easy', T, mid);
  assert.equal(e.interval, 65); assert.equal(e.ease, 2.65);
});
test('bornes de ease', () => {
  assert.equal(grade(rev(10, 1.35), 'again', T, mid).ease, 1.3);
  const e = grade(rev(10, 2.95), 'easy', T, mid);
  assert.equal(e.ease, 3); assert.equal(e.interval, 38);
});
test('intervalle : minimum ancien + 1, plafond 365', () => {
  assert.equal(grade(rev(1, 1.3), 'hard', T, mid).interval, 2);
  assert.equal(grade(rev(300, 2.5), 'good', T, mid).interval, 365);
});
test('bruit ±5 % au-delà de 7 jours', () => {
  assert.equal(grade(rev(10, 2.5), 'good', T, () => 0).interval, 24);
  assert.equal(grade(rev(10, 2.5), 'good', T, () => 0.9999).interval, 26);
  assert.equal(grade(rev(1, 2.5), 'good', T, () => 0).interval, 3); // ≤ 7 : pas de bruit
});
```

- [ ] **Step 7 : Lancer `npm test`.** Attendu : ÉCHEC pour les tests SRS.

- [ ] **Step 8 : Implémenter `js/srs.js`.** L'ordre est imposé :

```
nouveau : again → copie inchangée ; hard/good → interval 1 ; easy → 3 ; state 'review', reps 1 ; ease inchangée
révision :
  again → interval 1, ease − 0.2, lapses + 1
  sinon → brut = hard: iv×1.2 | good: iv×ease | easy: iv×ease×1.3   (ease = ANCIENNE valeur)
          interval = max(round(brut), iv + 1)
          ease : hard − 0.15, easy + 0.15
  reps + 1
puis : ease = clamp(round2(ease), 1.3, 3.0)
       si interval > 7 : interval = round(interval × (1 + (rand() × 0.1 − 0.05)))
       interval = min(interval, 365)
       due = addDays(today, interval)
```

- [ ] **Step 9 : Lancer `npm test`.** Attendu : tout PASSE.

- [ ] **Step 10 : Commit**

```bash
git add package.json .gitignore js/dates.js js/srs.js tests/dates.test.js tests/srs.test.js
git commit -m "feat: dates et algorithme de répétition espacée"
```

---

### Task 2 : Accent tonique et vérification des réponses tapées

**Files :**
- Create : `js/stress.js`, `js/answers.js`
- Test : `tests/stress.test.js`, `tests/answers.test.js`

**Interfaces :**
- Produces :
  - `STRESS = '\u0301'`
  - `stripStress(s: string): string`
  - `vowelIndexes(word: string): number[]` : les indices des voyelles dans `stripStress(word)`.
  - `setStress(word: string, index: number): string` : retire tout accent, puis en ajoute un après la lettre `index` du mot sans accent. Lance une `RangeError` si cette lettre n'est pas une voyelle.
  - `stressedIndex(word: string): number` : l'indice (dans le mot sans accent) de la voyelle accentuée, ou `-1`.
  - `normalize(s: string): string` : suppression des espaces en début et en fin, minuscules, `stripStress`, remplacement de `ё` par `е`.
  - `levenshtein(a: string, b: string): number`
  - `checkTyped(input: string, expected: string): 'exact'|'almost'|'wrong'`

- [ ] **Step 1 : Écrire les tests**

```js
// tests/stress.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripStress, vowelIndexes, setStress, stressedIndex } from '../js/stress.js';

test('stripStress', () => { assert.equal(stripStress('молоко́'), 'молоко'); });
test('vowelIndexes', () => {
  assert.deepEqual(vowelIndexes('молоко'), [1, 3, 5]);
  assert.deepEqual(vowelIndexes('Ёлка'), [0, 3]);
});
test('setStress place et déplace l\'accent', () => {
  assert.equal(setStress('молоко', 5), 'молоко́');
  assert.equal(setStress('мо́локо', 5), 'молоко́');
  assert.throws(() => setStress('молоко', 0), RangeError);
});
test('stressedIndex', () => {
  assert.equal(stressedIndex('молоко́'), 5);
  assert.equal(stressedIndex('молоко'), -1);
});
```

```js
// tests/answers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, levenshtein, checkTyped } from '../js/answers.js';

test('normalize', () => {
  assert.equal(normalize('  Молоко́ '), 'молоко');
  assert.equal(normalize('ёлка'), 'елка');
});
test('levenshtein', () => {
  assert.equal(levenshtein('кот', 'кит'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('молоко', 'молоко'), 0);
});
test('checkTyped exact', () => {
  assert.equal(checkTyped('молоко', 'молоко́'), 'exact');
  assert.equal(checkTyped('МОЛОКО ', 'молоко́'), 'exact');
  assert.equal(checkTyped('елка', 'ёлка'), 'exact');
});
test('checkTyped almost : une faute sur un mot d\'au moins 5 lettres', () => {
  assert.equal(checkTyped('малоко', 'молоко́'), 'almost');
});
test('checkTyped wrong', () => {
  assert.equal(checkTyped('кит', 'кот'), 'wrong');
  assert.equal(checkTyped('малака', 'молоко́'), 'wrong');
  assert.equal(checkTyped('до', 'дом'), 'wrong');
});
test('réponse vide ou faite d\'espaces', () => {
  assert.equal(checkTyped('', 'молоко'), 'wrong');
  assert.equal(checkTyped('   ', 'молоко'), 'wrong');
});
```

- [ ] **Step 2 : Lancer `npm test`.** Attendu : ÉCHEC (modules introuvables).

- [ ] **Step 3 : Implémenter `js/stress.js` et `js/answers.js`.** `answers.js` importe `stripStress`. Dans `checkTyped`, une entrée vide après normalisation renvoie `'wrong'`. Le cas « almost » exige `levenshtein === 1` et une forme attendue normalisée d'au moins 5 caractères.

- [ ] **Step 4 : Lancer `npm test`.** Attendu : tout PASSE.

- [ ] **Step 5 : Commit**

```bash
git add js/stress.js js/answers.js tests/stress.test.js tests/answers.test.js
git commit -m "feat: accent tonique et vérification des réponses tapées"
```

---

### Task 3 : Construction et déroulement d'une session

**Files :**
- Create : `js/session.js`
- Test : `tests/session.test.js`

**Interfaces :**
- Consumes : `stripStress` (tâche 2).
- Produces :
  - `stageOf(p: Progress|undefined): 'new'|'young'|'settled'|'solid'` : `new` si `p` est absent ou si `state === 'new'` ; `young` si `interval < 3` ; `settled` si `interval < 21` ; sinon `solid`.
  - `pickExercise(p, rand): ExerciseType`, avec `ExerciseType` parmi `'discovery'|'mcq-ru-fr'|'flash-ru-fr'|'flash-fr-ru'|'mcq-fr-ru'|'typed-fr-ru'` :
    - `new` → `discovery`
    - `young` → `rand() < 0.5` ? `mcq-ru-fr` : `flash-ru-fr`
    - `settled` → `rand() < 0.5` ? `flash-fr-ru` : `mcq-fr-ru`
    - `solid` → `rand() < 0.8` ? `typed-fr-ru` : `flash-fr-ru`
  - `buildSession({ words, progress, today, newPerDay, newIntroducedToday, maxCards = 20 }): string[]` : liste d'ids.
  - `sessionCounts({ words, progress, today, newPerDay, newIntroducedToday }): { due: number, newAvailable: number }` : `due` n'est pas plafonné.
  - `pickDistractors(word, words, rand, count = 3): Word[]`
  - `shuffle(arr, rand): any[]` : Fisher-Yates sur une copie.
  - `createRun(ids: string[]): Run`, avec `Run = { queue: {wordId, retry}[], firstRatings: Record<string, Rating>, answered: number, total: number }`
  - `currentItem(run): {wordId, retry}|null`
  - `isFirstAnswer(run, wordId): boolean`
  - `recordAnswer(run, rating): Run` : renvoie un nouveau `Run`. Si c'est la première réponse pour ce mot, on mémorise `rating`. Si `rating === 'again'` et que l'élément n'est pas un `retry`, on remet `{wordId, retry:true}` en fin de file et on fait `total + 1`. Dans tous les cas, `answered + 1`.
  - `runSummary(run): { reviewed: number, failed: number }` : nombre de mots distincts, et nombre de premières notes `again`.

**Règles de `buildSession` :**
- On ignore les entrées de `progress` sans mot correspondant.
- Mots dus : `state === 'review' && due <= today`, triés par `due` croissant puis par `id`, et limités à `maxCards`.
- Nouveaux mots : mots sans progression ou avec `state === 'new'`, triés par `id`. On en prend `min(maxCards − nbDus, max(0, newPerDay − newIntroducedToday))`.
- Placement : le nouveau mot `k` (en partant de 0) est inséré après `floor((k+1) × R / (N+1))` révisions, où `R` est le nombre de révisions et `N` le nombre de nouveaux mots.

**Règles de `pickDistractors` :**
- On exclut le mot lui-même, tout mot qui partage une traduction avec lui (après `trim().toLowerCase()`), et tout mot de même `stripStress(ru).toLowerCase()`.
- On mélange les mots de même `type` puis les autres, et on prend d'abord ceux de même type.

- [ ] **Step 1 : Écrire les tests**

```js
// tests/session.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageOf, pickExercise, buildSession, sessionCounts, pickDistractors,
         createRun, currentItem, isFirstAnswer, recordAnswer, runSummary } from '../js/session.js';

const T = '2026-09-30';
const id = n => `base-${String(n).padStart(4, '0')}`;
const w = (i, type = 'nom', fr = [i], ru = 'ру' + i) => ({ id: i, ru, fr, type, source: 'base' });
const rev = (due, interval = 5) => ({ state: 'review', due, interval, ease: 2.5, reps: 1, lapses: 0 });
const opts = (words, progress, extra = {}) =>
  ({ words, progress, today: T, newPerDay: 10, newIntroducedToday: 0, ...extra });

test('stageOf', () => {
  assert.equal(stageOf(undefined), 'new');
  assert.equal(stageOf({ state: 'new', interval: 0 }), 'new');
  assert.equal(stageOf(rev(T, 2)), 'young');
  assert.equal(stageOf(rev(T, 3)), 'settled');
  assert.equal(stageOf(rev(T, 20)), 'settled');
  assert.equal(stageOf(rev(T, 21)), 'solid');
});
test('pickExercise', () => {
  assert.equal(pickExercise(undefined, () => 0), 'discovery');
  assert.equal(pickExercise(rev(T, 1), () => 0.2), 'mcq-ru-fr');
  assert.equal(pickExercise(rev(T, 1), () => 0.7), 'flash-ru-fr');
  assert.equal(pickExercise(rev(T, 5), () => 0.2), 'flash-fr-ru');
  assert.equal(pickExercise(rev(T, 5), () => 0.7), 'mcq-fr-ru');
  assert.equal(pickExercise(rev(T, 30), () => 0.5), 'typed-fr-ru');
  assert.equal(pickExercise(rev(T, 30), () => 0.9), 'flash-fr-ru');
});
test('buildSession : mots dus, triés par échéance', () => {
  const words = [1, 2, 3, 4].map(n => w(id(n)));
  const progress = { [id(1)]: rev('2026-09-29'), [id(2)]: rev(T), [id(3)]: rev('2026-10-01'), [id(4)]: rev('2026-09-28') };
  assert.deepEqual(buildSession(opts(words, progress, { newPerDay: 0 })), [id(4), id(1), id(2)]);
});
test('buildSession : nouveaux mots répartis parmi les révisions', () => {
  const words = Array.from({ length: 12 }, (_, i) => w(id(i + 1)));
  const progress = Object.fromEntries(words.slice(0, 10).map(x => [x.id, rev(T)]));
  assert.deepEqual(buildSession(opts(words, progress, { newPerDay: 2 })),
    [1, 2, 3, 11, 4, 5, 6, 12, 7, 8, 9, 10].map(id));
});
test('buildSession : 20 cartes au maximum, révisions en priorité', () => {
  const words = Array.from({ length: 30 }, (_, i) => w(id(i + 1)));
  const progress = Object.fromEntries(words.slice(0, 25).map(x => [x.id, rev(T)]));
  const s = buildSession(opts(words, progress));
  assert.equal(s.length, 20);
  assert.ok(s.every(x => progress[x]));
});
test('buildSession : limite de nouveaux mots par jour', () => {
  const words = Array.from({ length: 30 }, (_, i) => w(id(i + 1)));
  assert.deepEqual(buildSession(opts(words, {}, { newIntroducedToday: 4 })), [1, 2, 3, 4, 5, 6].map(id));
});
test('buildSession : newPerDay inférieur aux mots déjà introduits', () => {
  const words = Array.from({ length: 30 }, (_, i) => w(id(i + 1)));
  assert.deepEqual(buildSession(opts(words, {}, { newPerDay: 5, newIntroducedToday: 8 })), []);
  assert.deepEqual(sessionCounts(opts(words, {}, { newPerDay: 5, newIntroducedToday: 8 })), { due: 0, newAvailable: 0 });
});
test('buildSession : progression orpheline ignorée', () => {
  assert.deepEqual(buildSession(opts([], { 'perso-1': rev('2026-09-01') })), []);
  assert.deepEqual(sessionCounts(opts([], { 'perso-1': rev('2026-09-01') })), { due: 0, newAvailable: 0 });
});
test('sessionCounts ne plafonne pas les mots dus', () => {
  const words = Array.from({ length: 30 }, (_, i) => w(id(i + 1)));
  const progress = Object.fromEntries(words.slice(0, 25).map(x => [x.id, rev(T)]));
  assert.deepEqual(sessionCounts(opts(words, progress)), { due: 25, newAvailable: 5 });
});
test('pickDistractors : même type, pas de traduction commune', () => {
  const target = w(id(1), 'nom', ['lait']);
  const words = [target, w(id(2), 'nom', ['eau']), w(id(3), 'nom', ['pain']),
    w(id(4), 'nom', ['Lait ']), w(id(5), 'nom', ['thé']), w(id(6), 'verbe', ['boire'])];
  const d = pickDistractors(target, words, () => 0);
  assert.deepEqual(d.map(x => x.id).sort(), [id(2), id(3), id(5)]);
});
test('pickDistractors : complète avec d\'autres types, exclut le même mot russe', () => {
  const target = w(id(1), 'nom', ['lait'], 'молоко́');
  const words = [target, w(id(2), 'nom', ['eau']), w(id(3), 'nom', ['x'], 'молоко'),
    w(id(6), 'verbe', ['boire']), w(id(7), 'verbe', ['manger'])];
  assert.deepEqual(pickDistractors(target, words, () => 0).map(x => x.id).sort(), [id(2), id(6), id(7)]);
});
test('pickDistractors : trop peu de mots', () => {
  const target = w(id(1));
  assert.equal(pickDistractors(target, [target, w(id(2))], () => 0).length, 1);
  assert.equal(pickDistractors(target, [target], () => 0).length, 0);
});
test('run : un raté revient une seule fois, seule la première note compte', () => {
  let run = createRun(['a', 'b']);
  assert.deepEqual({ answered: run.answered, total: run.total }, { answered: 0, total: 2 });
  assert.equal(currentItem(run).wordId, 'a');
  assert.equal(isFirstAnswer(run, 'a'), true);
  run = recordAnswer(run, 'again');
  assert.deepEqual(run.queue.map(i => [i.wordId, i.retry]), [['b', false], ['a', true]]);
  assert.equal(isFirstAnswer(run, 'a'), false);
  run = recordAnswer(run, 'good');
  run = recordAnswer(run, 'again');
  assert.equal(currentItem(run), null);
  assert.deepEqual(run.firstRatings, { a: 'again', b: 'good' });
  assert.deepEqual({ answered: run.answered, total: run.total }, { answered: 3, total: 3 });
  assert.deepEqual(runSummary(run), { reviewed: 2, failed: 1 });
});
```

- [ ] **Step 2 : Lancer `npm test`.** Attendu : ÉCHEC.

- [ ] **Step 3 : Implémenter `js/session.js`** selon les interfaces et les règles ci-dessus.

- [ ] **Step 4 : Lancer `npm test`.** Attendu : tout PASSE.

- [ ] **Step 5 : Commit**

```bash
git add js/session.js tests/session.test.js
git commit -m "feat: construction et déroulement des sessions"
```

---

### Task 4 : Validation et stockage

**Files :**
- Create : `js/validate.js`, `js/storage.js`
- Test : `tests/validate.test.js`, `tests/storage.test.js`

**Interfaces :**
- Consumes : `todayISO`, `addDays`, `daysBetween` (tâche 1).
- Produces (`validate.js`) :
  - `TYPES = ['nom','verbe','adjectif','adverbe','autre']`
  - `isValidWord(w): boolean` : `id` et `ru` sont des chaînes non vides ; `fr` est un tableau non vide de chaînes non vides ; `type` appartient à `TYPES` ; `genre`, s'il est présent, vaut `m`/`f`/`n` et exige `type === 'nom'` ; `theme`, s'il est présent, est une chaîne ; `source` vaut `base` ou `perso`.
  - `isValidProgress(p): boolean` : `state` vaut `new` ou `review` ; `due` respecte `/^\d{4}-\d{2}-\d{2}$/` ; `interval`, `reps` et `lapses` sont des entiers ≥ 0 ; `ease` est un nombre dans [1.3, 3].
  - `validateBackup(data): { ok: true } | { ok: false, error: string }` :
    - `data` est un objet non tableau, avec `version === 1` ;
    - `overrides` est un objet de mots valides ;
    - `perso` est un tableau de mots valides ;
    - `deleted` est un tableau de chaînes ;
    - `progress` est un objet de progressions valides ;
    - `settings` contient `newPerDay` (entier entre 0 et 50) et `autoAudio` (booléen) ;
    - `meta` est un objet non tableau.
    - Le message d'erreur est en français et nomme la partie fautive, par exemple « Réglages invalides ».
- Produces (`storage.js`) : `createStorage(backend = globalThis.localStorage)` renvoie :
  - `corruptKeys: string[]` : les noms courts (`'progress'`…) des clés illisibles rencontrées.
  - `getEffectiveWords(baseWords): Word[]` : mots de base non supprimés, dans l'ordre du fichier, avec les modifications appliquées (la modification remplace l'objet entier), puis les mots perso.
  - `saveWord(word)` : `source === 'base'` → modification ; sinon ajout ou mise à jour dans `perso`.
  - `deleteWord(id)` : pour un mot de base, ajout à `deleted` et retrait de la modification ; pour un mot perso, retrait. La progression est supprimée dans les deux cas.
  - `restoreBase(id)`, `isOverridden(id): boolean`
  - `getProgress(): Record<string, Progress>`, `setProgress(id, p)`, `resetProgress(id)`
  - `getSettings(): { newPerDay, autoAudio }` (valeurs par défaut `10` et `true`, fusionnées avec les valeurs enregistrées), `saveSettings(partial): Settings`
  - `getMeta(): Meta` (valeurs par défaut `{ lastExport:null, streak:0, lastSessionDate:null, newIntroducedToday:0, newIntroducedDate:null, voiceHelpShown:false }`), `markVoiceHelpShown()`
  - `introducedCount(today): number`, `recordIntroduced(today)`
  - `recordActivity(today): number` : met à jour la série de jours d'affilée et la renvoie. Même jour → inchangée ; lendemain de `lastSessionDate` → +1 ; sinon → 1.
  - `currentStreak(today): number` : `streak` si `lastSessionDate` est aujourd'hui ou hier, sinon 0.
  - `needsBackupReminder(today): boolean` : `lastSessionDate !== null && (lastExport === null || daysBetween(lastExport, today) > 7)`.
  - `exportData(now = new Date()): Backup` : `{ version:1, exportedAt: now.toISOString(), overrides, perso, deleted, progress, settings, meta }`, et met `lastExport` à `todayISO(now)`.
  - `importData(data): { ok:true } | { ok:false, error }` : `validateBackup` d'abord ; n'écrit **rien** si c'est invalide.
- Clés utilisées : `ru-app:words-overrides`, `ru-app:words-perso`, `ru-app:deleted`, `ru-app:progress`, `ru-app:settings`, `ru-app:meta`. Une valeur illisible est copiée vers `ru-app:corrupt-<nom>-<Date.now()>`, supprimée de sa clé d'origine, et son nom est ajouté à `corruptKeys` ; la lecture renvoie alors la valeur par défaut.

- [ ] **Step 1 : Écrire les tests**

```js
// tests/storage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

const fakeBackend = () => {
  const m = new Map();
  return { _map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: k => m.delete(k) };
};
const b = (n, fr = ['x' + n]) => ({ id: `base-000${n}`, ru: 'ру' + n, fr, type: 'adverbe', source: 'base' });
const perso = { id: 'perso-1', ru: 'кот', fr: ['chat'], type: 'nom', genre: 'm', source: 'perso' };
const P = { state: 'review', due: '2026-10-01', interval: 1, ease: 2.5, reps: 1, lapses: 0 };

test('getEffectiveWords applique modifications, suppressions et mots perso', () => {
  const s = createStorage(fakeBackend());
  s.saveWord({ ...b(2), fr: ['modifié'] });
  s.deleteWord('base-0003');
  s.saveWord(perso);
  assert.deepEqual(s.getEffectiveWords([b(1), b(2), b(3)]).map(w => [w.id, w.fr[0]]),
    [['base-0001', 'x1'], ['base-0002', 'modifié'], ['perso-1', 'chat']]);
  assert.equal(s.isOverridden('base-0002'), true);
  s.restoreBase('base-0002');
  assert.equal(s.getEffectiveWords([b(2)])[0].fr[0], 'x2');
});
test('deleteWord supprime aussi la progression', () => {
  const s = createStorage(fakeBackend());
  s.saveWord(perso); s.setProgress('perso-1', P);
  s.deleteWord('perso-1');
  assert.deepEqual(s.getProgress(), {});
  assert.deepEqual(s.getEffectiveWords([]), []);
});
test('réglages par défaut et fusion', () => {
  const s = createStorage(fakeBackend());
  assert.deepEqual(s.getSettings(), { newPerDay: 10, autoAudio: true });
  s.saveSettings({ autoAudio: false });
  assert.deepEqual(s.getSettings(), { newPerDay: 10, autoAudio: false });
});
test('compteur de nouveaux mots par jour', () => {
  const s = createStorage(fakeBackend());
  s.recordIntroduced('2026-09-30'); s.recordIntroduced('2026-09-30');
  assert.equal(s.introducedCount('2026-09-30'), 2);
  assert.equal(s.introducedCount('2026-10-01'), 0);
  s.recordIntroduced('2026-10-01');
  assert.equal(s.introducedCount('2026-10-01'), 1);
});
test('jours d\'affilée', () => {
  const s = createStorage(fakeBackend());
  assert.equal(s.recordActivity('2026-09-29'), 1);
  assert.equal(s.recordActivity('2026-09-30'), 2);
  assert.equal(s.recordActivity('2026-09-30'), 2);
  assert.equal(s.currentStreak('2026-10-01'), 2);
  assert.equal(s.currentStreak('2026-10-02'), 0);
  assert.equal(s.recordActivity('2026-10-02'), 1);
});
test('rappel de sauvegarde', () => {
  const s = createStorage(fakeBackend());
  assert.equal(s.needsBackupReminder('2026-09-30'), false);
  s.recordActivity('2026-09-30');
  assert.equal(s.needsBackupReminder('2026-09-30'), true);
  s.exportData(new Date(2026, 8, 30, 12));
  assert.equal(s.needsBackupReminder('2026-10-07'), false);
  assert.equal(s.needsBackupReminder('2026-10-08'), true);
});
test('export puis import restaure les données', () => {
  const a = createStorage(fakeBackend());
  a.saveWord(perso); a.setProgress('perso-1', P); a.saveSettings({ newPerDay: 5 });
  const data = JSON.parse(JSON.stringify(a.exportData(new Date(2026, 8, 30, 12))));
  assert.equal(data.version, 1);
  const c = createStorage(fakeBackend());
  assert.deepEqual(c.importData(data), { ok: true });
  assert.deepEqual(c.getProgress(), { 'perso-1': P });
  assert.deepEqual(c.getSettings(), { newPerDay: 5, autoAudio: true });
  assert.deepEqual(c.getEffectiveWords([]), [perso]);
});
test('import invalide : refusé, rien n\'est écrit', () => {
  const backend = fakeBackend();
  const s = createStorage(backend);
  s.setProgress('perso-1', P);
  const valid = JSON.parse(JSON.stringify(s.exportData(new Date(2026, 8, 30))));
  const before = new Map(backend._map);
  for (const bad of [null, [], { version: 2 }, { ...valid, settings: { newPerDay: '10', autoAudio: true } },
                     { ...valid, progress: { x: { ...P, ease: '2.5' } } }, { ...valid, perso: [{ id: 'p' }] }]) {
    const r = s.importData(bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.error, 'string');
  }
  assert.deepEqual(backend._map, before);
});
test('données locales illisibles : mises de côté', () => {
  const backend = fakeBackend();
  backend.setItem('ru-app:progress', '{oops');
  const s = createStorage(backend);
  assert.deepEqual(s.getProgress(), {});
  assert.deepEqual(s.corruptKeys, ['progress']);
  assert.ok([...backend._map.keys()].some(k => k.startsWith('ru-app:corrupt-progress-')));
  assert.equal(backend.getItem('ru-app:progress'), null);
});
```

```js
// tests/validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidWord, isValidProgress } from '../js/validate.js';

test('isValidWord', () => {
  const ok = { id: 'perso-1', ru: 'кот', fr: ['chat'], type: 'nom', genre: 'm', source: 'perso' };
  assert.equal(isValidWord(ok), true);
  assert.equal(isValidWord({ ...ok, genre: undefined }), true);
  assert.equal(isValidWord({ ...ok, fr: [] }), false);
  assert.equal(isValidWord({ ...ok, fr: [''] }), false);
  assert.equal(isValidWord({ ...ok, type: 'verbe' }), false);   // genre sur un verbe
  assert.equal(isValidWord({ ...ok, genre: 'x' }), false);
  assert.equal(isValidWord({ ...ok, source: 'autre' }), false);
});
test('isValidProgress', () => {
  const ok = { state: 'review', due: '2026-10-01', interval: 1, ease: 2.5, reps: 1, lapses: 0 };
  assert.equal(isValidProgress(ok), true);
  assert.equal(isValidProgress({ ...ok, ease: 1.2 }), false);
  assert.equal(isValidProgress({ ...ok, interval: 1.5 }), false);
  assert.equal(isValidProgress({ ...ok, due: '1/10/2026' }), false);
  assert.equal(isValidProgress({ ...ok, state: 'learning' }), false);
});
```

- [ ] **Step 2 : Lancer `npm test`.** Attendu : ÉCHEC.

- [ ] **Step 3 : Implémenter `js/validate.js` puis `js/storage.js`.** Pour `getEffectiveWords` avec un mot perso sans `genre`, l'objet est renvoyé tel qu'il a été enregistré, sans ajouter `genre: undefined`.

- [ ] **Step 4 : Lancer `npm test`.** Attendu : tout PASSE.

- [ ] **Step 5 : Commit**

```bash
git add js/validate.js js/storage.js tests/validate.test.js tests/storage.test.js
git commit -m "feat: validation des données et stockage local"
```

---

### Task 5 : Validateur de liste et liste de base

**Files :**
- Create : `tools/check_words.py`, `tools/test_check_words.py`, `data/words.json`

**Interfaces :**
- Produces :
  - `check_words(words: list[dict]) -> list[str]` : les messages d'erreur en français, chacun préfixé de l'id concerné.
  - CLI : `python tools/check_words.py data/words.json` affiche `OK : N mots` et renvoie le code 0, ou affiche les erreurs et renvoie le code 1.
  - `data/words.json` : un tableau JSON de mots au format de la spec (§4), avec `source: "base"` et `id` de la forme `base-NNNN`, consécutifs à partir de `base-0001`, dans l'ordre de fréquence.

**Règles** (reprises de la spec §4), appliquées **mot par mot** (séparés par des espaces) dans `ru` :
- mot contenant `ё` → 0 accent ;
- mot d'une seule voyelle → 0 accent ;
- mot de plusieurs voyelles → exactement 1 accent ;
- chaque accent suit immédiatement une voyelle.

Le reste des règles : ids uniques au format `^base-\d{4}$`, `ru` unique après suppression des accents et passage en minuscules, champs obligatoires, `type` et `genre` comme dans `isValidWord`, `genre` **obligatoire** pour les noms de la liste de base.

- [ ] **Step 1 : Écrire les tests** (`unittest`, sans dépendance)

```python
# tools/test_check_words.py
import unittest
from check_words import check_words

def w(i, ru, **kw):
    base = {"id": f"base-{i:04d}", "ru": ru, "fr": ["x"], "type": "adverbe", "source": "base"}
    base.update(kw)
    return base

class CheckWordsTest(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(check_words([w(1, "молоко́", type="nom", genre="n"), w(2, "ёлка", type="nom", genre="f"),
                                      w(3, "дом", type="nom", genre="m"), w(4, "до свида́ния", type="autre")]), [])
    def test_duplicate_id(self):
        self.assertTrue(check_words([w(1, "да"), w(1, "нет")]))
    def test_duplicate_ru_ignoring_stress(self):
        self.assertTrue(check_words([w(1, "мо́локо"), w(2, "молоко́")]))
    def test_missing_stress(self):
        self.assertTrue(check_words([w(1, "молоко")]))
    def test_two_stresses(self):
        self.assertTrue(check_words([w(1, "мо́локо́")]))
    def test_stress_on_single_vowel_word(self):
        self.assertTrue(check_words([w(1, "до́м")]))
    def test_stress_on_yo_word(self):
        self.assertTrue(check_words([w(1, "ёлка́")]))
    def test_noun_needs_genre(self):
        self.assertTrue(check_words([w(1, "дом", type="nom")]))
    def test_verb_has_no_genre(self):
        self.assertTrue(check_words([w(1, "знать", type="verbe", genre="m")]))
    def test_bad_type_and_empty_fr(self):
        self.assertTrue(check_words([w(1, "да", type="truc")]))
        self.assertTrue(check_words([w(1, "да", fr=[])]))
    def test_bad_id(self):
        self.assertTrue(check_words([{**w(1, "да"), "id": "mot-1"}]))

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2 : Lancer `python -m unittest discover -s tools`.** Attendu : ÉCHEC (`check_words` introuvable).

- [ ] **Step 3 : Implémenter `tools/check_words.py`.** Lecture en UTF-8 ; sous Windows, appeler `sys.stdout.reconfigure(encoding="utf-8")` avant d'afficher.

- [ ] **Step 4 : Lancer `python -m unittest discover -s tools`.** Attendu : PASS.

- [ ] **Step 5 : Rédiger `data/words.json`**, environ 500 mots, par lots de 100. Lancer `python tools/check_words.py data/words.json` après chaque lot et corriger jusqu'à obtenir `OK`.
  - Contenu : les mots les plus fréquents du russe courant, niveau A1–A2. Pronoms et mots-outils usuels, verbes à l'infinitif (forme imperfective ; perfectif en entrée séparée seulement s'il est très courant, par exemple `сказа́ть`), adjectifs au masculin singulier, noms au nominatif singulier, quelques expressions figées (`спаси́бо`, `до свида́ния`).
  - Traductions françaises courtes, avec plusieurs entrées si deux traductions sont courantes (`["savoir", "connaître"]`).
  - Pas d'homographes qui ne diffèrent que par l'accent (le validateur les considère comme des doublons).
  - `theme` parmi : `salutations`, `personnes`, `famille`, `corps`, `nourriture`, `maison`, `ville`, `transport`, `temps`, `nombres`, `couleurs`, `école-travail`, `loisirs`, `nature`, `mots-outils`, `verbes-courants`, `adjectifs-courants`.
  - Format d'une entrée : `{ "id": "base-0001", "ru": "и", "fr": ["et"], "type": "autre", "theme": "mots-outils", "source": "base" }`.

- [ ] **Step 6 : Lancer `python tools/check_words.py data/words.json`.** Attendu : `OK : ~500 mots`.

- [ ] **Step 7 : Commit**

```bash
git add tools/check_words.py tools/test_check_words.py data/words.json
git commit -m "feat: liste de base de ~500 mots et son validateur"
```

---

### Task 6 : Coquille de l'appli, audio et accueil

**Files :**
- Create : `index.html`, `css/app.css`, `js/ui/dom.js`, `js/speech.js`, `js/app.js`, `js/ui/home.js`

**Interfaces :**
- Consumes : `createStorage` (tâche 4), `todayISO` (tâche 1), `sessionCounts` (tâche 3), `stripStress` (tâche 2).
- Produces :
  - `h(tag: string, attrs?: object, ...children): HTMLElement` : `attrs` accepte `class`, `on<Event>` (écouteur), les attributs HTML et `hidden`. Les enfants chaînes deviennent des nœuds texte ; `null`/`false` sont ignorés.
  - `clear(el)`
  - `initSpeech(): Promise<boolean>` : attend `voiceschanged` pendant 1 500 ms au plus, choisit une voix dont la langue commence par `ru`, en préférant un nom contenant `Milena`.
  - `hasRussianVoice(): boolean`
  - `speak(text: string)` : `speechSynthesis.cancel()`, puis lecture de `stripStress(text)` en `lang='ru-RU'`, `rate=0.9`.
  - `Ctx` (fourni à chaque écran) : `{ storage, baseWords: Word[], baseLoadFailed: boolean, speech: { hasRussianVoice, speak }, navigate(name: string, params?: object), today(): string }`
  - Écrans enregistrés dans `app.js` sous les noms `home`, `session`, `words`, `word-form`, `settings`. Chaque écran exporte `render<Nom>(root: HTMLElement, ctx: Ctx, params?: object)`. Un nom pas encore implémenté affiche « Bientôt disponible » avec un bouton Retour.

- [ ] **Step 1 : `index.html`.** Il contient :
  - `<html lang="fr">` ;
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` ;
  - `<meta name="apple-mobile-web-app-capable" content="yes">` ;
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">` ;
  - `<meta name="theme-color" ...>` ;
  - `<link rel="stylesheet" href="./css/app.css">` ;
  - `<main id="app"></main>` ;
  - `<script type="module" src="./js/app.js"></script>`.

- [ ] **Step 2 : `css/app.css`.**
  - Couleurs en variables sur `:root`, redéfinies sous `@media (prefers-color-scheme: dark)`.
  - Une colonne de 480 px au plus, centrée, avec des marges intérieures qui incluent `env(safe-area-inset-*)`.
  - Boutons principaux d'au moins 48 px de haut.
  - Classes `.btn`, `.btn-primary`, `.banner`, `.card`, `.options`, `.grade-buttons` (grille 2×2), `.correct`, `.wrong`, `.ru` (grande taille).
  - `-webkit-tap-highlight-color: transparent`.
  - Champs de saisie en `font-size: 16px`, pour éviter le zoom automatique d'iOS.

- [ ] **Step 3 : `js/ui/dom.js`, `js/speech.js`, `js/app.js`.**
  - Au démarrage, `app.js` fait `fetch('./data/words.json')`. En cas d'échec, `baseWords = []` et `baseLoadFailed = true`.
  - Il crée ensuite le stockage, attend `initSpeech()` et affiche `home`.
  - `navigate` vide `#app` puis affiche l'écran demandé.

- [ ] **Step 4 : `js/ui/home.js`.** Il affiche :
  - le titre « Russe » ;
  - `N mots à réviser · M nouveaux disponibles`, calculé avec `sessionCounts` à partir de `getEffectiveWords`, `getProgress`, `getSettings().newPerDay` et `introducedCount(today)` ;
  - « 🔥 N jours d'affilée » si `currentStreak(today) > 0` ;
  - le bouton **Commencer**, désactivé si `due + newAvailable === 0` (dans ce cas : « Rien à réviser aujourd'hui 🎉 ») ;
  - les liens **Mes mots** et **Réglages**.

  Bannières, selon le cas :
  - `baseLoadFailed` → « Connecte-toi une fois pour télécharger la liste de mots. » ;
  - `corruptKeys.length > 0` → « Certaines données étaient illisibles. Importe une sauvegarde depuis les Réglages. » ;
  - `needsBackupReminder(today)` → « Pense à exporter une sauvegarde », avec un lien vers les Réglages ;
  - aucune voix russe et `!getMeta().voiceHelpShown` → « Pour entendre la prononciation : Réglages iOS → Accessibilité → Contenu énoncé → Voix → Russe », avec un bouton « OK » qui appelle `markVoiceHelpShown()`.

- [ ] **Step 5 : Vérifier à la main.**
  - Lancer `python -m http.server 8000` et ouvrir `http://localhost:8000` dans Chrome, en mode appareil mobile.
  - Attendu : l'accueil affiche « 0 mots à réviser · 10 nouveaux disponibles », aucune erreur dans la console, et « Mes mots » mène à « Bientôt disponible ».
  - Renommer temporairement `data/words.json` : la bannière « Connecte-toi… » s'affiche. Remettre le nom d'origine.

- [ ] **Step 6 : Lancer `npm test`** (non-régression). Attendu : PASS.

- [ ] **Step 7 : Commit**

```bash
git add index.html css/app.css js/ui/dom.js js/speech.js js/app.js js/ui/home.js
git commit -m "feat: coquille de l'appli, synthèse vocale et écran d'accueil"
```

---

### Task 7 : Écran de session et exercices

**Files :**
- Create : `js/ui/exercises.js`, `js/ui/session-screen.js`
- Modify : `js/app.js` (enregistrer `session`)

**Interfaces :**
- Consumes :
  - `buildSession`, `sessionCounts`, `pickExercise`, `stageOf`, `pickDistractors`, `shuffle`, `createRun`, `currentItem`, `isFirstAnswer`, `recordAnswer`, `runSummary` (tâche 3) ;
  - `newProgress`, `grade` (tâche 1) ;
  - `checkTyped` (tâche 2) ;
  - les méthodes de `storage` (tâche 4) ;
  - `Ctx` (tâche 6).
- Produces (`exercises.js`) : `renderExercise(root, { type: ExerciseType, word, distractors: Word[], autoAudio: boolean, speech, onDone: (rating?: Rating) => void })`.

**Comportement de chaque exercice :**

| Type | Affichage | Fin |
|---|---|---|
| `discovery` | `ru` en grand, 🔊, `fr` joint par « / », type et genre en toutes lettres (« nom masculin ») | bouton **Continuer** → `onDone()` sans note |
| `flash-ru-fr` | recto : `ru` + 🔊 ; bouton **Retourner** → verso : `fr` | 4 boutons **Raté / Difficile / Bien / Facile** → `again/hard/good/easy` |
| `flash-fr-ru` | recto : `fr` + type/genre ; **Retourner** → `ru` + 🔊 | les 4 mêmes boutons |
| `mcq-ru-fr` | `ru` + 🔊 ; 4 options (`fr[0]` du mot et des leurres) mélangées | au toucher : `.correct` sur la bonne réponse, `.wrong` sur le mauvais choix, puis **Suivant** → `good` ou `again` |
| `mcq-fr-ru` | `fr` + type/genre ; options = `ru` (avec accent) | pareil ; audio du bon mot après la réponse |
| `typed-fr-ru` | `fr` + type/genre ; `<input lang="ru" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">` ; **Valider** (ou Entrée) | `exact` → « Bravo ! » ; `almost` → « Presque : <ru> » ; `wrong` → « Réponse : <ru> » ; audio ; **Suivant** → `good`/`hard`/`again` |

- **Audio :**
  - Exercices russe → français et `discovery` : lecture automatique à l'affichage si `autoAudio`.
  - Exercices français → russe : lecture automatique seulement après la réponse ou le retournement, et 🔊 caché avant.
  - Sans voix russe (`!speech.hasRussianVoice()`), aucun bouton 🔊.
- **Repli :** un QCM avec 0 leurre devient la carte recto/verso de même sens (`mcq-ru-fr` → `flash-ru-fr`, `mcq-fr-ru` → `flash-fr-ru`). Avec 1 ou 2 leurres, le QCM s'affiche avec 2 ou 3 options.

**Déroulement (`session-screen.js`) :**
1. Au lancement, et sur **Continuer** : `ids = buildSession(...)` avec les données actuelles du stockage, puis `run = createRun(ids)`.
2. Pour l'élément courant :
   - `p = getProgress()[id]`.
   - Si `stageOf(p) === 'new'` : `discovery`, puis `mcq-ru-fr` pour le même mot, qui fournit la note.
   - Sinon : `pickExercise(p, Math.random)`.
   - Les leurres viennent de `pickDistractors(word, words, Math.random)`.
3. Quand une note arrive :
   - si `isFirstAnswer(run, id)` : `setProgress(id, grade(p ?? newProgress(today), rating, today))` ;
   - si le mot était nouveau : `recordIntroduced(today)` ;
   - à la toute première note de la session : `recordActivity(today)` ;
   - dans tous les cas : `run = recordAnswer(run, rating)`.
4. En-tête :
   - barre de progression `answered / total` ;
   - bouton ✕ qui ramène à l'accueil (les notes déjà données sont conservées).
5. Fin de session :
   - « N mots revus · M ratés » (via `runSummary`) ;
   - bouton **Continuer** si `sessionCounts(...)` indique `due + newAvailable > 0` ;
   - bouton **Accueil**.

- [ ] **Step 1 : Implémenter `js/ui/exercises.js`.**
- [ ] **Step 2 : Implémenter `js/ui/session-screen.js`** et l'enregistrer dans `app.js`.
- [ ] **Step 3 : Vérifier à la main** avec `python -m http.server 8000`, en mode mobile :
  - Commencer : 10 nouveaux mots, chacun en carte découverte puis QCM.
  - Rater volontairement un QCM : le mot revient en fin de session, une seule fois.
  - Fin de session : le résumé s'affiche ; l'accueil indique ensuite « 0 nouveaux disponibles » et « 🔥 1 jours d'affilée ».
  - Dans la console : `localStorage.getItem('ru-app:progress')` montre `due` au lendemain pour les mots réussis.
  - Pour tester les autres exercices, modifier `ru-app:progress` dans la console (`interval` 5, puis 30, avec `due` à aujourd'hui) et recharger : on doit voir cartes et QCM français → russe, puis réponse tapée.
  - Réponse tapée : `малоко` pour `молоко́` affiche « Presque ».
- [ ] **Step 4 : Lancer `npm test`.** Attendu : PASS.
- [ ] **Step 5 : Commit**

```bash
git add js/ui/exercises.js js/ui/session-screen.js js/app.js
git commit -m "feat: écran de session et exercices"
```

---

### Task 8 : « Mes mots » et formulaire de mot

**Files :**
- Create : `js/ui/words-screen.js`, `js/ui/word-form.js`
- Modify : `js/app.js` (enregistrer `words` et `word-form`)

**Interfaces :**
- Consumes : `stripStress`, `vowelIndexes`, `setStress`, `stressedIndex` (tâche 2) ; `normalize` (tâche 2) ; `TYPES`, `isValidWord` (tâche 4) ; les méthodes de `storage`.
- Produces : l'écran `word-form` reçoit `params = { id?: string }`. Sans `id`, c'est la création d'un mot perso.

**Comportement :**
- **Liste :**
  - Champ de recherche : il filtre les mots où `normalize(ru)` ou l'un des `fr` (en minuscules) contient `normalize(recherche)`.
  - Filtre segmenté **Tous / Liste de base / Mes mots**.
  - Chaque ligne affiche `ru — fr[0]`, un badge « modifié » si `isOverridden(id)`, et ouvre le formulaire au toucher.
  - Bouton **+ Ajouter**.
  - Pour rester fluide, pas plus de 100 lignes affichées, avec « Affine ta recherche » au-delà.
- **Formulaire :**
  - Champ **Russe** (`lang="ru"`). En dessous, le mot sans accent affiché lettre par lettre : chaque voyelle est un bouton qui applique `setStress`, et la voyelle `stressedIndex` est mise en évidence. Taper dans le champ retire l'accent (on le replace ensuite en touchant la voyelle).
  - **Traductions** : un seul champ, séparées par des virgules, découpées avec `split(',')`, `trim()`, en retirant les vides.
  - **Type** : liste déroulante sur `TYPES`.
  - **Genre** : liste déroulante m/f/n, visible seulement si le type est `nom`, facultative pour un mot perso.
  - **Thème** : champ facultatif.
  - **Enregistrer** :
    - construit l'objet, sans ajouter de clés vides (`genre` et `theme` omis s'ils sont vides) ;
    - vérifie `isValidWord` (sinon message « Remplis le mot russe et au moins une traduction ») ;
    - `saveWord`, puis retour à la liste.
    - Un nouveau mot reçoit `id = 'perso-' + Date.now()` et `source: 'perso'`. Un mot de base garde son `id` et `source: 'base'`.
  - **Supprimer** : `confirm('Supprimer ce mot et sa progression ?')`, puis `deleteWord`.
  - **Remettre la progression à zéro** : après confirmation, `resetProgress`.
  - **Restaurer la version de base** : seulement si `isOverridden(id)`, puis `restoreBase`.

- [ ] **Step 1 : Implémenter `js/ui/words-screen.js` et `js/ui/word-form.js`**, puis les enregistrer dans `app.js`.
- [ ] **Step 2 : Vérifier à la main :**
  - Ajouter `кошка` / `chat, chatte` (nom, f), puis placer l'accent sur le premier `о` : le mot enregistré est `ко́шка`.
  - Le mot apparaît sous « Mes mots ».
  - Modifier un mot de base : le badge « modifié » apparaît. **Restaurer** le fait disparaître.
  - Supprimer un mot : il disparaît de la liste, et le compteur de l'accueil diminue s'il était dû.
  - Recherche `молоко` ou `lait` : le mot est trouvé.
- [ ] **Step 3 : Lancer `npm test`.** Attendu : PASS.
- [ ] **Step 4 : Commit**

```bash
git add js/ui/words-screen.js js/ui/word-form.js js/app.js
git commit -m "feat: liste des mots et formulaire d'ajout/modification"
```

---

### Task 9 : Réglages, export et import

**Files :**
- Create : `js/ui/settings-screen.js`
- Modify : `js/app.js` (enregistrer `settings`)

**Interfaces :**
- Consumes : `getSettings`, `saveSettings`, `exportData`, `importData`, `validateBackup` (tâche 4) ; `todayISO`.

**Comportement :**
- **Nouveaux mots par jour** : `<input type="number" min="0" max="50">`, enregistré au changement si la valeur est un entier entre 0 et 50, sinon la valeur précédente est remise.
- **Lecture audio automatique** : case à cocher.
- **Exporter une sauvegarde** :
  - `data = exportData()` ;
  - `file = new File([JSON.stringify(data, null, 2)], 'ru-app-sauvegarde-' + todayISO() + '.json', { type: 'application/json' })` ;
  - si `navigator.canShare?.({ files: [file] })`, alors `navigator.share({ files: [file] })` (une annulation de l'utilisateur est silencieuse) ;
  - sinon, téléchargement via un `<a download>` et `URL.createObjectURL`.
- **Importer une sauvegarde** :
  - `<input type="file" accept="application/json,.json">` ;
  - le fichier est lu avec `await file.text()` ;
  - un JSON invalide affiche « Ce fichier n'est pas une sauvegarde valide » ;
  - puis `validateBackup` : si c'est invalide, le message d'erreur s'affiche ;
  - si c'est valide, `confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')`, puis `importData` et le message « Sauvegarde restaurée ».
- **Aide audio** : un paragraphe fixe qui explique où installer la voix russe sur iOS.

- [ ] **Step 1 : Implémenter `js/ui/settings-screen.js`** et l'enregistrer dans `app.js`.
- [ ] **Step 2 : Vérifier à la main :**
  - Exporter : un fichier `ru-app-sauvegarde-AAAA-MM-JJ.json` est téléchargé, et le rappel de l'accueil disparaît.
  - Effacer `localStorage` dans la console, recharger et importer ce fichier : progression et mots perso reviennent.
  - Importer un fichier `{"a":1}` : message d'erreur, rien ne change.
  - Mettre `newPerDay` à 3 : l'accueil indique au plus 3 nouveaux mots.
- [ ] **Step 3 : Lancer `npm test`.** Attendu : PASS.
- [ ] **Step 4 : Commit**

```bash
git add js/ui/settings-screen.js js/app.js
git commit -m "feat: réglages, export et import des données"
```

---

### Task 10 : Hors-ligne, installation et mise en ligne

**Files :**
- Create : `manifest.webmanifest`, `sw.js`, `tools/make_icons.py`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`, `.nojekyll`
- Modify : `index.html` (manifeste et icônes), `js/app.js` (enregistrement du service worker et `navigator.storage.persist()`)
- Test : `tests/sw-assets.test.js`

**Interfaces :**
- Produces : `sw.js` déclare `const CACHE = 'ru-app-v1'` et `const ASSETS = [...]`, des chemins relatifs qui commencent par `./`, dont `'./'` et `'./index.html'`.

- [ ] **Step 1 : Écrire le test de cohérence du précache**

```js
// tests/sw-assets.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const src = readFileSync('sw.js', 'utf8');
const assets = JSON.parse(src.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const listFiles = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);

test('chaque fichier du précache existe', () => {
  for (const a of assets.filter(a => a !== './')) assert.ok(existsSync(a), `manquant : ${a}`);
});
test('chaque fichier JS/CSS/données/icône est précaché', () => {
  const expected = ['js', 'css', 'data', 'icons'].flatMap(listFiles).map(f => './' + f)
    .concat(['./index.html', './manifest.webmanifest']);
  for (const f of expected) assert.ok(assets.includes(f), `non précaché : ${f}`);
});
```

- [ ] **Step 2 : Lancer `npm test`.** Attendu : ÉCHEC (`sw.js` introuvable).

- [ ] **Step 3 : Icônes.**
  - `tools/make_icons.py` utilise Pillow (`pip install pillow` s'il manque ; c'est un outil de développement uniquement).
  - Il dessine un carré de la couleur principale de l'appli avec « Я » en blanc et en gras (police `C:/Windows/Fonts/arialbd.ttf`, repli sur `ImageFont.load_default()`), centré.
  - Il génère `icons/icon-192.png` (192), `icons/icon-512.png` (512) et `icons/apple-touch-icon.png` (180, sans transparence).
  - Lancer `python tools/make_icons.py`.

- [ ] **Step 4 : `manifest.webmanifest`**

```json
{ "name": "Russe — Révisions", "short_name": "Russe", "lang": "fr", "start_url": "./", "scope": "./",
  "display": "standalone", "background_color": "#ffffff", "theme_color": "<couleur principale>",
  "icons": [ { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
             { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png" } ] }
```

Dans `index.html`, ajouter `<link rel="manifest" href="./manifest.webmanifest">` et `<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">`.

- [ ] **Step 5 : `sw.js`.**
  - `install` : `caches.open(CACHE).addAll(ASSETS)`, puis `skipWaiting()`.
  - `activate` : suppression des caches dont le nom diffère de `CACHE`, puis `clients.claim()`.
  - `fetch` (requêtes `GET` de même origine uniquement) : réponse depuis le cache si elle existe, et en parallèle `fetch` réseau qui met le cache à jour. Sans cache, réponse réseau. Pour une navigation hors ligne sans cache, réponse `./index.html` depuis le cache.
  - Un commentaire en tête : « Incrémenter CACHE à chaque déploiement ».
  - Dans `app.js` : `if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js')` et `navigator.storage?.persist?.()`.

- [ ] **Step 6 : Lancer `npm test`.** Attendu : tout PASSE.

- [ ] **Step 7 : Vérifier le hors-ligne à la main.**
  - Ouvrir `http://localhost:8000` dans Chrome.
  - DevTools → Application : le service worker est actif et le manifeste est reconnu.
  - Network → Offline, puis recharger : l'appli s'affiche, et une session fonctionne.

- [ ] **Step 8 : Commit**

```bash
git add manifest.webmanifest sw.js tools/make_icons.py icons .nojekyll index.html js/app.js tests/sw-assets.test.js
git commit -m "feat: fonctionnement hors ligne et installation sur l'écran d'accueil"
```

- [ ] **Step 9 : Mise en ligne (avec l'utilisateur, car c'est une action publique).**
  - Demander à l'utilisateur de créer un dépôt GitHub (public, ou privé avec un compte qui autorise Pages sur les dépôts privés) et de fournir son URL.
  - `git remote add origin <url>`, puis `git push -u origin main`.
  - L'utilisateur active Pages : Settings → Pages → Deploy from a branch → `main` / `/ (root)`.
  - Attendu : l'appli répond à `https://<user>.github.io/<repo>/`.

- [ ] **Step 10 : Recette sur iPhone (par l'utilisateur).**
  - Safari → adresse → Partager → « Sur l'écran d'accueil » : l'icône « Я » apparaît.
  - Lancer l'appli : plein écran, sans barre Safari.
  - Faire une session complète, avec audio (voix russe installée) et réponse tapée au clavier russe.
  - Mode avion, puis relancer : tout fonctionne.
  - Exporter vers Fichiers, puis réimporter : les données sont intactes.
