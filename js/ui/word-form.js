// Formulaire d'ajout ou de modification d'un mot.
import { h, clear, icon } from './dom.js';
import { stripStress, vowelIndexes, stressedIndexes, toggleStress } from '../stress.js';
import { TYPES, isValidWord } from '../validate.js';

const GENRE_OPTIONS = [['', '—'], ['m', 'masculin'], ['f', 'féminin'], ['n', 'neutre']];

const select = (options, selected) => h('select', {},
  options.map(([value, label]) => h('option', { value, selected: value === selected }, label)));

export function renderWordForm(root, ctx, params = {}) {
  const { storage } = ctx;
  const existing = params.id
    ? storage.getEffectiveWords(ctx.baseWords).find(w => w.id === params.id) ?? null
    : null;
  let ru = existing?.ru ?? '';

  // Sélecteur d'accent : le mot lettre par lettre, chaque voyelle est un bouton.
  const picker = h('div', { class: 'stress-picker', lang: 'ru' });
  function renderPicker() {
    clear(picker);
    const vowels = new Set(vowelIndexes(ru));
    const stressed = new Set(stressedIndexes(ru));
    [...stripStress(ru)].forEach((ch, i) => {
      picker.append(vowels.has(i)
        ? h('button', {
          type: 'button',
          'aria-label': `Accent sur ${ch}`,
          'aria-pressed': stressed.has(i) ? 'true' : 'false',
          onclick: () => { ru = toggleStress(ru, i); renderPicker(); },
        }, h('span', { class: stressed.has(i) ? 'stress' : null }, ch))
        : h('span', { class: 'letter' }, ch === ' ' ? ' ' : ch));
    });
  }

  const ruInput = h('input', {
    lang: 'ru', value: stripStress(ru), autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off',
    spellcheck: 'false', oninput: () => { ru = ruInput.value; renderPicker(); },
  });
  const frInput = h('input', { value: existing?.fr.join(', ') ?? '', placeholder: 'lait, du lait', autocapitalize: 'off' });
  const typeSelect = select(TYPES.map(t => [t, t]), existing?.type ?? 'nom');
  const genreSelect = select(GENRE_OPTIONS, existing?.genre ?? '');
  const genreLabel = h('label', {}, 'Genre', genreSelect);
  const themeInput = h('input', { value: existing?.theme ?? '', placeholder: 'facultatif', autocapitalize: 'off' });
  const message = h('p', { class: 'error', hidden: true });

  const updateGenreVisibility = () => { genreLabel.hidden = typeSelect.value !== 'nom'; };
  typeSelect.addEventListener('change', updateGenreVisibility);
  updateGenreVisibility();

  const showMessage = (text, kind = 'error') => {
    message.className = kind;
    message.textContent = text;
    message.hidden = false;
  };

  function save() {
    const type = typeSelect.value;
    const word = {
      id: existing?.id ?? `perso-${Date.now()}`,
      ru: ru.trim(),
      fr: frInput.value.split(',').map(s => s.trim()).filter(Boolean),
      type,
      ...(type === 'nom' && genreSelect.value ? { genre: genreSelect.value } : {}),
      ...(themeInput.value.trim() ? { theme: themeInput.value.trim() } : {}),
      source: existing?.source ?? 'perso',
    };
    if (!isValidWord(word)) {
      showMessage('Remplis le mot russe et au moins une traduction.');
      return;
    }
    storage.saveWord(word);
    ctx.navigate('words');
  }

  const actions = [];
  if (existing) {
    if (existing.source === 'base' && storage.isOverridden(existing.id)) {
      actions.push(h('button', {
        class: 'btn',
        onclick: () => { storage.restoreBase(existing.id); ctx.navigate('word-form', { id: existing.id }); },
      }, 'Restaurer la version de base'));
    }
    if (storage.getProgress()[existing.id]) {
      actions.push(h('button', {
        class: 'btn',
        onclick: () => {
          if (!confirm('Remettre la progression de ce mot à zéro ?')) return;
          storage.resetProgress(existing.id);
          showMessage('Progression remise à zéro.', 'ok');
        },
      }, 'Remettre la progression à zéro'));
    }
    actions.push(h('button', {
      class: 'btn btn-danger',
      onclick: () => {
        if (!confirm('Supprimer ce mot et sa progression ?')) return;
        storage.deleteWord(existing.id);
        ctx.navigate('words');
      },
    }, 'Supprimer'));
  }

  root.append(h('section', { class: 'screen', oninput: () => { message.hidden = true; } },
    h('div', { class: 'session-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Retour', onclick: () => ctx.navigate('words') }, icon('back')),
      h('h2', {}, existing ? 'Modifier le mot' : 'Nouveau mot')),
    h('label', {}, 'Russe', ruInput),
    h('div', {}, h('p', { class: 'muted' }, 'Touche la voyelle accentuée :'), picker),
    h('label', {}, 'Traductions (séparées par des virgules)', frInput),
    h('label', {}, 'Type', typeSelect),
    genreLabel,
    h('label', {}, 'Thème', themeInput),
    message,
    h('button', { class: 'btn btn-primary btn-big', onclick: save }, 'Enregistrer'),
    actions));
  renderPicker();
}
