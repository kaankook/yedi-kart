/* ==========================================================
   Yedi Kart: depolama
   localStorage:   rekor ve ses tercihi (kalıcı)
   sessionStorage: devam eden oyun (sekme kapanana kadar)
   Tüm erişimler try/catch içinde: gizli mod veya kota hatası oyunu bozmaz.
   ========================================================== */

import { CARD_VALUES, TOTAL_ROUNDS } from './game.js';

const BEST_KEY = 'yedikart.best.mul';
const SAVE_KEY = 'yedikart.save.v1';
const MUTE_KEY = 'yedikart.muted';
const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  || location.protocol === 'file:';

function reportStorageError(operation, error) {
  if (isDevelopment) console.warn(`[storage] ${operation} başarısız oldu`, error);
}

/* ---------- Rekor ---------- */

export function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch (e) {
    reportStorageError('Rekoru okuma', e);
    return null;
  }
}

export function saveBest(value) {
  if (!Number.isFinite(value)) return;
  try { localStorage.setItem(BEST_KEY, String(value)); }
  catch (e) { reportStorageError('Rekoru kaydetme', e); }
}

/* ---------- Ses tercihi ---------- */

export function loadMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; }
  catch (e) {
    reportStorageError('Ses tercihini okuma', e);
    return false;
  }
}

export function saveMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); }
  catch (e) { reportStorageError('Ses tercihini kaydetme', e); }
}

/* ---------- Oyunu koruma ---------- */

// state null ise kayıt silinir.
export function saveState(state) {
  try {
    if (state) sessionStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(SAVE_KEY);
  } catch (e) { reportStorageError('Oyunu kaydetme', e); }
}

// Kayıt yoksa ya da bozuksa null döner.
export function loadSaved() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY));
    const cardValues = s && Array.isArray(s.cards) ? s.cards.map((c) => c && c.value) : [];
    const revealedCount = s && Array.isArray(s.cards)
      ? s.cards.filter((c) => c && c.revealed === true).length
      : 0;
    const cardsAreComplete = cardValues.length === CARD_VALUES.length
      && CARD_VALUES.every((value) => cardValues.includes(value));
    const picksAreValid = Array.isArray(s && s.picks)
      && s.picks.length <= TOTAL_ROUNDS
      && s.picks.every((value) => CARD_VALUES.includes(value));
    const stateIsConsistent = s
      && typeof s.locked === 'boolean'
      && typeof s.busted === 'boolean'
      && (!s.locked ? revealedCount === 0 : revealedCount === 1)
      && (!s.busted || (s.finished && s.picks[s.picks.length - 1] === 0))
      && (!s.finished || (s.busted ? s.picks.length < TOTAL_ROUNDS : s.picks.length === TOTAL_ROUNDS))
      && (s.finished || s.picks.length < TOTAL_ROUNDS)
      && (!s.finished || s.locked);

    if (
      s &&
      Array.isArray(s.cards) && s.cards.length === CARD_VALUES.length &&
      s.cards.every((c) => c && CARD_VALUES.includes(c.value) && typeof c.revealed === 'boolean') &&
      cardsAreComplete &&
      picksAreValid &&
      Number.isFinite(s.score) &&
      Number.isFinite(s.scoreBefore) &&
      typeof s.finished === 'boolean' &&
      typeof s.round === 'number' && Number.isInteger(s.round) &&
      s.round >= 1 && s.round <= TOTAL_ROUNDS &&
      stateIsConsistent
    ) {
      return s;
    }
    if (s !== null) reportStorageError('Bozuk oyun kaydı yok sayıldı', s);
  } catch (e) {
    reportStorageError('Kayıt doğrulama', e);
  }
  return null;
}
