// Validation des mots, de la progression et des sauvegardes importées. Module pur.

export const TYPES = ['nom', 'verbe', 'adjectif', 'adverbe', 'autre'];
const GENRES = ['m', 'f', 'n'];

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = v => typeof v === 'string' && v.trim() !== '';
const isCount = v => Number.isInteger(v) && v >= 0;

export function isValidWord(w) {
  return isPlainObject(w)
    && isNonEmptyString(w.id)
    && isNonEmptyString(w.ru)
    && Array.isArray(w.fr) && w.fr.length > 0 && w.fr.every(isNonEmptyString)
    && TYPES.includes(w.type)
    && (w.genre === undefined || (GENRES.includes(w.genre) && w.type === 'nom'))
    && (w.theme === undefined || typeof w.theme === 'string')
    && (w.source === 'base' || w.source === 'perso');
}

export function isValidProgress(p) {
  return isPlainObject(p)
    && (p.state === 'new' || p.state === 'review')
    && typeof p.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.due)
    && isCount(p.interval) && isCount(p.reps) && isCount(p.lapses)
    && typeof p.ease === 'number' && p.ease >= 1.3 && p.ease <= 3;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateOrNull = v => v === null || (typeof v === 'string' && DATE_RE.test(v));
const META_FIELDS = {
  lastExport: isDateOrNull,
  lastSessionDate: isDateOrNull,
  newIntroducedDate: isDateOrNull,
  streak: isCount,
  newIntroducedToday: isCount,
  voiceHelpShown: v => typeof v === 'boolean',
};

export function isValidMeta(m) {
  return isPlainObject(m) && Object.entries(META_FIELDS).every(([key, ok]) => m[key] === undefined || ok(m[key]));
}

// Ne garde que les champs de meta connus et correctement typés.
export function cleanMeta(m) {
  if (!isPlainObject(m)) return {};
  return Object.fromEntries(Object.entries(META_FIELDS)
    .filter(([key, ok]) => m[key] !== undefined && ok(m[key]))
    .map(([key]) => [key, m[key]]));
}

export function validateBackup(data) {
  const fail = error => ({ ok: false, error });
  if (!isPlainObject(data)) return fail("Ce fichier n'est pas une sauvegarde de l'appli.");
  if (data.version !== 1) return fail('Version de sauvegarde inconnue.');
  if (!isPlainObject(data.overrides) || !Object.values(data.overrides).every(isValidWord)) {
    return fail('Mots modifiés invalides.');
  }
  if (!Array.isArray(data.perso) || !data.perso.every(isValidWord)) return fail('Mots perso invalides.');
  if (!Array.isArray(data.deleted) || !data.deleted.every(d => typeof d === 'string')) {
    return fail('Liste des mots supprimés invalide.');
  }
  if (!isPlainObject(data.progress) || !Object.values(data.progress).every(isValidProgress)) {
    return fail('Progression invalide.');
  }
  const s = data.settings;
  if (!isPlainObject(s) || !Number.isInteger(s.newPerDay) || s.newPerDay < 0 || s.newPerDay > 50
      || typeof s.autoAudio !== 'boolean') {
    return fail('Réglages invalides.');
  }
  if (!isValidMeta(data.meta)) return fail('Métadonnées invalides.');
  return { ok: true };
}
