// Point d'entrée : connexion, chargement des données depuis le serveur, affichage des écrans.
import { createStorage } from './storage.js';
import { createApi } from './api.js';
import { createRemoteBackend } from './remote-backend.js';
import { todayISO } from './dates.js';
import * as speech from './speech.js';
import { h, clear } from './ui/dom.js';
import { renderLogin } from './ui/login-screen.js';
import { renderHome } from './ui/home.js';
import { renderSession } from './ui/session-screen.js';
import { renderWords } from './ui/words-screen.js';
import { renderWordForm } from './ui/word-form.js';
import { renderSettings } from './ui/settings-screen.js';

const screens = {
  home: renderHome,
  session: renderSession,
  words: renderWords,
  'word-form': renderWordForm,
  settings: renderSettings,
};

// Au retour dans l'appli après cette durée, on vérifie si un autre appareil a changé les données.
const RESUME_CHECK_MS = 60 * 1000;
const CHANGED_ELSEWHERE = 'Données mises à jour depuis un autre appareil.';

function renderPending(root, ctx) {
  root.append(h('section', { class: 'screen' },
    h('p', {}, 'Bientôt disponible'),
    h('button', { class: 'btn', onclick: () => ctx.navigate('home') }, 'Retour')));
}

// Un écran qui plante ne doit pas laisser une page blanche : on garde un accès aux réglages (import).
function renderError(root, ctx, name, error) {
  clear(root);
  root.append(h('section', { class: 'screen' },
    h('p', { class: 'error' }, 'Une erreur est survenue en affichant cet écran.'),
    h('p', { class: 'muted' }, String(error?.message ?? error)),
    name !== 'settings' && h('button', { class: 'btn btn-primary', onclick: () => ctx.navigate('settings') },
      'Ouvrir les réglages (importer une sauvegarde)'),
    name !== 'home' && h('button', { class: 'btn', onclick: () => ctx.navigate('home') }, 'Accueil')));
}

async function loadBaseWords() {
  try {
    const response = await fetch('./data/words.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { baseWords: await response.json(), baseLoadFailed: false };
  } catch {
    return { baseWords: [], baseLoadFailed: true };
  }
}

function versionsDiffer(items, known) {
  const keys = new Set([...Object.keys(items), ...Object.keys(known)]);
  return [...keys].some(key => items[key]?.version !== known[key]);
}

async function start() {
  const root = document.getElementById('app');
  const statusBanner = document.getElementById('status-banner');
  const api = createApi();
  const [{ baseWords, baseLoadFailed }] = await Promise.all([loadBaseWords(), speech.initSpeech()]);

  let current = { name: null, day: null };
  let backend = null;
  let entering = null;
  let refreshing = false;
  let hiddenAt = null;
  let noticeTimer = null;

  const setBanner = text => {
    clearTimeout(noticeTimer);
    statusBanner.textContent = text ?? '';
    statusBanner.hidden = !text;
  };
  const notice = text => {
    setBanner(text);
    noticeTimer = setTimeout(() => setBanner(null), 5000);
  };

  const ctx = {
    storage: null,
    username: null,
    baseWords,
    baseLoadFailed,
    speech: { hasRussianVoice: speech.hasRussianVoice, speak: speech.speak },
    today: () => todayISO(),
    navigate(name, params = {}) {
      clear(root);
      window.scrollTo(0, 0);
      current = { name, day: todayISO() };
      try {
        (screens[name] ?? renderPending)(root, ctx, params);
      } catch (error) {
        console.error(error);
        renderError(root, ctx, name, error);
      }
    },
    // Renvoie { ok: true } ou { ok: false, message } (affiché dans les réglages).
    async logout() {
      if (backend) {
        await backend.idle();
        if (backend.pendingCount() > 0) {
          return { ok: false, message: "Tes dernières réponses ne sont pas encore enregistrées. Attends d'avoir du réseau avant de te déconnecter." };
        }
      }
      try {
        const response = await api.logout();
        if (response.status !== 204) throw new Error(`HTTP ${response.status}`);
      } catch {
        return { ok: false, message: 'Impossible de joindre le serveur pour te déconnecter. Réessaie.' };
      }
      backend?.close();
      backend = null;
      ctx.storage = null;
      ctx.username = null;
      setBanner(null);
      showLogin();
      return { ok: true };
    },
  };

  function showUnreachable() {
    current = { name: 'unreachable', day: null };
    clear(root);
    root.append(h('section', { class: 'screen' },
      h('h1', {}, 'Russe'),
      h('p', { class: 'error' }, 'Impossible de joindre le serveur.'),
      h('p', { class: 'muted' }, 'Vérifie ta connexion internet, puis réessaie.'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-primary btn-big', onclick: boot }, 'Réessayer')));
  }

  function showSyncing() {
    current = { name: 'syncing', day: null };
    clear(root);
    root.append(h('section', { class: 'screen' }, h('p', { class: 'muted' }, 'Mise à jour des données…')));
  }

  function showLogin(message) {
    current = { name: 'login', day: null };
    clear(root);
    renderLogin(root, {
      api,
      message,
      onLoggedIn: username => {
        if (backend && username === ctx.username) {
          // Session expirée en cours de route : les données en mémoire et les envois en attente sont gardés.
          backend.resume();
          ctx.navigate('home');
        } else {
          enter(username);
        }
      },
    });
  }

  // Une seule entrée à la fois, même si plusieurs événements la demandent en même temps.
  function enter(username) {
    entering ??= doEnter(username).finally(() => { entering = null; });
    return entering;
  }

  async function doEnter(username) {
    let response;
    try {
      response = await api.loadData();
    } catch {
      showUnreachable();
      return;
    }
    if (response.status === 401) return showLogin();
    if (response.status !== 200) return showUnreachable();

    backend?.close();
    ctx.username = username;
    backend = createRemoteBackend({
      items: response.body.items,
      api,
      onStatus: status => setBanner(status === 'offline'
        ? 'Connexion perdue — tes dernières réponses ne sont pas encore enregistrées.'
        : null),
      onConflict: () => refresh(CHANGED_ELSEWHERE),
      onUnauthorized: () => showLogin('Ta session a expiré, reconnecte-toi.'),
    });
    ctx.storage = createStorage(backend);
    ctx.navigate('home');
  }

  // Recharge toutes les données depuis le serveur (conflit, ou changements faits sur un autre appareil).
  async function refresh(message) {
    if (refreshing) return;
    refreshing = true;
    showSyncing(); // plus de réponse possible pendant la mise à jour
    const old = backend;
    await old?.idle(); // les autres modifications en attente partent d'abord
    old?.close();
    backend = null;
    await enter(ctx.username);
    refreshing = false;
    if (message && backend) notice(message);
  }

  async function boot() {
    let response;
    try {
      response = await api.me();
    } catch {
      showUnreachable();
      return;
    }
    if (response.status === 200) return enter(response.body.username);
    if (response.status === 401) return showLogin();
    showUnreachable();
  }

  // L'appli installée reste souvent en veille : au retour, on vérifie les données et le jour.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const awayLong = hiddenAt !== null && Date.now() - hiddenAt > RESUME_CHECK_MS;
    hiddenAt = null;
    if (awayLong && backend?.isIdle() && !refreshing) {
      try {
        const response = await api.loadData();
        if (response.status === 200 && versionsDiffer(response.body.items, backend.versions())) {
          refresh(CHANGED_ELSEWHERE);
          return;
        }
      } catch {
        // hors connexion : on garde les données en mémoire
      }
    }
    if (current.name === 'home' && current.day !== todayISO()) ctx.navigate('home');
  });

  boot();
}

start();
