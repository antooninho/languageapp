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
test('buildSession : les mots perso passent avant la liste de base', () => {
  const words = [w(id(1)), w(id(2)), w('perso-1790000000001'), w('perso-1790000000000')];
  assert.deepEqual(buildSession(opts(words, {})),
    ['perso-1790000000000', 'perso-1790000000001', id(1), id(2)]);
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
