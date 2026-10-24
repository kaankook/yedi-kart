/* ==========================================================
   Yedi Kart: kart alanı (9 kartlık ızgara)
   Yalnızca DOM'a dokunur; oyun durumunu bilmez, gereken değerler parametre gelir.
   ========================================================== */

import { $, $$ } from './dom.js';
import { CARD_VALUES } from '../game.js';

const cardEl = (index) => $(`#grid .card[data-index="${index}"]`);

function setFace(btn, index, value) {
  btn.classList.remove('closing');
  btn.querySelector('.front').textContent = String(value);
  btn.classList.toggle('neg', value < 0);
  btn.classList.toggle('zero', value === 0);
  btn.setAttribute('aria-label', `Kart ${index + 1}, açık: ${value}`);
}

// Izgara daha önce kurulduysa yeniden oluşturmaz, yalnızca kartları kapatır.
export function buildGrid(cards) {
  const grid = $('#grid');
  grid.classList.remove('dead');
  if (grid.children.length === CARD_VALUES.length) {
    resetCards();
    return;
  }
  grid.innerHTML = '';
  cards.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.style.setProperty('--wave', `${((i % 3) + Math.floor(i / 3)) * 35}ms`);
    btn.dataset.index = String(i);
    btn.setAttribute('aria-label', `Kart ${i + 1}, kapalı`);
    btn.innerHTML =
      '<span class="card-inner">' +
      '<span class="face back" aria-hidden="true">?</span>' +
      '<span class="face front"></span>' +
      '</span>';
    grid.appendChild(btn);
  });
}

export function resetCards() {
  $('#grid').classList.remove('dead');
  $$('#grid .card').forEach((btn, i) => {
    btn.className = 'card';
    btn.querySelector('.front').textContent = '';
    btn.setAttribute('aria-label', `Kart ${i + 1}, kapalı`);
  });
}

// Seçilen kartı açar.
export function revealCard(index, value, comboLevel = 0) {
  const btn = cardEl(index);
  setFace(btn, index, value);
  btn.classList.add('revealed', 'picked');
  btn.classList.toggle('combo', comboLevel >= 2);
  btn.classList.toggle('combo-next', comboLevel >= 3);
  btn.style.setProperty('--lv', String(Math.min(comboLevel, 5))); // CSS'te efekt şiddeti için
}

// Seçilmeyen diğer kartları yarı saydam açar (FOMO etkisi).
export function peekOthers(cards, except) {
  cards.forEach((card, i) => {
    if (i === except) return;
    const btn = cardEl(i);
    if (!btn) return;
    setFace(btn, i, card.value);
    const dist = Math.abs((i % 3) - (except % 3)) + Math.abs(Math.floor(i / 3) - Math.floor(except / 3));
    btn.style.setProperty('--peek-delay', `${50 + dist * 35}ms`); // seçilenden dışarı doğru dalga
    btn.classList.add('revealed', 'peek');
  });
}

// Seçilen karttan dışarı yayılan kapanış; yeniden karıştırma ui akışında resetCards ile tamamlanır.
export function closeAllCards(selectedIndex) {
  $$('#grid .card').forEach((btn) => {
    const index = Number(btn.dataset.index);
    const distance = Math.abs((index % 3) - (selectedIndex % 3))
      + Math.abs(Math.floor(index / 3) - Math.floor(selectedIndex / 3));
    btn.style.setProperty('--wave', `${distance * 35}ms`);
    btn.classList.add('closing');
    btn.classList.remove('revealed', 'peek');
  });
}

// Sıfır açıldı: kartı vurgula, kalan kapalı kartları söndür.
export function markDoom(index) {
  cardEl(index).classList.add('doom');
  $('#grid').classList.add('dead');
}