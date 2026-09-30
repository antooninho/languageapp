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
