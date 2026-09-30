// Petit utilitaire pour créer des éléments DOM.
// h('button', { class: 'btn', onclick: fn }, 'Texte', autreElement)

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'hidden') {
      el.hidden = true;
    } else if (key === 'value') {
      el.value = value;
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
}

// Icône dessinée en CSS (speaker, close, back) ; décorative, le bouton porte son aria-label.
export function icon(name) {
  return h('span', { class: `icon icon-${name}`, 'aria-hidden': 'true' });
}
