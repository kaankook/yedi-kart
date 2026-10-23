'use strict';

/* ==========================================================
   Yedi Kart: oyun mantığı (DOM'dan ve sesten bağımsız)
   Kural: skor 1 ile başlar, seçilen kartın değeriyle çarpılır.
   Aynı sayıyı üst üste seçersen COMBO olur ve çarpan büyür.
   0 açılırsa oyun anında biter; 7 turu tamamlarsan skorun kalır.
   ========================================================== */

const TOTAL_ROUNDS = 7;
const START_SCORE = 1;
const CARD_VALUES = [-1, 0, 1, 2, 3, 4, 5, 6, 7];

function shuffle(array, rng = Math.random) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// JS'te 0 * -1 === -0 olur; ekranda ve karşılaştırmada sorun çıkmasın diye normalize et.
function normalize(n) {
  return n === 0 ? 0 : n;
}

function fmt(n) {
  return normalize(n).toLocaleString('tr-TR');
}

function totalScore(state) {
  if (!state) return 0;
  return normalize(state.score);
}

function comboCount(picks) {
  if (!Array.isArray(picks)) return 0;
  if (picks.length < 2) return 0;
  const last = picks[picks.length - 1];
  let combo = 1;
  for (let i = picks.length - 2; i >= 0 && picks[i] === last; i--) combo++;
  return combo >= 2 ? combo : 0;
}

function comboLabel(state) {
  const combo = comboCount(state && state.picks);
  return combo ? `COMBO x${combo}` : '';
}

function dealCards(rng = Math.random) {
  return shuffle(CARD_VALUES, rng).map((value) => ({ value, revealed: false }));
}

function newGame(rng = Math.random) {
  return {
    cards: dealCards(rng),
    picks: [],                // seçilen değerler, sırayla
    score: START_SCORE,       // eldeki aktif skor
    scoreBefore: START_SCORE, // son seçimden önceki el skoru (game over ekranında kullanılır)
    comboLevel: 0,            // son seçimin dahil olduğu ardışık aynı sayı serisi
    round: 1,                 // oynanmakta olan tur (1..7); yalnızca yeni tur dağıtılınca artar
    finished: false,
    busted: false,            // 0 açıldığı için oyun erken bittiyse true
    locked: false,            // seçim yapıldı, kartlar yeniden karışana kadar true
    lastOp: null,
  };
}

// Her turdan sonra 9 kartın tamamı (seçilen dahil) kapanır ve yeniden karışır.
function nextRound(state, rng = Math.random) {
  if (!state || state.finished || !state.locked) return state;
  return { ...state, cards: dealCards(rng), locked: false, round: state.picks.length + 1 };
}

// Başarılıysa yeni durumu, geçersizse null döndürür. Hiçbir şeyi yarım güncellemez.
function pickCard(state, index) {
  if (!state || state.finished || state.locked) return null;
  const card = state.cards[index];
  if (!card || card.revealed) return null;

  const before = state.score;
  const previousPick = state.picks[state.picks.length - 1];
  const previousCombo = state.comboLevel || comboCount(state.picks);
  const comboLevel = previousPick === card.value ? previousCombo + 1 : 1;
  const normalScore = normalize(before * card.value);
  const after = normalize(normalScore * (comboLevel >= 2 ? comboLevel : 1));
  const vText = card.value < 0 ? `(${card.value})` : `${card.value}`;
  const op = comboLevel >= 2
    ? `${fmt(before)} × ${vText} × ${comboLevel} = ${fmt(after)}\n🔥 ${comboLevel}x COMBO`
    : `${fmt(before)} × ${vText} = ${fmt(after)}`;

  const picks = state.picks.concat(card.value);
  const busted = card.value === 0;                    // 0 açılırsa oyun anında biter
  const finished = busted || picks.length >= TOTAL_ROUNDS;

  return {
    ...state,
    cards: state.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c)),
    picks,
    score: after,
    scoreBefore: before,
    comboLevel,
    round: finished ? picks.length : state.round,       // tur, kartlar yeniden dağıtılınca ilerler (nextRound)
    finished,
    busted,
    locked: true,
    lastOp: op,
  };
}

/* Node ile test edebilmek için */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TOTAL_ROUNDS, START_SCORE, CARD_VALUES,
    shuffle, newGame, pickCard, totalScore, nextRound, normalize, fmt,
    comboCount, comboLabel,
  };
}
