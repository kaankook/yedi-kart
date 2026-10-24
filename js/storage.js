/* ==========================================================
   Yedi Kart: depolama
   localStorage:   rekor ve ses tercihi (kalıcı)
   sessionStorage: devam eden oyun (sekme kapanana kadar)
   Tüm erişimler try/catch içinde: gizli mod veya kota hatası oyunu bozmaz.
   ========================================================== */

import { CARD_VALUES } from './game.js';

const BEST_KEY = 'yedikart.best.mul';
const SAVE_KEY = 'yedikart.save.v1';
const MUTE_KEY = 'yedikart.muted';

/* ---------- Rekor ---------- */

export function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw === null ? null : Number(raw);
  } catch (e) { return null; }
}

export function saveBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch (e) { /* sessiz geç */ }
}

/* ---------- Ses tercihi ---------- */

export function loadMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
}

export function saveMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* sessiz geç */ }
}

/* ---------- Oyunu koruma ---------- */

// state null ise kayıt silinir.
export function saveState(state) {
  try {
    if (state) sessionStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(SAVE_KEY);
  } catch (e) { /* sessiz geç */ }
}

// Kayıt yoksa ya da bozuksa null döner.
export function loadSaved() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY));
    if (
      s &&
      Array.isArray(s.cards) && s.cards.length === CARD_VALUES.length &&
      s.cards.every((c) => c && CARD_VALUES.includes(c.value)) &&
      Array.isArray(s.picks) &&
      typeof s.score === 'number' && typeof s.finished === 'boolean'
    ) {
      return s;
    }
  } catch (e) { /* bozuk kayıt */ }
  return null;
}
