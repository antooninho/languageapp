import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripStress, vowelIndexes, setStress, stressedIndex, stressedIndexes, toggleStress } from '../js/stress.js';

test('stressedIndexes', () => {
  assert.deepEqual(stressedIndexes('до́брый ве́чер'), [1, 8]);
  assert.deepEqual(stressedIndexes('молоко'), []);
});
test('toggleStress place, déplace et retire l\'accent dans un seul mot', () => {
  assert.equal(toggleStress('молоко', 5), 'молоко́');
  assert.equal(toggleStress('молоко́', 5), 'молоко');
  assert.equal(toggleStress('мо́локо', 5), 'молоко́');
  assert.equal(toggleStress('до́брый вечер', 8), 'до́брый ве́чер');
  assert.equal(toggleStress('до́брый ве́чер', 10), 'до́брый вече́р');
  assert.throws(() => toggleStress('молоко', 0), RangeError);
});

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
