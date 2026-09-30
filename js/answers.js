// Vérification des réponses tapées en russe.
import { stripStress } from './stress.js';

export function normalize(s) {
  return stripStress(s.trim().toLowerCase()).replaceAll('ё', 'е');
}

export function levenshtein(a, b) {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

// 'exact' | 'almost' (une seule faute sur un mot d'au moins 5 lettres) | 'wrong'
export function checkTyped(input, expected) {
  const a = normalize(input);
  const b = normalize(expected);
  if (a === '') return 'wrong';
  if (a === b) return 'exact';
  if ([...b].length >= 5 && levenshtein(a, b) === 1) return 'almost';
  return 'wrong';
}
