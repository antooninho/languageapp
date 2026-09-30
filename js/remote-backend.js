// Backend de storage.js relié au serveur : les données sont gardées en mémoire (lecture immédiate)
// et chaque modification est envoyée au serveur en arrière-plan, une clé à la fois.

export const SYNC_KEYS = ['words-overrides', 'words-perso', 'deleted', 'progress', 'settings', 'meta'];
const PREFIX = 'ru-app:';

export function createRemoteBackend({
  items,
  api,
  onStatus = () => {},
  onConflict = () => {},
  onUnauthorized = () => {},
  retryDelay = 5000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
}) {
  const memory = new Map();    // 'ru-app:<clé>' → JSON
  const versions = new Map();  // '<clé>' → version connue du serveur
  const pending = new Map();   // '<clé>' → dernier JSON à envoyer
  for (const [key, item] of Object.entries(items ?? {})) {
    memory.set(PREFIX + key, JSON.stringify(item.value));
    versions.set(key, item.version);
  }

  let running = null;
  let paused = false;
  let retryScheduled = false;

  const syncKey = storageKey => {
    const key = storageKey.startsWith(PREFIX) ? storageKey.slice(PREFIX.length) : null;
    return SYNC_KEYS.includes(key) ? key : null;
  };

  async function sendAll() {
    let sentSomething = false;
    while (pending.size > 0 && !paused) {
      const [key, sent] = pending.entries().next().value;
      let response = null;
      try {
        response = await api.putData(key, JSON.parse(sent), versions.get(key) ?? null);
      } catch {
        // coupure réseau : traitée comme une erreur serveur ci-dessous
      }
      if (response?.status === 200) {
        versions.set(key, response.body.version);
        if (pending.get(key) === sent) pending.delete(key);
        sentSomething = true;
      } else if (response?.status === 409) {
        const current = response.body?.current;
        if (current) {
          memory.set(PREFIX + key, JSON.stringify(current.value));
          versions.set(key, current.version);
        }
        pending.delete(key);
        onConflict();
      } else if (response?.status === 401) {
        paused = true;
        onUnauthorized();
        return;
      } else {
        onStatus('offline');
        retryScheduled = true;
        setTimer(() => { retryScheduled = false; start(); }, retryDelay);
        return;
      }
    }
    if (sentSomething && pending.size === 0) onStatus('saved');
  }

  function start() {
    if (running || paused || retryScheduled || pending.size === 0) return;
    running = sendAll().finally(() => {
      running = null;
      start(); // une écriture a pu arriver pendant la fin de l'envoi
    });
  }

  return {
    getItem(storageKey) {
      return memory.has(storageKey) ? memory.get(storageKey) : null;
    },
    setItem(storageKey, value) {
      const text = String(value);
      memory.set(storageKey, text);
      const key = syncKey(storageKey);
      if (key) {
        pending.set(key, text);
        start();
      }
    },
    removeItem(storageKey) {
      memory.delete(storageKey);
    },
    pendingCount: () => pending.size,
    resume() {
      paused = false;
      start();
    },
    idle: () => running ?? Promise.resolve(),
  };
}
