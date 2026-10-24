/* ==========================================================
   Yedi Kart: açılış animasyonu
   <html class="intro"> ile başlar (css/intro.css). Animasyon bitince ya da kullanıcı ilk kez
   dokununca/tuşa basınca sınıf kalkar; sonraki ekran geçişleri ve tur yenilemeleri etkilenmez.
   ========================================================== */

const INTRO_MS = 1600;   // en geç öğe ~1300ms'de biter

export function initIntro() {
  const root = document.documentElement;
  if (!root.classList.contains('intro')) return;

  const events = ['pointerdown', 'keydown'];
  let introTimer = null;
  const endIntro = () => {
    clearTimeout(introTimer);
    events.forEach((ev) => window.removeEventListener(ev, endIntro, true));
    root.classList.remove('intro');
  };
  introTimer = setTimeout(endIntro, INTRO_MS);
  events.forEach((ev) => window.addEventListener(ev, endIntro, true));
}
