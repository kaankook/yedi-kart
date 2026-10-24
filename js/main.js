/* ==========================================================
   Yedi Kart: giriş noktası
   Oyun akışı (durum, zamanlayıcılar, tur döngüsü) ve olay bağlama burada.
   Mantık: game.js · Ses: audio.js · Depolama: storage.js · Arayüz: ui/*
   ========================================================== */

import { $, $$ } from './ui/dom.js';
import { newGame, pickCard, nextRound, totalScore, fmt } from './game.js';
import { GameAudio } from './audio.js';
import { loadBest, saveBest, loadSaved, saveState } from './storage.js';
import { buildGrid, resetCards, revealCard, peekOthers, closeAllCards, markDoom } from './ui/grid.js';
import {
  clearFx, showScreen, showCombo, renderGameInfo, renderMenuBest, syncSoundButtons,
  showResultScreen, showGameOverScreen, playBustFx, cancelCount,
} from './ui/screens.js';
import { askConfirm, initHowto } from './ui/dialogs.js';
import { initIntro } from './ui/intro.js';

// Seçimden sonra zamanlama (ms): diğer kartları göster, sonra hepsini seçilen karttan başlayarak kapat.
// Kart çevirme süresi tek yerden yönetilir: FLIP_MS, base.css'teki --flip'i ezer.
const FLIP_MS = 380;
document.documentElement.style.setProperty('--flip', FLIP_MS + 'ms');
const PEEK_AT = 520;        // seçilen kart açıldıktan hemen sonra diğer 8 kart açılır
const PEEK_BUST_AT = 680;   // sıfır geldiyse (ilk sarsıntı darbesinden sonra)
const CLOSE_AT = 1750;      // diğer kartlar ~850ms açık kalır; sonra kapanır / sonuç ekranı gelir
const REDEAL_GAP = 540;     // çapraz kapanış dalgası (380ms + 4*35ms) biter bitmez yeni tur başlar
const GAMEOVER_AT = 1950;   // game over ekranı

let state = null;           // geçerli oyun
let gameSeq = 0;            // aktif oyun oturumu sayacı
let resultTimer = null;
let roundTimer = null;
let peekTimer = null;

function clearTimers() {
  clearTimeout(resultTimer);
  clearTimeout(roundTimer);
  clearTimeout(peekTimer);
  cancelCount();
}

/* ---------- Sonuç ve game over ---------- */

function showResult() {
  if (!state || !state.finished) return;
  if (state.busted) { showGameOver(); return; }

  if (!state.bestText) {
    const finalTotal = totalScore(state);
    const prev = loadBest();
    if (prev === null) {
      state.bestText = 'İlk rekorun!';
    } else if (finalTotal > prev) {
      state.bestText = `Yeni rekor! (Önceki: ${fmt(prev)})`;
    } else {
      state.bestText = `En yüksek skor: ${fmt(prev)}`;
    }
    if (prev === null || finalTotal > prev) saveBest(finalTotal);
    saveState(state);
  }
  showResultScreen(state);
}

function showGameOver() {
  if (!state || !state.busted) return;
  showGameOverScreen(state);
}

/* ---------- Oyunu koruma ---------- */

function resume() {
  const saved = loadSaved();
  if (!saved) return false;
  clearTimers();
  gameSeq++;
  state = nextRound(saved);
  saveState(state);
  if (state.finished) {
    if (state.busted) showGameOver(); else showResult();
    return true;
  }
  buildGrid(state.cards);
  renderGameInfo(state, false);
  showScreen('game');
  return true;
}

/* ---------- Oyun akışı ---------- */

function startGame() {
  clearTimers();
  clearFx();
  gameSeq++;
  GameAudio.prepare();
  state = newGame();
  saveState(state);
  buildGrid(state.cards);
  renderGameInfo(state, false);
  showScreen('game');
}

function onCardClick(index) {
  const next = pickCard(state, index);
  if (!next) return;
  state = next;
  revealCard(index, state.cards[index].value);
  renderGameInfo(state, true);
  showCombo(state.comboLevel);
  saveState(state);

  const seq = gameSeq;
  const { scoreBefore, score, busted } = state;
  GameAudio.playFlip();
  setTimeout(() => GameAudio.playResult(scoreBefore, score, busted), 160);

  const peek = (delay) => {
    peekTimer = setTimeout(() => {
      if (gameSeq === seq && state) peekOthers(state.cards, index);
    }, delay);
  };

  if (state.finished) {
    if (state.busted) {
      markDoom(index);
      playBustFx();
      peek(PEEK_BUST_AT);
      resultTimer = setTimeout(showGameOver, GAMEOVER_AT);
    } else {
      peek(PEEK_AT);
      resultTimer = setTimeout(showResult, CLOSE_AT);
    }
    return;
  }

  peek(PEEK_AT);
  roundTimer = setTimeout(() => {
    if (gameSeq !== seq || !state) return;
    closeAllCards(index);
    roundTimer = setTimeout(() => {
      if (gameSeq !== seq || !state) return;
      state = nextRound(state);
      saveState(state);
      resetCards();
      renderGameInfo(state, false, true);
    }, REDEAL_GAP);
  }, CLOSE_AT);
}

function inProgress() {
  return state && !state.finished && state.picks.length > 0;
}

async function goMenu() {
  if (inProgress() && !(await askConfirm('Devam eden oyun kaybolacak. Ana menüye dönmek istiyor musun?'))) return;
  clearTimers();
  gameSeq++;
  state = null;
  saveState(state);
  renderMenuBest();
  showScreen('menu');
}

async function onNewGame() {
  if (inProgress() && !(await askConfirm('Devam eden oyun kaybolacak. Yeni oyun başlatılsın mı?'))) return;
  startGame();
}

function toggleSound() {
  GameAudio.toggleMute();
  syncSoundButtons();
}

/* ---------- Olaylar ve başlatma ---------- */

$('#grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.card');
  if (btn) onCardClick(Number(btn.dataset.index));
});
$('#btn-play').addEventListener('click', startGame);
$('#btn-new').addEventListener('click', onNewGame);
$('#btn-again').addEventListener('click', startGame);
$('#btn-retry').addEventListener('click', startGame);
$('#btn-menu-gameover').addEventListener('click', goMenu);
$('#btn-menu-game').addEventListener('click', goMenu);
$('#btn-menu-result').addEventListener('click', goMenu);
$$('.sound-btn').forEach((b) => b.addEventListener('click', toggleSound));
initHowto();

syncSoundButtons();
renderMenuBest();
resume();
initIntro();
