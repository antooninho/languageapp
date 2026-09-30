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
