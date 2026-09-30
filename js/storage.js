// Seul module qui lit et écrit le stockage local. Le backend est injectable pour les tests.
import { todayISO, addDays, daysBetween } from './dates.js';
import { validateBackup, cleanMeta } from './validate.js';

const PREFIX = 'ru-app:';
const DEFAULT_SETTINGS = { newPerDay: 10, autoAudio: true };
const DEFAULT_META = {
  lastExport: null, streak: 0, lastSessionDate: null,
  newIntroducedToday: 0, newIntroducedDate: null, voiceHelpShown: false,
};

export function createStorage(backend = globalThis.localStorage) {
  const corruptKeys = [];

  // Lit une clé JSON. Une valeur illisible (ou d'une forme inattendue) est mise de côté.
  function read(name, fallback) {
    const raw = backend.getItem(PREFIX + name);
    if (raw === null) return fallback;
    try {
      const value = JSON.parse(raw);
      const sameShape = value !== null && typeof value === 'object'
        && Array.isArray(value) === Array.isArray(fallback);
      if (sameShape) return value;
    } catch { /* traité ci-dessous */ }
    backend.setItem(`${PREFIX}corrupt-${name}-${Date.now()}`, raw);
    backend.removeItem(PREFIX + name);
    if (!corruptKeys.includes(name)) corruptKeys.push(name);
    return fallback;
  }
  const write = (name, value) => backend.setItem(PREFIX + name, JSON.stringify(value));

  const getOverrides = () => read('words-overrides', {});
  const getPerso = () => read('words-perso', []);
  const getDeleted = () => read('deleted', []);

  function getProgress() {
    return read('progress', {});
  }

  function getSettings() {
    return { ...DEFAULT_SETTINGS, ...read('settings', {}) };
  }

  function getMeta() {
    return { ...DEFAULT_META, ...cleanMeta(read('meta', {})) };
  }
  const updateMeta = changes => write('meta', { ...getMeta(), ...changes });

  function introducedCount(today) {
    const m = getMeta();
    return m.newIntroducedDate === today ? m.newIntroducedToday : 0;
  }

  return {
    corruptKeys,

    getEffectiveWords(baseWords) {
      const overrides = getOverrides();
      const deleted = new Set(getDeleted());
      return [
        ...baseWords.filter(w => !deleted.has(w.id)).map(w => overrides[w.id] ?? w),
        ...getPerso(),
      ];
    },

    saveWord(word) {
      if (word.source === 'base') {
        write('words-overrides', { ...getOverrides(), [word.id]: word });
        return;
      }
      const perso = getPerso();
      const i = perso.findIndex(w => w.id === word.id);
      if (i === -1) perso.push(word); else perso[i] = word;
      write('words-perso', perso);
    },

    deleteWord(id) {
      const perso = getPerso();
      if (perso.some(w => w.id === id)) {
        write('words-perso', perso.filter(w => w.id !== id));
      } else {
        const overrides = getOverrides();
        delete overrides[id];
        write('words-overrides', overrides);
        const deleted = getDeleted();
        if (!deleted.includes(id)) write('deleted', [...deleted, id]);
      }
      const progress = getProgress();
      delete progress[id];
      write('progress', progress);
    },

    restoreBase(id) {
      const overrides = getOverrides();
      delete overrides[id];
      write('words-overrides', overrides);
    },

    isOverridden(id) {
      return id in getOverrides();
    },

    getProgress,

    setProgress(id, p) {
      write('progress', { ...getProgress(), [id]: p });
    },

    resetProgress(id) {
      const progress = getProgress();
      delete progress[id];
      write('progress', progress);
    },

    getSettings,

    saveSettings(partial) {
      const settings = { ...getSettings(), ...partial };
      write('settings', settings);
      return settings;
    },

    getMeta,

    markVoiceHelpShown() {
      updateMeta({ voiceHelpShown: true });
    },

    introducedCount,

    recordIntroduced(today) {
      updateMeta({ newIntroducedToday: introducedCount(today) + 1, newIntroducedDate: today });
    },

    recordActivity(today) {
      const m = getMeta();
      let streak;
      if (m.lastSessionDate === today) streak = m.streak;
      else if (m.lastSessionDate && addDays(m.lastSessionDate, 1) === today) streak = m.streak + 1;
      else streak = 1;
      updateMeta({ streak, lastSessionDate: today });
      return streak;
    },

    currentStreak(today) {
      const m = getMeta();
      if (!m.lastSessionDate) return 0;
      const recent = m.lastSessionDate === today || addDays(m.lastSessionDate, 1) === today;
      return recent ? m.streak : 0;
    },

    needsBackupReminder(today) {
      const m = getMeta();
      return m.lastSessionDate !== null && (m.lastExport === null || daysBetween(m.lastExport, today) > 7);
    },

    // À appeler seulement quand le fichier a vraiment été partagé ou téléchargé.
    markExported(now = new Date()) {
      updateMeta({ lastExport: todayISO(now) });
    },

    exportData(now = new Date()) {
      return {
        version: 1,
        exportedAt: now.toISOString(),
        overrides: getOverrides(),
        perso: getPerso(),
        deleted: getDeleted(),
        progress: getProgress(),
        settings: getSettings(),
        meta: getMeta(),
      };
    },

    importData(data) {
      const result = validateBackup(data);
      if (!result.ok) return result;
      write('words-overrides', data.overrides);
      write('words-perso', data.perso);
      write('deleted', data.deleted);
      write('progress', data.progress);
      write('settings', data.settings);
      write('meta', data.meta);
      return { ok: true };
    },
  };
}
