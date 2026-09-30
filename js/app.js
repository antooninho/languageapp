// Point d'entrée : charge les données, prépare le contexte et affiche les écrans.
import { createStorage } from './storage.js';
import { todayISO } from './dates.js';
import * as speech from './speech.js';
import { h, clear } from './ui/dom.js';
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

async function start() {
  const root = document.getElementById('app');
  const [{ baseWords, baseLoadFailed }] = await Promise.all([loadBaseWords(), speech.initSpeech()]);

  let current = { name: null, day: null };

  const ctx = {
    storage: createStorage(),
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
  };
  ctx.navigate('home');

  // L'appli installée peut rester en veille pendant la nuit : on rafraîchit l'accueil au changement de jour.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current.name === 'home' && current.day !== todayISO()) {
      ctx.navigate('home');
    }
  });

  // Hors ligne et conservation des données.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.storage?.persist?.();
}

start();
