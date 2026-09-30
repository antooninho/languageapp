// Répétition espacée : version simplifiée de SM-2.
import { addDays } from './dates.js';

const EASE_MIN = 1.3;
const EASE_MAX = 3.0;
const MAX_INTERVAL = 365;

export function newProgress(today) {
  return { state: 'new', due: today, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

// rating : 'again' | 'hard' | 'good' | 'easy'. Renvoie toujours un nouvel objet.
export function grade(p, rating, today, rand = Math.random) {
  if (p.state === 'new' && rating === 'again') return { ...p };

  let { interval, ease, reps, lapses } = p;

  if (p.state === 'new') {
    interval = rating === 'easy' ? 3 : 1;
    reps = 1;
  } else {
    if (rating === 'again') {
      interval = 1;
      ease -= 0.2;
      lapses += 1;
    } else {
      const raw = rating === 'hard' ? interval * 1.2
        : rating === 'good' ? interval * ease
        : interval * ease * 1.3;
      interval = Math.max(Math.round(raw), p.interval + 1);
      if (rating === 'hard') ease -= 0.15;
      if (rating === 'easy') ease += 0.15;
    }
    reps += 1;
  }

  ease = Math.min(EASE_MAX, Math.max(EASE_MIN, Math.round(ease * 100) / 100));
  if (interval > 7) interval = Math.round(interval * (1 + (rand() * 0.1 - 0.05)));
  interval = Math.min(interval, MAX_INTERVAL);

  return { state: 'review', due: addDays(today, interval), interval, ease, reps, lapses };
}
