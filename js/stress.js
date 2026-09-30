// Accent tonique : caractère combinant U+0301 placé juste après la voyelle accentuée.

export const STRESS = '\u0301';
const VOWELS = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';

export function stripStress(s) {
  return s.replaceAll(STRESS, '');
}

export function vowelIndexes(word) {
  const indexes = [];
  [...stripStress(word)].forEach((ch, i) => { if (VOWELS.includes(ch)) indexes.push(i); });
  return indexes;
}

// index : position de la voyelle dans le mot sans accent.
export function setStress(word, index) {
  const letters = [...stripStress(word)];
  if (!VOWELS.includes(letters[index] ?? '')) throw new RangeError(`Pas de voyelle à la position ${index}`);
  letters[index] += STRESS;
  return letters.join('');
}

export function stressedIndex(word) {
  const pos = word.indexOf(STRESS);
  return pos === -1 ? -1 : [...word.slice(0, pos)].length - 1;
}
