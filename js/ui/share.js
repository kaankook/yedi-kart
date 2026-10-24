/* ==========================================================
   Yedi Kart: sonucu paylaş (js/ui/share.js)
   Sonuç ekranındaki #btn-share düğmesini yönetir. Paylaşım verisini oyun state'inden alır;
   ekrandaki metinleri tekrar okuyarak ikinci bir veri kaynağı oluşturmaz.
   Telefonda sistemin paylaşım menüsünü (Web Share API) açar; desteklenmiyorsa metni panoya kopyalar.
   ========================================================== */

import { fmt } from '../game.js';

const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  || location.protocol === 'file:';

function reportShareError(operation, error) {
  if (isDevelopment) console.warn(`[share] ${operation} başarısız oldu`, error);
}

function buildMessage(state) {
  const lines = [`Yedi Kart'ta ${fmt(state.score)} puan yaptım! 🃏`];
  if (state.picks.length) lines.push(`Seçimlerim: ${state.picks.join(' → ')}`);
  lines.push('7 turu sıfır görmeden bitirdim. Sen de dene:');
  return lines.join('\n');
}

function shareUrl() {
  return location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href;
}

function initShare(getState) {
  const btn = document.getElementById('btn-share');
  const statusEl = document.getElementById('share-status');
  const label = btn ? btn.querySelector('.share-label') : null;
  if (!btn) return;

  let resetTimer = 0;

  function flash(msg, kind) {
    if (!label) return;
    const original = btn.dataset.label || (btn.dataset.label = label.textContent);
    label.textContent = msg;
    btn.classList.toggle('is-done', kind === 'ok');
    if (statusEl) statusEl.textContent = kind === 'ok' ? msg : '';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      label.textContent = original;
      btn.classList.remove('is-done');
      if (statusEl) statusEl.textContent = '';
    }, 2200);
  }

  async function onShare() {
    const state = getState();
    if (!state || !state.finished || state.busted) return;
    const message = buildMessage(state);
    const url = shareUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Yedi Kart', text: message, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // kullanıcı menüyü kapattı
        reportShareError('Sistem paylaşımı', err);
      }
    }
    try {
      await copyToClipboard(`${message}\n${url}`);
      flash('Kopyalandı ✓', 'ok');
    } catch (error) {
      reportShareError('Panoya kopyalama', error);
      flash('Kopyalanamadı', 'err');
    }
  }

  btn.addEventListener('click', onShare);
}

export { initShare };

async function copyToClipboard(str) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(str);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = str;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}
