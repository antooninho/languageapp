// Page de connexion. Les attributs autocomplete permettent à l'iPhone d'enregistrer le mot de passe.
import { h } from './dom.js';

function errorMessage(response) {
  if (response.status === 401) return 'Identifiant ou mot de passe incorrect.';
  if (response.status === 429) {
    const minutes = Math.max(1, Math.ceil((response.body?.retryAfter ?? 900) / 60));
    return `Trop de tentatives. Réessaie dans ${minutes} minute${minutes > 1 ? 's' : ''}.`;
  }
  return 'Le serveur a rencontré un problème. Réessaie plus tard.';
}

// options : { api, message?, onLoggedIn(username) }
export function renderLogin(root, { api, message, onLoggedIn }) {
  const username = h('input', {
    name: 'username', autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off',
    spellcheck: 'false', required: true,
  });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'error', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Se connecter');

  const form = h('form', {
    class: 'screen',
    onsubmit: async event => {
      event.preventDefault();
      submit.disabled = true;
      error.hidden = true;
      try {
        const response = await api.login(username.value, password.value);
        if (response.status === 200) {
          onLoggedIn(response.body.username);
          return;
        }
        error.textContent = errorMessage(response);
      } catch {
        error.textContent = 'Impossible de joindre le serveur.';
      }
      error.hidden = false;
      submit.disabled = false;
    },
  },
  h('header', {},
    h('h1', {}, 'Russe'),
    h('p', { class: 'subtitle' }, 'Connecte-toi pour réviser')),
  message && h('div', { class: 'banner' }, message),
  h('label', {}, 'Identifiant', username),
  h('label', {}, 'Mot de passe', password),
  error,
  h('div', { class: 'spacer' }),
  submit);

  root.append(form);
}
