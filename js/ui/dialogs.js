/* ==========================================================
   Yedi Kart: diyaloglar (<dialog>)
   Onay kutusu ve Nasıl Oynanır kartı.
   ========================================================== */

import { $ } from './dom.js';

/* ---------- Onay kutusu (window.confirm yerine <dialog>) ---------- */

export function askConfirm(text) {
  return new Promise((resolve) => {
    const dlg = $('#confirm-dialog');
    $('#confirm-text').textContent = text;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

/* ---------- Nasıl oynanır ---------- */

// Kartın dışındaki karartılmış alana dokununca da kapanır.
export function initHowto() {
  const howto = $('#howto-dialog');
  $('#btn-howto').addEventListener('click', () => howto.showModal());
  howto.addEventListener('click', (e) => {
    if (e.clientX === 0 && e.clientY === 0) return;   // klavyeyle tetiklenen tıklama
    const r = howto.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) howto.close();
  });
}
