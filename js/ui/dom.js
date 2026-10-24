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
