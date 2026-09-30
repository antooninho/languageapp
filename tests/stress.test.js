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
