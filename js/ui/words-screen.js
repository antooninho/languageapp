// Liste « Mes mots » : recherche, filtre base/perso, accès au formulaire.
import { h, clear, icon } from './dom.js';
import { ruWord } from './ru-word.js';
import { normalize } from '../answers.js';

const MAX_ROWS = 100;
const FILTERS = [['all', 'Tous'], ['base', 'Liste de base'], ['perso', 'Mes mots']];

// Conservés tant que l'appli est ouverte, pour retrouver la liste au retour du formulaire.
let currentFilter = 'all';
let currentQuery = '';

export function renderWords(root, ctx) {
  const { storage } = ctx;
  const words = storage.getEffectiveWords(ctx.baseWords);
  const list = h('ul', { class: 'word-list' });
  const info = h('p', { class: 'muted' });

  const search = h('input', {
    type: 'search', placeholder: 'Rechercher (russe ou français)', value: currentQuery,
    autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false',
    oninput: () => { currentQuery = search.value; update(); },
  });

  const segmented = h('div', { class: 'segmented' }, FILTERS.map(([key, label]) => h('button', {
    class: `btn${key === currentFilter ? ' active' : ''}`,
    'data-key': key,
    onclick: () => {
      currentFilter = key;
      segmented.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
      update();
    },
  }, label)));

  function update() {
    const query = normalize(currentQuery);
    const matches = words.filter(w =>
      (currentFilter === 'all' || w.source === currentFilter)
      && (query === '' || normalize(w.ru).includes(query) || w.fr.some(f => f.toLowerCase().includes(query))));
    clear(list);
    list.append(...matches.slice(0, MAX_ROWS).map(w => h('li', {},
      h('button', { class: 'btn word-row', onclick: () => ctx.navigate('word-form', { id: w.id }) },
        ruWord(w.ru, { className: 'w-ru' }),
        storage.isOverridden(w.id) && h('span', { class: 'badge' }, 'modifié'),
        h('span', { class: 'w-fr' }, w.fr[0])))));
    info.textContent = matches.length > MAX_ROWS
      ? `${matches.length} mots. Affine ta recherche pour voir les autres.`
      : `${matches.length} ${matches.length > 1 ? 'mots' : 'mot'}`;
  }

  root.append(h('section', { class: 'screen' },
    h('div', { class: 'session-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Retour', onclick: () => ctx.navigate('home') }, icon('back')),
      h('h2', {}, 'Mes mots')),
    h('button', { class: 'btn btn-primary', onclick: () => ctx.navigate('word-form', {}) }, '+ Ajouter un mot'),
    search,
    segmented,
    info,
    list));
  update();
}
