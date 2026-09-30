// Réglages : nouveaux mots par jour, audio automatique, export et import des données.
import { h } from './dom.js';
import { todayISO } from '../dates.js';
import { validateBackup } from '../validate.js';

// Renvoie false si l'utilisateur a annulé le partage.
async function shareOrDownload(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false; // annulation par l'utilisateur
      // Partage refusé ou indisponible : on se rabat sur le téléchargement.
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function renderSettings(root, ctx) {
  const { storage } = ctx;
  const settings = storage.getSettings();
  const message = h('p', { hidden: true });
  const showMessage = (text, kind) => {
    message.className = kind;
    message.textContent = text;
    message.hidden = false;
  };

  const newPerDay = h('input', {
    type: 'number', min: '0', max: '50', inputmode: 'numeric', value: String(settings.newPerDay),
    onchange: () => {
      const value = Number(newPerDay.value);
      if (Number.isInteger(value) && value >= 0 && value <= 50) {
        storage.saveSettings({ newPerDay: value });
      } else {
        newPerDay.value = String(storage.getSettings().newPerDay);
      }
    },
  });

  const autoAudio = h('input', {
    type: 'checkbox', checked: settings.autoAudio,
    onchange: () => storage.saveSettings({ autoAudio: autoAudio.checked }),
  });

  async function exportBackup() {
    const data = storage.exportData();
    const file = new File([JSON.stringify(data, null, 2)], `ru-app-sauvegarde-${todayISO()}.json`,
      { type: 'application/json' });
    try {
      if (await shareOrDownload(file)) showMessage('Sauvegarde exportée.', 'ok');
    } catch {
      showMessage("L'export a échoué.", 'error');
    }
  }

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        showMessage("Ce fichier n'est pas une sauvegarde valide.", 'error');
        return;
      }
      const check = validateBackup(data);
      if (!check.ok) {
        showMessage(check.error, 'error');
        return;
      }
      if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
      storage.importData(data);
      showMessage('Sauvegarde restaurée.', 'ok');
      newPerDay.value = String(storage.getSettings().newPerDay);
      autoAudio.checked = storage.getSettings().autoAudio;
    },
  });

  root.append(h('section', { class: 'screen' },
    h('div', { class: 'session-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Retour', onclick: () => ctx.navigate('home') }, '←'),
      h('h2', {}, 'Réglages')),
    h('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:16px' },
      h('label', {}, 'Nouveaux mots par jour', newPerDay),
      h('label', { class: 'check' }, 'Lecture audio automatique', autoAudio)),
    h('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:12px' },
      h('h2', {}, 'Sauvegarde'),
      h('p', { class: 'muted' },
        "Tes données restent sur ce téléphone. Exporte-les régulièrement (vers Fichiers ou iCloud) : " +
        "si tu supprimes l'appli de l'écran d'accueil, elles sont perdues."),
      h('button', { class: 'btn btn-primary', onclick: exportBackup }, 'Exporter une sauvegarde'),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Importer une sauvegarde'),
      fileInput,
      message),
    h('div', { class: 'card' },
      h('h2', {}, 'Prononciation'),
      h('p', { class: 'muted' },
        "L'appli utilise la voix russe de ton iPhone. Si tu n'entends rien : Réglages iOS → Accessibilité → " +
        'Contenu énoncé → Voix → Russe, puis télécharge « Milena ».'))));
}
