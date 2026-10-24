/* ==========================================================
   Yedi Kart: ekranlar ve metin/skor gösterimi
   Menü, oyun üst bilgisi, sonuç ve game over ekranlarını çizer.
   Oyun akışını (zamanlayıcılar, durum) yönetmez; o main.js'in işi.
   ========================================================== */

import { $, $$, retrigger, reduceMotion } from './dom.js';
import { TOTAL_ROUNDS, fmt, totalScore, comboLabel } from '../game.js';
import { GameAudio } from '../audio.js';
import { loadBest } from '../storage.js';

const HINT_TEXT = 'Bir karta dokun ve şansını dene!';

// Ses düğmesi ikonları (çizgi stili aynı; kapalıda hoparlörde çarpı var)
const ICON_SOUND_ON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" focusable="false"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/></svg>';
const ICON_SOUND_OFF = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" focusable="false"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/></svg>';

/* ---------- Ekran geçişi ve efektler ---------- */

// shake/bump sınıfları kalırsa, ekran display:none -> flex olduğunda animasyon yeniden oynar.
export function clearFx() {
  $('#screen-game').classList.remove('shake');
  $('#score').classList.remove('bump');
  $('#round-pill').classList.remove('bump');
  const comboBanner = $('#combo-banner');
  comboBanner.classList.remove('show');
  comboBanner.textContent = '';
}

export function showScreen(name) {
  if (name !== 'game') clearFx();
  $$('.screen').forEach((el) => el.classList.toggle('active', el.id === `screen-${name}`));
  document.body.classList.toggle('dark', name === 'gameover');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', name === 'gameover' ? '#1a0b12' : '#f4f6fb');
  window.scrollTo(0, 0);
}

// Sıfır açıldığında sarsıntı, kırmızı flaş ve titreşim (azaltılmış harekette hiçbiri çalışmaz).
export function playBustFx() {
  if (reduceMotion()) return;
  retrigger($('#screen-game'), 'shake');
  retrigger($('#flash'), 'on');
  if (navigator.vibrate) { try { navigator.vibrate([120, 60, 220]); } catch (e) { /* yok say */ } }
}

/* ---------- Skor ve oyun bilgisi ---------- */

export function setScore(el, value, animate) {
  el.textContent = fmt(value);
  el.classList.toggle('neg', value < 0);
  if (animate) retrigger(el, 'bump');
}

export function showCombo(level) {
  const banner = $('#combo-banner');
  if (level < 2) {
    banner.textContent = '';
    banner.classList.remove('show');
    return;
  }
  banner.textContent = `${level}x COMBO!`;
  retrigger(banner, 'show');
}

export function renderGameInfo(state, animate, pulseRound) {
  const pill = $('#round-pill');
  const text = `Tur ${state.round} / ${TOTAL_ROUNDS}`;
  const changed = pill.textContent !== text;
  pill.textContent = text;
  if (changed && pulseRound) retrigger(pill, 'bump');
  setScore($('#score'), state.score, animate);
  $('#last-op').textContent = state.lastOp ? state.lastOp : HINT_TEXT;
}

/* ---------- Menü ve ses düğmeleri ---------- */

export function renderMenuBest() {
  const best = loadBest();
  $('#menu-best').textContent = best === null ? '' : `En yüksek skor: ${fmt(best)}`;
}

export function syncSoundButtons() {
  const muted = GameAudio.isMuted();
  $$('.sound-btn').forEach((b) => {
    b.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    b.setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
  });
}

/* ---------- Sonuç ekranı ---------- */

function renderPickList(container, s, isGameOver) {
  container.innerHTML = '';
  s.picks.forEach((v, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'picked-arrow';
      arrow.textContent = '→';
      container.appendChild(arrow);
    }
    const item = document.createElement('span');
    const isDoom = isGameOver && i === s.picks.length - 1;
    item.className = 'picked-item' + (v < 0 ? ' neg' : '') + (isDoom ? ' doom' : '');
    item.textContent = String(v);
    container.appendChild(item);
  });
}

// state.bestText önceden hazırlanmış olmalı (main.js hazırlar).
export function showResultScreen(state) {
  setScore($('#final-score'), totalScore(state), false);
  $('#result-breakdown').textContent = comboLabel(state);
  $('#result-rounds').textContent = `${state.picks.length} / ${TOTAL_ROUNDS} tur oynandı`;
  $('#result-best').textContent = state.bestText;
  renderPickList($('#picked-list'), state, false);
  showScreen('result');
}

/* ---------- Game over ekranı ---------- */

let countRaf = null;
let countTimer = null;

export function cancelCount() {
  cancelAnimationFrame(countRaf);
  clearTimeout(countTimer);
}

// Elindeki skoru 0'a düşürür. Azaltılmış harekette sayaç akmaz: değer bekleyip tek seferde 0 olur.
function countTo(el, from, to, delay, duration) {
  cancelCount();
  el.textContent = fmt(from);
  el.classList.remove('zeroed');
  if (from === to) {
    el.classList.toggle('zeroed', to === 0);
    return;
  }
  const finish = () => {
    el.textContent = fmt(to);
    el.classList.add('zeroed');
  };
  if (reduceMotion()) {
    countTimer = setTimeout(finish, delay);
    return;
  }
  const t0 = performance.now() + delay;
  const step = (now) => {
    if (now < t0) { countRaf = requestAnimationFrame(step); return; }
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * eased));
    if (p < 1) countRaf = requestAnimationFrame(step);
    else finish();
  };
  countRaf = requestAnimationFrame(step);
}

export function showGameOverScreen(state) {
  $('#go-detail').textContent = state.picks.length === 1
    ? 'Daha ilk turda sıfır açıldı...'
    : `${state.picks.length}. turda sıfır açıldı ve elindeki sayı sıfırlandı.`;
  $('#go-combo').textContent = comboLabel(state);

  renderPickList($('#go-picks'), state, true);

  const prev = loadBest();
  $('#go-best').textContent = prev === null ? '' : `En yüksek skor: ${fmt(prev)}`;

  showScreen('gameover');
  countTo($('#go-score'), state.scoreBefore, 0, 1100, 850);
}