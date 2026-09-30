// Construction et déroulement d'une session de révision. Module pur.
import { stripStress } from './stress.js';

export function stageOf(p) {
  if (!p || p.state === 'new') return 'new';
  if (p.interval < 3) return 'young';
  if (p.interval < 21) return 'settled';
  return 'solid';
}

export function pickExercise(p, rand) {
  switch (stageOf(p)) {
    case 'new': return 'discovery';
    case 'young': return rand() < 0.5 ? 'mcq-ru-fr' : 'flash-ru-fr';
    case 'settled': return rand() < 0.5 ? 'flash-fr-ru' : 'mcq-fr-ru';
    default: return rand() < 0.8 ? 'typed-fr-ru' : 'flash-fr-ru';
  }
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function dueAndNew({ words, progress, today }) {
  const due = words
    .filter(w => progress[w.id]?.state === 'review' && progress[w.id].due <= today)
    .sort((a, b) => {
      const da = progress[a.id].due, db = progress[b.id].due;
      return da < db ? -1 : da > db ? 1 : byId(a, b);
    });
  const fresh = words.filter(w => !progress[w.id] || progress[w.id].state === 'new').sort(byId);
  return { due, fresh };
}

const newQuota = (newPerDay, newIntroducedToday) => Math.max(0, newPerDay - newIntroducedToday);

export function buildSession({ words, progress, today, newPerDay, newIntroducedToday, maxCards = 20 }) {
  const { due, fresh } = dueAndNew({ words, progress, today });
  const reviews = due.slice(0, maxCards).map(w => w.id);
  const newCount = Math.min(maxCards - reviews.length, newQuota(newPerDay, newIntroducedToday), fresh.length);
  const news = fresh.slice(0, newCount).map(w => w.id);

  // Le nouveau mot k est inséré après floor((k+1) × R / (N+1)) révisions.
  const result = [];
  let r = 0;
  news.forEach((wordId, k) => {
    const upTo = Math.floor(((k + 1) * reviews.length) / (news.length + 1));
    while (r < upTo) result.push(reviews[r++]);
    result.push(wordId);
  });
  while (r < reviews.length) result.push(reviews[r++]);
  return result;
}

export function sessionCounts({ words, progress, today, newPerDay, newIntroducedToday }) {
  const { due, fresh } = dueAndNew({ words, progress, today });
  return { due: due.length, newAvailable: Math.min(newQuota(newPerDay, newIntroducedToday), fresh.length) };
}

export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(word, words, rand, count = 3) {
  const tr = s => s.trim().toLowerCase();
  const ruKey = s => stripStress(s).toLowerCase();
  const translations = new Set(word.fr.map(tr));
  const candidates = words.filter(w =>
    w.id !== word.id && ruKey(w.ru) !== ruKey(word.ru) && !w.fr.some(f => translations.has(tr(f))));
  const sameType = shuffle(candidates.filter(w => w.type === word.type), rand);
  const others = shuffle(candidates.filter(w => w.type !== word.type), rand);
  return [...sameType, ...others].slice(0, count);
}

// --- Déroulement ---

export function createRun(ids) {
  return { queue: ids.map(wordId => ({ wordId, retry: false })), firstRatings: {}, answered: 0, total: ids.length };
}

export function currentItem(run) {
  return run.queue[0] ?? null;
}

export function isFirstAnswer(run, wordId) {
  return !(wordId in run.firstRatings);
}

export function recordAnswer(run, rating) {
  const [item, ...rest] = run.queue;
  const firstRatings = isFirstAnswer(run, item.wordId)
    ? { ...run.firstRatings, [item.wordId]: rating }
    : run.firstRatings;
  const requeue = rating === 'again' && !item.retry;
  return {
    queue: requeue ? [...rest, { wordId: item.wordId, retry: true }] : rest,
    firstRatings,
    answered: run.answered + 1,
    total: run.total + (requeue ? 1 : 0),
  };
}

export function runSummary(run) {
  const ratings = Object.values(run.firstRatings);
  return { reviewed: ratings.length, failed: ratings.filter(r => r === 'again').length };
}
