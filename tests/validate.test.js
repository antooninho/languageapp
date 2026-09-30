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
