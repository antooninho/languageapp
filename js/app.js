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

  const ctx = {
    storage: createStorage(),
    baseWords,
    baseLoadFailed,
    speech: { hasRussianVoice: speech.hasRussianVoice, speak: speech.speak },
    today: () => todayISO(),
    navigate(name, params = {}) {
      clear(root);
      window.scrollTo(0, 0);
      (screens[name] ?? renderPending)(root, ctx, params);
    },
  };
  ctx.navigate('home');
}

start();
