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
