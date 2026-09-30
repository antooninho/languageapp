// Rendu des six types d'exercices. Chaque exercice appelle onDone(note) quand il est terminé
// (sans note pour la carte découverte).
import { h, clear } from './dom.js';
import { shuffle } from '../session.js';
import { checkTyped } from '../answers.js';

const GENRES = { m: 'masculin', f: 'féminin', n: 'neutre' };
const GRADES = [['again', 'Raté'], ['hard', 'Difficile'], ['good', 'Bien'], ['easy', 'Facile']];

export function kindLabel(word) {
  return word.type === 'nom' && word.genre ? `nom ${GENRES[word.genre]}` : word.type;
}

const frText = word => word.fr.join(' / ');

function audioButton(word, speech) {
  if (!speech.hasRussianVoice()) return null;
  return h('button', { class: 'icon-btn', 'aria-label': 'Écouter', onclick: () => speech.speak(word.ru) }, '🔊');
}

const ruBlock = (word, speech) =>
  [h('div', { class: 'ru', lang: 'ru' }, word.ru), audioButton(word, speech)].filter(Boolean);
const frBlock = word => h('div', { class: 'fr' }, frText(word));
const kindBlock = word => h('div', { class: 'kind' }, kindLabel(word));

function discovery(root, { word, speech, autoAudio, onDone }) {
  root.append(
    h('p', { class: 'kind' }, 'Nouveau mot'),
    h('div', { class: 'card prompt' }, ...ruBlock(word, speech), frBlock(word), kindBlock(word)),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn btn-primary btn-big', onclick: () => onDone() }, 'Continuer'));
  if (autoAudio) speech.speak(word.ru);
}

// Carte recto/verso générique : front et back sont des tableaux d'éléments.
function flashcard(root, { front, back, onReveal, onDone }) {
  const card = h('div', { class: 'card prompt' }, ...front);
  const actions = h('div', {},
    h('button', {
      class: 'btn btn-primary btn-big',
      onclick: () => {
        card.append(h('hr', { style: 'width:100%;border:0;border-top:1px solid var(--border)' }), ...back);
        clear(actions);
        actions.append(h('div', { class: 'grade-buttons' },
          GRADES.map(([rating, label]) => h('button', { class: 'btn', onclick: () => onDone(rating) }, label))));
        onReveal?.();
      },
    }, 'Retourner'));
  root.append(card, h('div', { class: 'spacer' }), actions);
}

function flashRuFr(root, { word, speech, autoAudio, onDone }) {
  flashcard(root, { front: ruBlock(word, speech), back: [frBlock(word), kindBlock(word)], onDone });
  if (autoAudio) speech.speak(word.ru);
}

function flashFrRu(root, { word, speech, autoAudio, onDone }) {
  flashcard(root, {
    front: [frBlock(word), kindBlock(word)],
    back: ruBlock(word, speech),
    onReveal: () => { if (autoAudio) speech.speak(word.ru); },
    onDone,
  });
}

// QCM générique : options = [{ label, correct, lang? }].
function mcq(root, { prompt, options, onAnswered, onDone }) {
  const buttons = options.map(option => h('button', {
    class: 'btn',
    lang: option.lang,
    onclick: () => {
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (options[i].correct) b.classList.add('correct');
      });
      if (!option.correct) buttons[options.indexOf(option)].classList.add('wrong');
      onAnswered?.();
      next.hidden = false;
      next.onclick = () => onDone(option.correct ? 'good' : 'again');
    },
  }, option.label));
  const next = h('button', { class: 'btn btn-primary btn-big', hidden: true }, 'Suivant');
  root.append(prompt, h('div', { class: 'options' }, buttons), h('div', { class: 'spacer' }), next);
}

function mcqRuFr(root, { word, distractors, speech, autoAudio, onDone }) {
  const options = shuffle([
    { label: word.fr[0], correct: true },
    ...distractors.map(d => ({ label: d.fr[0], correct: false })),
  ], Math.random);
  mcq(root, { prompt: h('div', { class: 'card prompt' }, ...ruBlock(word, speech)), options, onDone });
  if (autoAudio) speech.speak(word.ru);
}

function mcqFrRu(root, { word, distractors, speech, autoAudio, onDone }) {
  const prompt = h('div', { class: 'card prompt' }, frBlock(word), kindBlock(word));
  const options = shuffle([
    { label: word.ru, correct: true, lang: 'ru' },
    ...distractors.map(d => ({ label: d.ru, correct: false, lang: 'ru' })),
  ], Math.random);
  mcq(root, {
    prompt, options, onDone,
    onAnswered: () => {
      const audio = audioButton(word, speech);
      if (audio) prompt.append(audio);
      if (autoAudio) speech.speak(word.ru);
    },
  });
}

function typed(root, { word, speech, autoAudio, onDone }) {
  const input = h('input', {
    class: 'typed-input', lang: 'ru', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off',
    spellcheck: 'false', placeholder: 'En russe…', 'aria-label': 'Ta réponse en russe',
  });
  const submit = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Valider');
  const feedback = h('div', { class: 'card prompt', hidden: true });
  const form = h('form', {
    class: 'exercise',
    onsubmit: event => {
      event.preventDefault();
      if (input.disabled) return;
      const result = checkTyped(input.value, word.ru);
      input.disabled = true;
      const message = result === 'exact' ? ['correct', 'Bravo !']
        : result === 'almost' ? ['almost', 'Presque :']
        : ['wrong', 'Réponse :'];
      feedback.append(h('p', { class: `feedback ${message[0]}` }, message[1]), ...ruBlock(word, speech));
      feedback.hidden = false;
      if (autoAudio) speech.speak(word.ru);
      const rating = result === 'exact' ? 'good' : result === 'almost' ? 'hard' : 'again';
      submit.replaceWith(h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => onDone(rating) }, 'Suivant'));
    },
  },
  h('div', { class: 'card prompt' }, frBlock(word), kindBlock(word)),
  input,
  feedback,
  h('div', { class: 'spacer' }),
  submit);
  root.append(form);
  input.focus();
}

const RENDERERS = {
  discovery,
  'flash-ru-fr': flashRuFr,
  'flash-fr-ru': flashFrRu,
  'mcq-ru-fr': mcqRuFr,
  'mcq-fr-ru': mcqFrRu,
  'typed-fr-ru': typed,
};

// opts : { type, word, distractors, autoAudio, speech, onDone }
export function renderExercise(root, opts) {
  let { type } = opts;
  if (opts.distractors.length === 0 && type === 'mcq-ru-fr') type = 'flash-ru-fr';
  if (opts.distractors.length === 0 && type === 'mcq-fr-ru') type = 'flash-fr-ru';
  clear(root);
  RENDERERS[type](root, opts);
}
