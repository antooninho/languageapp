// Écran d'accueil : le travail du jour, la semaine (comme dans le « дневник », le carnet de l'écolier russe),
// les bandeaux d'information et l'accès aux autres écrans.
import { h } from './dom.js';
import { ruWord } from './ru-word.js';
import { sessionCounts } from '../session.js';
import { weekDays } from '../dates.js';

const plural = (n, one, many) => (n > 1 ? many : one);
const WEEKDAYS = [['Пн', 'lundi'], ['Вт', 'mardi'], ['Ср', 'mercredi'], ['Чт', 'jeudi'],
  ['Пт', 'vendredi'], ['Сб', 'samedi'], ['Вс', 'dimanche']];

// La semaine en cours : un carreau coché par jour révisé.
function week(storage, today) {
  const practiced = new Set(storage.getMeta().practiceDays);
  return h('div', { class: 'week' },
    weekDays(today).map((day, i) => {
      const [short, name] = WEEKDAYS[i];
      const done = practiced.has(day);
      const classes = ['day', done && 'done', day === today && 'today', day > today && 'future'].filter(Boolean).join(' ');
      return h('div', { class: classes, role: 'img', 'aria-label': `${name} : ${done ? 'révisé' : 'pas révisé'}` },
        h('span', { class: 'day-name', lang: 'ru', 'aria-hidden': 'true' }, short),
        h('span', { class: 'day-box', 'aria-hidden': 'true' }));
    }));
}

function todayLines(due, newAvailable) {
  if (due + newAvailable === 0) {
    return [h('p', {}, 'Tout est à jour pour aujourd’hui.'),
      h('p', { class: 'muted' }, 'Les prochains mots reviendront demain.')];
  }
  return [
    h('p', {}, due === 0 ? 'Aucun mot à revoir' : `${due} ${plural(due, 'mot', 'mots')} à revoir`),
    h('p', {}, newAvailable === 0 ? 'Aucun nouveau mot'
      : `${newAvailable} ${plural(newAvailable, 'nouveau mot', 'nouveaux mots')}`),
  ];
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
      h('h1', {}, ruWord('ру́сский', { className: 'masthead', animate: true })),
      h('p', { class: 'subtitle' }, 'Tes révisions de russe')),
    banners(ctx),
    h('div', { class: 'today' }, todayLines(due, newAvailable)),
    h('div', {},
      week(storage, today),
      h('p', { class: 'streak' }, streak > 0 ? `${streak} ${plural(streak, 'jour', 'jours')} de suite`
        : 'Révise aujourd’hui pour lancer ta série.')),
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
