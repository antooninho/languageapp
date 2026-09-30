// Déroulement d'une session : un exercice à la fois, puis un résumé.
import { h, clear } from './dom.js';
import { renderExercise } from './exercises.js';
import {
  buildSession, sessionCounts, pickExercise, stageOf, pickDistractors,
  createRun, currentItem, isFirstAnswer, recordAnswer, runSummary,
} from '../session.js';
import { newProgress, grade } from '../srs.js';

const plural = (n, one, many) => (n > 1 ? many : one);

export function renderSession(root, ctx) {
  const { storage } = ctx;
  const today = ctx.today();
  const container = h('section', { class: 'screen' });
  root.append(container);

  let words = [];
  let byId = new Map();
  let run = createRun([]);
  let activityRecorded = false;

  const sessionParams = () => ({
    words,
    progress: storage.getProgress(),
    today,
    newPerDay: storage.getSettings().newPerDay,
    newIntroducedToday: storage.introducedCount(today),
  });

  function start() {
    words = storage.getEffectiveWords(ctx.baseWords);
    byId = new Map(words.map(w => [w.id, w]));
    run = createRun(buildSession(sessionParams()));
    step();
  }

  function header() {
    const percent = run.total ? Math.round((run.answered / run.total) * 100) : 0;
    return h('div', { class: 'session-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quitter la session', onclick: () => ctx.navigate('home') }, '✕'),
      h('div', { class: 'progress' }, h('div', { style: `width:${percent}%` })));
  }

  function show(type, word, onDone) {
    clear(container);
    const exercise = h('div', { class: 'exercise' });
    container.append(header(), exercise);
    renderExercise(exercise, {
      type,
      word,
      distractors: pickDistractors(word, words, Math.random),
      autoAudio: storage.getSettings().autoAudio,
      speech: ctx.speech,
      onDone,
    });
  }

  function step() {
    const item = currentItem(run);
    if (!item) return finish();
    const word = byId.get(item.wordId);
    const p = storage.getProgress()[word.id];
    if (stageOf(p) === 'new') {
      show('discovery', word, () => show('mcq-ru-fr', word, rating => answer(word, p, rating)));
    } else {
      show(pickExercise(p, Math.random), word, rating => answer(word, p, rating));
    }
  }

  function answer(word, p, rating) {
    if (isFirstAnswer(run, word.id)) {
      storage.setProgress(word.id, grade(p ?? newProgress(today), rating, today));
      if (stageOf(p) === 'new') storage.recordIntroduced(today);
      if (!activityRecorded) {
        storage.recordActivity(today);
        activityRecorded = true;
      }
    }
    run = recordAnswer(run, rating);
    step();
  }

  function finish() {
    const { reviewed, failed } = runSummary(run);
    const { due, newAvailable } = sessionCounts(sessionParams());
    clear(container);
    container.append(...[
      h('h1', {}, 'Session terminée'),
      h('div', { class: 'card' },
        h('p', { class: 'fr' }, `${reviewed} ${plural(reviewed, 'mot revu', 'mots revus')}`),
        h('p', { class: 'muted' }, `${failed} ${plural(failed, 'raté', 'ratés')}`)),
      h('div', { class: 'spacer' }),
      due + newAvailable > 0 && h('button', { class: 'btn btn-primary btn-big', onclick: start }, 'Continuer'),
      h('button', { class: 'btn', onclick: () => ctx.navigate('home') }, 'Accueil'),
    ].filter(Boolean));
  }

  start();
}
