import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../js/api.js';

const jsonResponse = (status, body) => ({
  status, headers: { get: h => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
});
const recorder = response => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return response; };
  return { calls, fetchFn };
};

test('login envoie du JSON et renvoie statut + corps', async () => {
  const { calls, fetchFn } = recorder(jsonResponse(200, { username: 'antonin' }));
  const r = await createApi(fetchFn).login('antonin', 'motdepasse');
  assert.deepEqual(r, { status: 200, body: { username: 'antonin' } });
  assert.equal(calls[0].url, './api/login');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'antonin', password: 'motdepasse' });
});
test('putData', async () => {
  const { calls, fetchFn } = recorder(jsonResponse(200, { version: 3 }));
  await createApi(fetchFn).putData('progress', { a: 1 }, 2);
  assert.equal(calls[0].url, './api/data/progress');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { value: { a: 1 }, version: 2 });
});
test('me, loadData, logout', async () => {
  const { calls, fetchFn } = recorder({ status: 204, headers: { get: () => null } });
  const api = createApi(fetchFn);
  assert.deepEqual(await api.logout(), { status: 204, body: null });
  await api.me(); await api.loadData();
  assert.deepEqual(calls.map(c => [c.url, c.init.method ?? 'GET']),
    [['./api/logout', 'POST'], ['./api/me', 'GET'], ['./api/data', 'GET']]);
});
test('erreur réseau propagée', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.me(), TypeError);
});
