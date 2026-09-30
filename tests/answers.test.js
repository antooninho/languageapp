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
