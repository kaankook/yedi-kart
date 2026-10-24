'use strict';

/* ==========================================================
   Yedi Kart: arayüz
   game.js (mantık) ve audio.js (ses) önce yüklenmiş olmalı.
   ========================================================== */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const HINT_TEXT = 'Bir karta dokun ve şansını dene!';

  // Ses düğmesi ikonları (çizgi stili aynı; kapalıda hoparlörde çarpı var)
  const ICON_SOUND_ON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" focusable="false"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/></svg>';
  const ICON_SOUND_OFF = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" focusable="false"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/></svg>';
  const BEST_KEY = 'yedikart.best.mul';
  const SAVE_KEY = 'yedikart.save.v1';

  // Seçimden sonra zamanlama (ms): diğer kartları göster, sonra hepsini kapat.
  // Kart çevirme süresi tek yerden yönetilir: FLIP_MS, style.css'teki --flip'i ezer.
  const FLIP_MS = 380;
  document.documentElement.style.setProperty('--flip', FLIP_MS + 'ms');
  const PEEK_AT = 520;        // seçilen kart açıldıktan hemen sonra diğer 8 kart açılır
  const PEEK_BUST_AT = 680;   // sıfır geldiyse (ilk sarsıntı darbesinden sonra)
  const CLOSE_AT = 1750;      // diğer kartlar ~850ms açık kalır; sonra kapanır / sonuç ekranı gelir
  const REDEAL_GAP = 540;     // çapraz kapanış dalgası (380ms + 4*35ms) biter bitmez yeni tur başlar
  const GAMEOVER_AT = 1950;   // game over ekranı

  // Işık ve hareket hassasiyeti: flaş, sarsıntı, titreşim ve sayaç animasyonu bu durumda çalışmaz.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => motionQuery.matches;

  let state = null;           // geçerli oyun
  let gameSeq = 0;            // aktif oyun oturumu sayacı
  let resultTimer = null;
  let roundTimer = null;
  let peekTimer = null;
  let countTimer = null;
  let countRaf = null;

  function clearTimers() {
    clearTimeout(resultTimer);
    clearTimeout(roundTimer);
    clearTimeout(peekTimer);
    clearTimeout(countTimer);
    cancelAnimationFrame(countRaf);
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function clearFx() {
    $('#screen-game').classList.remove('shake');
    $('#score').classList.remove('bump');
    $('#round-pill').classList.remove('bump');
    const comboBanner = $('#combo-banner');
    comboBanner.classList.remove('show');
    comboBanner.textContent = '';
  }

  function showScreen(name) {
    if (name !== 'game') clearFx();
    $$('.screen').forEach((el) => el.classList.toggle('active', el.id === `screen-${name}`));
    document.body.classList.toggle('dark', name === 'gameover');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', name === 'gameover' ? '#1a0b12' : '#fbf8f2');
    window.scrollTo(0, 0);
  }

  function setScore(el, value, animate) {
    el.textContent = fmt(value);
    el.classList.toggle('neg', value < 0);
    if (animate) retrigger(el, 'bump');
  }

  function showCombo(level) {
    const banner = $('#combo-banner');
    if (level < 2) {
      banner.textContent = '';
      banner.classList.remove('show');
      return;
    }
    banner.textContent = `${level}x COMBO!`;
    retrigger(banner, 'show');
  }

  /* ---------- Rekor ---------- */

  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      return raw === null ? null : Number(raw);
    } catch (e) { return null; }
  }
  function saveBest(value) {
    try { localStorage.setItem(BEST_KEY, String(value)); } catch (e) { /* sessiz geç */ }
  }

  function renderMenuBest() {
    const best = loadBest();
    $('#menu-best').textContent = best === null ? '' : `En yüksek skor: ${fmt(best)}`;
  }

  /* ---------- Ses düğmeleri ---------- */

  function syncSoundButtons() {
    const muted = GameAudio.isMuted();
    $$('.sound-btn').forEach((b) => {
      b.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
      b.setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
    });
  }

  function toggleSound() {
    GameAudio.toggleMute();
    syncSoundButtons();
  }

  /* ---------- Oyunu koruma (sessionStorage) ---------- */

  function saveState() {
    try {
      if (state) sessionStorage.setItem(SAVE_KEY, JSON.stringify(state));
      else sessionStorage.removeItem(SAVE_KEY);
    } catch (e) { /* sessiz geç */ }
  }

  function loadSaved() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SAVE_KEY));
      if (
        s &&
        Array.isArray(s.cards) && s.cards.length === CARD_VALUES.length &&
        s.cards.every((c) => c && CARD_VALUES.includes(c.value)) &&
        Array.isArray(s.picks) &&
        typeof s.score === 'number' && typeof s.finished === 'boolean'
      ) {
        return s;
      }
    } catch (e) { /* bozuk kayıt */ }
    return null;
  }

  function resume() {
    const saved = loadSaved();
    if (!saved) return false;
    clearTimers();
    gameSeq++;
    state = nextRound(saved);
    saveState();
    if (state.finished) {
      if (state.busted) showGameOver(); else showResult();
      return true;
    }
    buildGrid();
    renderGameInfo(false);
    showScreen('game');
    return true;
  }

  /* ---------- Onay kutusu (window.confirm yerine <dialog>) ---------- */

  function askConfirm(text) {
    return new Promise((resolve) => {
      const dlg = $('#confirm-dialog');
      $('#confirm-text').textContent = text;
      dlg.returnValue = '';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  /* ---------- Kartlar ---------- */

  function buildGrid() {
    const grid = $('#grid');
    grid.classList.remove('dead');
    if (grid.children.length === CARD_VALUES.length) {
      resetCards();
      return;
    }
    grid.innerHTML = '';
    state.cards.forEach((_, i) => {
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

  function resetCards() {
    $('#grid').classList.remove('dead');
    $$('#grid .card').forEach((btn, i) => {
      btn.className = 'card';
      btn.querySelector('.front').textContent = '';
      btn.setAttribute('aria-label', `Kart ${i + 1}, kapalı`);
    });
  }

  function revealCard(index) {
    const btn = $(`#grid .card[data-index="${index}"]`);
    const value = state.cards[index].value;
    btn.classList.remove('closing');
    btn.querySelector('.front').textContent = String(value);
    btn.classList.add('revealed', 'picked');
    btn.classList.toggle('neg', value < 0);
    btn.classList.toggle('zero', value === 0);
    btn.setAttribute('aria-label', `Kart ${index + 1}, açık: ${value}`);
  }

  function peekOthers(except) {
    state.cards.forEach((card, i) => {
      if (i === except) return;
      const btn = $(`#grid .card[data-index="${i}"]`);
      if (!btn) return;
      btn.classList.remove('closing');
      btn.querySelector('.front').textContent = String(card.value);
      btn.classList.add('revealed', 'peek');
      btn.classList.toggle('neg', card.value < 0);
      btn.classList.toggle('zero', card.value === 0);
      btn.setAttribute('aria-label', `Kart ${i + 1}, açık: ${card.value}`);
    });
  }

  function closeAllCards() {
    $$('#grid .card').forEach((btn) => {
      btn.classList.add('closing');
      btn.classList.remove('revealed', 'peek');
    });
  }

  function renderGameInfo(animate, pulseRound) {
    const pill = $('#round-pill');
    const text = `Tur ${state.round} / ${TOTAL_ROUNDS}`;
    const changed = pill.textContent !== text;
    pill.textContent = text;
    if (changed && pulseRound) retrigger(pill, 'bump');
    setScore($('#score'), state.score, animate);
    $('#last-op').textContent = state.lastOp ? state.lastOp : HINT_TEXT;
  }

  /* ---------- Oyun akışı ---------- */

  function startGame() {
    clearTimers();
    clearFx();
    gameSeq++;
    GameAudio.prepare();
    state = newGame();
    saveState();
    buildGrid();
    renderGameInfo(false);
    showScreen('game');
  }

  function onCardClick(index) {
    const next = pickCard(state, index);
    if (!next) return;
    state = next;
    revealCard(index);
    renderGameInfo(true);
    showCombo(state.comboLevel);
    saveState();

    const seq = gameSeq;
    const { scoreBefore, score, busted } = state;
    GameAudio.playFlip();
    setTimeout(() => GameAudio.playResult(scoreBefore, score, busted), 160);

    const peek = (delay) => {
      peekTimer = setTimeout(() => {
        if (gameSeq === seq && state) peekOthers(index);
      }, delay);
    };

    if (state.finished) {
      if (state.busted) {
        $(`#grid .card[data-index="${index}"]`).classList.add('doom');
        $('#grid').classList.add('dead');
        if (!reduceMotion()) {
          retrigger($('#screen-game'), 'shake');
          retrigger($('#flash'), 'on');
          if (navigator.vibrate) { try { navigator.vibrate([120, 60, 220]); } catch (e) { /* yok say */ } }
        }
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
      closeAllCards();
      roundTimer = setTimeout(() => {
        if (gameSeq !== seq || !state) return;
        state = nextRound(state);
        saveState();
        resetCards();
        renderGameInfo(false, true);
      }, REDEAL_GAP);
    }, CLOSE_AT);
  }

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

  function showResult() {
    if (!state || !state.finished) return;
    if (state.busted) { showGameOver(); return; }

    const finalTotal = totalScore(state);
    setScore($('#final-score'), finalTotal, false);
    $('#result-breakdown').textContent = comboLabel(state);
    $('#result-rounds').textContent = `${state.picks.length} / ${TOTAL_ROUNDS} tur oynandı`;

    if (!state.bestText) {
      const prev = loadBest();
      if (prev === null) {
        state.bestText = 'İlk rekorun!';
      } else if (finalTotal > prev) {
        state.bestText = `Yeni rekor! (Önceki: ${fmt(prev)})`;
      } else {
        state.bestText = `En yüksek skor: ${fmt(prev)}`;
      }
      if (prev === null || finalTotal > prev) saveBest(finalTotal);
      saveState();
    }
    $('#result-best').textContent = state.bestText;

    renderPickList($('#picked-list'), state, false);
    showScreen('result');
  }

  // Elindeki skoru 0'a düşürür. Azaltılmış harekette sayaç akmaz: değer bekleyip tek seferde 0 olur.
  function countTo(el, from, to, delay, duration) {
    cancelAnimationFrame(countRaf);
    clearTimeout(countTimer);
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

  function showGameOver() {
    if (!state || !state.busted) return;

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

  function inProgress() {
    return state && !state.finished && state.picks.length > 0;
  }

  async function goMenu() {
    if (inProgress() && !(await askConfirm('Devam eden oyun kaybolacak. Ana menüye dönmek istiyor musun?'))) return;
    clearTimers();
    gameSeq++;
    state = null;
    saveState();
    renderMenuBest();
    showScreen('menu');
  }

  async function onNewGame() {
    if (inProgress() && !(await askConfirm('Devam eden oyun kaybolacak. Yeni oyun başlatılsın mı?'))) return;
    startGame();
  }

  /* ---------- Olaylar ---------- */

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

  // Nasıl oynanır: kartın dışındaki karartılmış alana dokununca da kapanır.
  const howto = $('#howto-dialog');
  $('#btn-howto').addEventListener('click', () => howto.showModal());
  howto.addEventListener('click', (e) => {
    if (e.clientX === 0 && e.clientY === 0) return;   // klavyeyle tetiklenen tıklama
    const r = howto.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) howto.close();
  });

  syncSoundButtons();
  renderMenuBest();
  resume();

  /* ---------- Açılış animasyonu ----------
     <html class="intro"> ile başlar (style.css). Animasyon bitince ya da kullanıcı ilk kez
     dokununca/tuşa basınca sınıf kalkar; sonraki ekran geçişleri ve tur yenilemeleri etkilenmez. */
  const root = document.documentElement;
  if (root.classList.contains('intro')) {
    const INTRO_MS = 1600;   // en geç öğe ~1300ms'de biter
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
})();