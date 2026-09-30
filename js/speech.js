// Synthèse vocale russe (voix du système, « Milena » sur iPhone).
import { stripStress } from './stress.js';

let voice = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('ru'));
  voice = voices.find(v => v.name.includes('Milena')) ?? voices[0] ?? null;
}

// Les voix se chargent de façon asynchrone : on attend au plus 1,5 s.
export function initSpeech() {
  if (!('speechSynthesis' in globalThis)) return Promise.resolve(false);
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
  pickVoice();
  if (voice) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = () => { pickVoice(); resolve(voice !== null); };
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

export function hasRussianVoice() {
  return voice !== null;
}

export function speak(text) {
  if (!voice) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(stripStress(text));
  utterance.voice = voice;
  utterance.lang = 'ru-RU';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
