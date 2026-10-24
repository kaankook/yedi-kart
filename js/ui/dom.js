/* ==========================================================
   Yedi Kart: küçük DOM yardımcıları (ui/* modülleri paylaşır)
   ========================================================== */

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Sınıfı kaldırıp yeniden ekler; CSS animasyonu baştan oynar.
export function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Işık ve hareket hassasiyeti: flaş, sarsıntı, titreşim ve sayaç animasyonu bu durumda çalışmaz.
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduceMotion = () => motionQuery.matches;

export function initFirstRound() {
  const screen = document.getElementById('screen-game');
  const pill = document.getElementById('round-pill');
  if (!screen || !pill) return;

  const HOLD_MS = 1600;
  const DEBOUNCE_MS = 400;
  let timer = 0;
  let lastPlay = 0;
  let lastRound = roundNo();
  let wasActive = screen.classList.contains('active');

  function roundNo() {
    const match = pill.textContent.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function clear() {
    clearTimeout(timer);
    if (screen.classList.contains('first-round')) {
      screen.classList.remove('first-round');
    }
  }

  function play() {
    if (document.documentElement.classList.contains('intro')) return;
    const now = performance.now();
    if (now - lastPlay < DEBOUNCE_MS) return;
    lastPlay = now;
    clear();
    void screen.offsetWidth;
    screen.classList.add('first-round');
    timer = setTimeout(clear, HOLD_MS);
  }

  // Ekran etkinleşir etkinleşmez (ilk kare çizilmeden) çalışır: gecikirse ekran önce tam görünür,
  // sonra animasyonla yeniden belirir ve titreme olur. Gözlemci mikro görevi boyamadan önce koşar.
  function onActivated() {
    if (screen.classList.contains('active') && roundNo() === 1) play();
  }

  new MutationObserver(() => {
    const active = screen.classList.contains('active');
    if (active && !wasActive) onActivated();
    if (!active) clear();
    wasActive = active;
  }).observe(screen, { attributes: true, attributeFilter: ['class'] });

  new MutationObserver(() => {
    const round = roundNo();
    if (screen.classList.contains('active') && round === 1 && lastRound !== 1) play();
    lastRound = round;
  }).observe(pill, { childList: true, characterData: true, subtree: true });

  screen.addEventListener('pointerdown', clear, true);
  screen.addEventListener('keydown', clear, true);

  if (wasActive && roundNo() === 1) onActivated();
}