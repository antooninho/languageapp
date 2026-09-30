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

// Le mot découpé en morceaux, les voyelles accentuées à part : [{ text, stressed }].
// Sert à tracer l'accent soi-même (au stylo rouge) au lieu de laisser la police le placer.
export function stressSegments(word) {
  const segments = [];
  const chars = [...word];
  chars.forEach((ch, i) => {
    if (ch === STRESS) return;
    const stressed = chars[i + 1] === STRESS && VOWELS.includes(ch);
    const last = segments[segments.length - 1];
    if (last && !last.stressed && !stressed) last.text += ch;
    else segments.push({ text: ch, stressed });
  });
  return segments;
}

export function stressedIndex(word) {
  return stressedIndexes(word)[0] ?? -1;
}

// Positions (dans le mot sans accent) de toutes les voyelles accentuées.
export function stressedIndexes(word) {
  const indexes = [];
  let i = -1;
  for (const ch of word) {
    if (ch === STRESS) indexes.push(i);
    else i++;
  }
  return indexes;
}

// Place l'accent sur la voyelle `index` (ou le retire s'il y est déjà),
// sans toucher aux accents des autres mots d'une expression.
export function toggleStress(word, index) {
  const letters = [...stripStress(word)];
  if (!VOWELS.includes(letters[index] ?? '')) throw new RangeError(`Pas de voyelle à la position ${index}`);
  const stressed = new Set(stressedIndexes(word));
  if (stressed.has(index)) {
    stressed.delete(index);
  } else {
    let start = index, end = index;
    while (start > 0 && letters[start - 1] !== ' ') start--;
    while (end < letters.length && letters[end] !== ' ') end++;
    for (const s of [...stressed]) if (s >= start && s < end) stressed.delete(s);
    stressed.add(index);
  }
  return letters.map((ch, i) => (stressed.has(i) ? ch + STRESS : ch)).join('');
}
