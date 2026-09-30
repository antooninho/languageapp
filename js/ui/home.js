// Écran d'accueil : compteurs du jour, série, bannières et accès aux autres écrans.
import { h } from './dom.js';
import { sessionCounts } from '../session.js';

const plural = (n, one, many) => (n > 1 ? many : one);

function stat(value, label) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-value' }, value),
    h('div', { class: 'stat-label' }, label));
}

function banners(ctx) {
  const { storage } = ctx;
  const list = [];
  if (ctx.baseLoadFailed) {
    list.push(h('div', { class: 'banner' }, 'Connecte-toi une fois pour télécharger la liste de mots.'));
  }
  if (storage.corruptKeys.length > 0) {
    list.push(h('div', { class: 'banner' },
      'Certaines données étaient illisibles. Importe une sauvegarde depuis les Réglages.',
      h('button', { class: 'link', onclick: () => ctx.navigate('settings') }, 'Ouvrir les réglages')));
  }
  if (!ctx.speech.hasRussianVoice() && !storage.getMeta().voiceHelpShown) {
    const banner = h('div', { class: 'banner' },
      'Pour entendre la prononciation : Réglages iOS → Accessibilité → Contenu énoncé → Voix → Russe.',
      h('button', {
        class: 'link',
        onclick: () => { storage.markVoiceHelpShown(); banner.remove(); },
      }, 'OK'));
    list.push(banner);
  }
  return list;
}

export function renderHome(root, ctx) {
  const { storage } = ctx;
  const today = ctx.today();
  const { due, newAvailable } = sessionCounts({
    words: storage.getEffectiveWords(ctx.baseWords),
    progress: storage.getProgress(),
    today,
    newPerDay: storage.getSettings().newPerDay,
    newIntroducedToday: storage.introducedCount(today),
  });
  const streak = storage.currentStreak(today);
  const nothingToDo = due + newAvailable === 0;

  root.append(h('section', { class: 'screen' },
    h('header', {},
      h('h1', {}, 'Russe'),
      h('p', { class: 'subtitle' }, 'Révisions du jour')),
    banners(ctx),
    h('div', { class: 'stats' },
      stat(due, `${plural(due, 'mot', 'mots')} à réviser`),
      stat(newAvailable, `${plural(newAvailable, 'nouveau disponible', 'nouveaux disponibles')}`)),
    streak > 0 && h('p', { class: 'streak' }, `🔥 ${streak} ${plural(streak, 'jour', 'jours')} d'affilée`),
    nothingToDo && h('p', { class: 'muted' }, "Rien à réviser aujourd'hui 🎉"),
    h('div', { class: 'spacer' }),
    h('button', {
      class: 'btn btn-primary btn-big',
      disabled: nothingToDo,
      onclick: () => ctx.navigate('session'),
    }, 'Commencer'),
    h('nav', { class: 'home-nav' },
      h('button', { class: 'btn', onclick: () => ctx.navigate('words') }, 'Mes mots'),
      h('button', { class: 'btn', onclick: () => ctx.navigate('settings') }, 'Réglages'))));
}
