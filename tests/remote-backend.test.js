import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteBackend } from '../js/remote-backend.js';
import { createStorage } from '../js/storage.js';

// Faux serveur : chaque putData attend une réponse fournie par le test.
function fakeApi() {
  const calls = [];
  return {
    calls,
    putData(key, value, version) {
      return new Promise((resolve, reject) => calls.push({ key, value, version, resolve, reject }));
    },
  };
}
const tick = () => new Promise(r => setImmediate(r));
function setup(items = {}, extra = {}) {
  const api = fakeApi();
  const events = [];
  const timers = [];
  const backend = createRemoteBackend({
    items, api,
    onStatus: s => events.push(s), onConflict: () => events.push('conflict'),
    onUnauthorized: () => events.push('unauthorized'),
    setTimer: (fn, ms) => timers.push({ fn, ms }), ...extra,
  });
  return { api, events, timers, backend };
}

test('lecture des données initiales', () => {
  const { backend } = setup({ progress: { value: { a: 1 }, version: 4 } });
  assert.equal(backend.getItem('ru-app:progress'), '{"a":1}');
  assert.equal(backend.getItem('ru-app:settings'), null);
});
test('écriture envoyée avec la version, puis « saved »', async () => {
  const { api, events, backend } = setup({ progress: { value: {}, version: 4 } });
  backend.setItem('ru-app:progress', '{"a":2}');
  assert.equal(backend.getItem('ru-app:progress'), '{"a":2}');
  await tick();
  assert.deepEqual([api.calls[0].key, api.calls[0].value, api.calls[0].version], ['progress', { a: 2 }, 4]);
  api.calls[0].resolve({ status: 200, body: { version: 5 } });
  await backend.idle();
  assert.deepEqual(events, ['saved']);
  assert.equal(backend.pendingCount(), 0);
});
test('écritures rapides sur la même clé : regroupées, versions enchaînées, pas de faux conflit', async () => {
  const { api, backend } = setup();
  backend.setItem('ru-app:progress', '{"n":1}');
  await tick();
  backend.setItem('ru-app:progress', '{"n":2}');
  backend.setItem('ru-app:progress', '{"n":3}');
  api.calls[0].resolve({ status: 200, body: { version: 1 } });
  await tick(); await tick();
  assert.equal(api.calls.length, 2);
  assert.deepEqual([api.calls[1].value, api.calls[1].version], [{ n: 3 }, 1]);
  api.calls[1].resolve({ status: 200, body: { version: 2 } });
  await backend.idle();
  assert.equal(backend.pendingCount(), 0);
});
test('coupure réseau : « offline », nouvel essai après le délai', async () => {
  const { api, events, timers, backend } = setup({}, { retryDelay: 5000 });
  backend.setItem('ru-app:settings', '{"newPerDay":5}');
  await tick();
  api.calls[0].reject(new TypeError('Failed to fetch'));
  await backend.idle();
  assert.deepEqual(events, ['offline']);
  assert.equal(timers[0].ms, 5000);
  assert.equal(backend.pendingCount(), 1);
  timers[0].fn();
  await tick();
  api.calls[1].resolve({ status: 200, body: { version: 1 } });
  await backend.idle();
  assert.deepEqual(events, ['offline', 'saved']);
});
test('erreur serveur 5xx traitée comme une coupure', async () => {
  const { api, events, backend } = setup();
  backend.setItem('ru-app:meta', '{}');
  await tick();
  api.calls[0].resolve({ status: 502, body: null });
  await backend.idle();
  assert.deepEqual(events, ['offline']);
});
test('session expirée : rien n\'est perdu, reprise après resume()', async () => {
  const { api, events, timers, backend } = setup();
  backend.setItem('ru-app:progress', '{"a":1}');
  await tick();
  api.calls[0].resolve({ status: 401, body: { error: 'unauthenticated' } });
  await backend.idle();
  assert.deepEqual(events, ['unauthorized']);
  assert.equal(timers.length, 0);
  backend.setItem('ru-app:progress', '{"a":2}');
  await tick();
  assert.equal(api.calls.length, 1);                  // en pause
  backend.resume();
  await tick();
  assert.deepEqual(api.calls[1].value, { a: 2 });
  api.calls[1].resolve({ status: 200, body: { version: 1 } });
  await backend.idle();
  assert.equal(backend.pendingCount(), 0);
});
test('conflit : valeur du serveur reprise, « conflict » signalé', async () => {
  const { api, events, backend } = setup({ settings: { value: { newPerDay: 10 }, version: 1 } });
  backend.setItem('ru-app:settings', '{"newPerDay":3}');
  await tick();
  api.calls[0].resolve({ status: 409, body: { error: 'conflict', current: { value: { newPerDay: 7 }, version: 2 } } });
  await backend.idle();
  assert.deepEqual(events, ['conflict']);
  assert.equal(backend.getItem('ru-app:settings'), '{"newPerDay":7}');
  assert.equal(backend.pendingCount(), 0);
});
test('réponse perdue puis nouvel essai : pas de faux conflit, la réponse suivante part', async () => {
  const { api, events, timers, backend } = setup();
  backend.setItem('ru-app:progress', '{"a":1}');
  await tick();
  api.calls[0].reject(new TypeError('Failed to fetch'));   // enregistré sur le serveur, réponse perdue
  await backend.idle();
  backend.setItem('ru-app:progress', '{"a":1,"b":1}');
  timers[0].fn();
  await tick();
  assert.deepEqual([api.calls[1].value, api.calls[1].version], [{ a: 1, b: 1 }, null]);
  api.calls[1].resolve({ status: 409, body: { error: 'conflict', current: { value: { a: 1 }, version: 1 } } });
  await tick(); await tick();
  assert.deepEqual([api.calls[2].value, api.calls[2].version], [{ a: 1, b: 1 }, 1]);
  api.calls[2].resolve({ status: 200, body: { version: 2 } });
  await backend.idle();
  assert.deepEqual(events, ['offline', 'saved']);
  assert.equal(backend.getItem('ru-app:progress'), '{"a":1,"b":1}');
});
test('réponse perdue, même valeur renvoyée : considérée comme enregistrée', async () => {
  const { api, events, timers, backend } = setup();
  backend.setItem('ru-app:settings', '{"n":1}');
  await tick();
  api.calls[0].reject(new TypeError('Failed to fetch'));
  await backend.idle();
  timers[0].fn();
  await tick();
  api.calls[1].resolve({ status: 409, body: { error: 'conflict', current: { value: { n: 1 }, version: 1 } } });
  await backend.idle();
  assert.equal(api.calls.length, 2);
  assert.deepEqual(events, ['offline', 'saved']);
  assert.equal(backend.pendingCount(), 0);
});
test('réponse 200 inattendue (sans version) : traitée comme une coupure, sans boucle', async () => {
  const { api, events, timers, backend } = setup();
  backend.setItem('ru-app:meta', '{}');
  await tick();
  api.calls[0].resolve({ status: 200, body: null });   // par exemple un portail Wi-Fi qui répond en HTML
  await backend.idle();
  await tick();
  assert.equal(api.calls.length, 1);
  assert.deepEqual(events, ['offline']);
  assert.equal(timers.length, 1);
});
test('conflit sur une clé : les autres clés en attente partent quand même', async () => {
  const { api, events, backend } = setup({ settings: { value: {}, version: 1 } });
  backend.setItem('ru-app:settings', '{"n":1}');
  backend.setItem('ru-app:meta', '{"m":1}');
  await tick();
  api.calls[0].resolve({ status: 409, body: { error: 'conflict', current: { value: { n: 9 }, version: 2 } } });
  await tick(); await tick();
  assert.equal(api.calls[1].key, 'meta');
  api.calls[1].resolve({ status: 200, body: { version: 1 } });
  await backend.idle();
  assert.deepEqual(events, ['conflict', 'saved']);
});
test('close() : plus aucun envoi, minuteur ni rappel', async () => {
  const { api, events, timers, backend } = setup();
  backend.setItem('ru-app:progress', '{"a":1}');
  await tick();
  api.calls[0].reject(new TypeError('Failed to fetch'));
  await backend.idle();
  backend.close();
  timers[0].fn();
  backend.setItem('ru-app:progress', '{"a":2}');
  await tick();
  assert.equal(api.calls.length, 1);
  assert.deepEqual(events, ['offline']);
});
test('close() pendant un envoi : la réponse est ignorée', async () => {
  const { api, events, backend } = setup();
  backend.setItem('ru-app:settings', '{"n":1}');
  await tick();
  backend.close();
  api.calls[0].resolve({ status: 409, body: { error: 'conflict', current: { value: { n: 0 }, version: 3 } } });
  await backend.idle();
  assert.deepEqual(events, []);
});
test('versions() et isIdle()', async () => {
  const { api, backend } = setup({ progress: { value: {}, version: 4 } });
  assert.deepEqual(backend.versions(), { progress: 4 });
  assert.equal(backend.isIdle(), true);
  backend.setItem('ru-app:progress', '{"a":1}');
  assert.equal(backend.isIdle(), false);
  await tick();
  api.calls[0].resolve({ status: 200, body: { version: 5 } });
  await backend.idle();
  assert.equal(backend.isIdle(), true);
  assert.deepEqual(backend.versions(), { progress: 5 });
});
test('clés non synchronisées et removeItem restent locales', async () => {
  const { api, backend } = setup();
  backend.setItem('ru-app:corrupt-progress-1', 'x');
  backend.removeItem('ru-app:corrupt-progress-1');
  await tick();
  assert.equal(api.calls.length, 0);
  assert.equal(backend.getItem('ru-app:corrupt-progress-1'), null);
});
test('fonctionne avec createStorage', async () => {
  const { api, backend } = setup({ settings: { value: { newPerDay: 4, autoAudio: true }, version: 1 } });
  const storage = createStorage(backend);
  assert.equal(storage.getSettings().newPerDay, 4);
  storage.saveSettings({ autoAudio: false });
  await tick();
  assert.deepEqual([api.calls[0].key, api.calls[0].value], ['settings', { newPerDay: 4, autoAudio: false }]);
});
