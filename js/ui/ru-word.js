// Mot russe affiché avec son accent tonique tracé au stylo rouge (voir .stress dans app.css).
// L'accent n'est pas laissé à la police : son placement au-dessus des voyelles varie d'une police à l'autre.
import { h } from './dom.js';
import { stressSegments } from '../stress.js';

// options : { className, animate } — `animate` fait « tracer » l'accent à l'apparition du mot.
export function ruWord(text, { className = '', animate = false } = {}) {
  const classes = ['ru-word', className, animate ? 'pen-animate' : ''].filter(Boolean).join(' ');
  return h('span', { class: classes, lang: 'ru' },
    stressSegments(text).map(segment => (segment.stressed ? h('span', { class: 'stress' }, segment.text) : segment.text)));
}
