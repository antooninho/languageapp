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
  const memory = new Map();       // 'ru-app:<clé>' → JSON
  const versions = new Map();     // '<clé>' → version connue du serveur
  const pending = new Map();      // '<clé>' → dernier JSON à envoyer
  // Valeurs envoyées dont on n'a pas eu la réponse (coupure) : le serveur les a peut-être enregistrées.
  const unconfirmed = new Map();  // '<clé>' → Set de JSON
  for (const [key, item] of Object.entries(items ?? {})) {
    memory.set(PREFIX + key, JSON.stringify(item.value));
    versions.set(key, item.version);
  }

  let running = null;
  let paused = false;
  let retryScheduled = false;
  let closed = false;

  const syncKey = storageKey => {
    const key = storageKey.startsWith(PREFIX) ? storageKey.slice(PREFIX.length) : null;
    return SYNC_KEYS.includes(key) ? key : null;
  };

  function markUnconfirmed(key, sent) {
    if (!unconfirmed.has(key)) unconfirmed.set(key, new Set());
    unconfirmed.get(key).add(sent);
  }

  async function sendAll() {
    let sentSomething = false;
    while (pending.size > 0 && !paused && !closed) {
      const [key, sent] = pending.entries().next().value;
      let response = null;
      try {
        response = await api.putData(key, JSON.parse(sent), versions.get(key) ?? null);
      } catch {
        // coupure réseau : traitée comme une réponse inattendue ci-dessous
      }
      if (closed) return;
      const status = response?.status;
      const current = response?.body?.current;

      if (status === 200 && Number.isInteger(response.body?.version)) {
        versions.set(key, response.body.version);
        unconfirmed.delete(key);
        if (pending.get(key) === sent) pending.delete(key);
        sentSomething = true;
      } else if (status === 409 && current !== undefined) {
        const currentJson = current ? JSON.stringify(current.value) : null;
        if (current && unconfirmed.get(key)?.has(currentJson)) {
          // Un envoi précédent avait bien été enregistré, seule sa réponse s'est perdue : pas un vrai conflit.
          versions.set(key, current.version);
          unconfirmed.delete(key);
          if (pending.get(key) === currentJson) pending.delete(key);
          sentSomething = true;
        } else {
          if (current) {
            memory.set(PREFIX + key, currentJson);
            versions.set(key, current.version);
          }
          unconfirmed.delete(key);
          pending.delete(key);
          onConflict();
        }
      } else if (status === 401) {
        paused = true;
        onUnauthorized();
        return;
      } else {
        // Coupure, erreur serveur ou réponse inattendue (portail Wi-Fi…) : on réessaie plus tard.
        markUnconfirmed(key, sent);
        onStatus('offline');
        retryScheduled = true;
        setTimer(() => { retryScheduled = false; start(); }, retryDelay);
        return;
      }
    }
    if (sentSomething && pending.size === 0 && !closed) onStatus('saved');
  }

  function start() {
    if (running || paused || retryScheduled || closed || pending.size === 0) return;
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
      if (key && !closed) {
        pending.set(key, text);
        start();
      }
    },
    removeItem(storageKey) {
      memory.delete(storageKey);
    },
    pendingCount: () => pending.size,
    isIdle: () => pending.size === 0 && running === null,
    versions: () => Object.fromEntries(versions),
    resume() {
      paused = false;
      start();
    },
    // Arrête définitivement ce backend : plus d'envoi, de nouvel essai ni de rappel.
    close() {
      closed = true;
    },
    idle: () => running ?? Promise.resolve(),
  };
}
