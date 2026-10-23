'use strict';

/* ==========================================================
   Yedi Kart: oyun mantığı (DOM'dan bağımsız) + arayüz
   Kural: skor 1 ile başlar, seçilen kartın değeriyle çarpılır.
   Aynı sayıyı üst üste seçersen COMBO olur ve çarpan büyür.
   0 açılırsa oyun anında biter; 7 turu tamamlarsan skorun kalır.
   ========================================================== */

const TOTAL_ROUNDS = 7;
const START_SCORE = 1;
const CARD_VALUES = [-1, 0, 1, 2, 3, 4, 5, 6, 7];

/* ---------- Oyun mantığı ---------- */

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
    startScore: START_SCORE,
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

/* ---------- Arayüz ---------- */

if (typeof document !== 'undefined') {
  const $ = (sel) => document.querySelector(sel); const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const HINT_TEXT = 'Bir karta dokun ve şansını dene!';
  const BEST_KEY = 'yedikart.best.mul';
  const SAVE_KEY = 'yedikart.save.v1';
  const MUTE_KEY = 'yedikart.muted';

  // Seçimden sonra zamanlama (ms): diğer kartları göster, sonra hepsini kapat.
  // Kart çevirme süresi tek yerden yönetilir: FLIP_MS, style.css'teki --flip'i ezer.
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
  let countRaf = null;

  // Eski bir index.html kullanılsa bile gerekli DOM elemanlarını otomatik tamamlar.
  function ensureDom() {
    const finalCard = $('#screen-result .score-card.big');
    if (finalCard && !$('#result-breakdown')) {
      const br = document.createElement('span');
      br.id = 'result-breakdown';
      br.className = 'score-breakdown';
      finalCard.appendChild(br);
    }

    const game = $('#screen-game');
    if (game && !$('#combo-banner')) {
      const banner = document.createElement('div');
      banner.id = 'combo-banner';
      banner.className = 'combo-banner';
      banner.setAttribute('aria-live', 'polite');
      game.insertBefore(banner, $('#grid'));
    }
  }

  function clearTimers() {
    clearTimeout(resultTimer);
    clearTimeout(roundTimer);
    clearTimeout(peekTimer);
    cancelAnimationFrame(countRaf);
  }

  function clearFx() {
    $('#screen-game').classList.remove('shake');
    $('#score').classList.remove('bump');
    $('#round-pill').classList.remove('bump');
    const comboBanner = $('#combo-banner');
    if (comboBanner) {
      comboBanner.classList.remove('show');
      comboBanner.textContent = '';
    }
  }

  function showScreen(name) { if (name !== 'game') clearFx(); $$('.screen').forEach((el) => el.classList.toggle('active', el.id === `screen-${name}`));
    document.body.classList.toggle('dark', name === 'gameover');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', name === 'gameover' ? '#1a0b12' : '#fbf8f2');
    window.scrollTo(0, 0);
  }

  function setScore(el, value, animate) {
    el.textContent = fmt(value);
    el.classList.toggle('neg', value < 0);
    if (animate) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  function showCombo(level) {
    const banner = $('#combo-banner');
    if (!banner) return;
    if (level < 2) {
      banner.textContent = '';
      banner.classList.remove('show');
      return;
    }
    banner.textContent = `${level}x COMBO!`;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

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
    const el = $('#menu-best');
    el.textContent = best === null ? '' : `En yüksek skor: ${fmt(best)}`;
  }

  /* ---------- Ses (Web Audio; harici dosya yok) ---------- */

  function loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  let muted = loadMuted();
  let audioCtx = null;

  let primed = false;
  let sessionSet = false;
  let silentEl = null;

  function silentWavUrl() {
    const rate = 8000, n = 800;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function setupSession() {
    if (sessionSet) return;
    sessionSet = true;
    try {
      if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; }
    } catch (e) { /* devam */ }
    try {
      silentEl = new Audio(silentWavUrl());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
      const p = silentEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { silentEl = null; }
  }

  function audio() {
    if (muted) return null;
    try {
      if (!audioCtx || audioCtx.state === 'closed') {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
        primed = false;
      }
      if (audioCtx.state !== 'running') {
        const p = audioCtx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      return audioCtx;
    } catch (e) { return null; }
  }

  function withAudio(fn) {
    const c = audio();
    if (!c) return;
    if (c.state === 'running') { fn(c); return; }
    const p = c.resume();
    if (p && p.then) p.then(() => { if (c.state === 'running') fn(c); }).catch(() => {});
  }

  function unlockAudio() {
    if (muted) return;
    setupSession();
    const c = audio();
    if (!c || primed) return;
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
      primed = true;
    } catch (e) { /* devam */ }
    if (silentEl && silentEl.paused) { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); }
  }
  ['touchend', 'click'].forEach((ev) => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') primed = false;
  });

  function tone(ctx, { freq, to, type = 'sine', at = 0, dur = 0.15, gain = 0.2 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noise(ctx, { at = 0, dur = 0.3, gain = 0.2, freq = 800 }) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
  }

  function playFlip() {
    withAudio((c) => {
      tone(c, { freq: 380, to: 140, type: 'triangle', dur: 0.09, gain: 0.22 });
      noise(c, { dur: 0.05, gain: 0.05, freq: 2500 });
    });
  }

  function playResult(before, after, busted) {
    withAudio((c) => {
      if (busted) {
        tone(c, { freq: 150, to: 28, type: 'sine', dur: 1.0, gain: 0.45 });
        tone(c, { freq: 110, to: 50, type: 'sawtooth', dur: 0.7, gain: 0.12 });
        tone(c, { freq: 98, to: 49, type: 'square', dur: 0.45, gain: 0.06 });
        noise(c, { dur: 0.6, gain: 0.25, freq: 900 });
        return;
      }
      if (after < before) {
        tone(c, { freq: 300, to: 130, type: 'sawtooth', dur: 0.28, gain: 0.1 });
        return;
      }
      const semis = Math.min(24, Math.log2(Math.max(1, after)) * 1.2);
      const f = 392 * Math.pow(2, semis / 12);
      if (after === before) {
        tone(c, { freq: f, type: 'sine', at: 0.02, dur: 0.14, gain: 0.1 });
      } else {
        tone(c, { freq: f, type: 'triangle', at: 0.02, dur: 0.12, gain: 0.16 });
        tone(c, { freq: f * 1.5, type: 'triangle', at: 0.12, dur: 0.2, gain: 0.16 });
      }
    });
  }

  function syncSoundButtons() {
    $$('.sound-btn').forEach((b) => {
      b.textContent = muted ? '🔇' : '🔊';
      b.setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
    });
  }

  function toggleSound() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* sessiz geç */ }
    syncSoundButtons();
    if (muted) { if (silentEl) silentEl.pause(); }
    else { unlockAudio(); playFlip(); }
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
    const grid = $('#grid'); grid.classList.remove('dead'); $$('#grid .card').forEach((btn, i) => {
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

  function startGame() {
    clearTimers();
    clearFx();
    gameSeq++;
    audio();
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
    playFlip();
    setTimeout(() => playResult(scoreBefore, score, busted), 160);

    const peek = (delay) => {
      peekTimer = setTimeout(() => {
        if (gameSeq === seq && state) peekOthers(index);
      }, delay);
    };

    if (state.finished) {
      if (state.busted) {
        $(`#grid .card[data-index="${index}"]`).classList.add('doom');
        $('#grid').classList.add('dead');
        retrigger($('#screen-game'), 'shake');
        retrigger($('#flash'), 'on');
        if (navigator.vibrate) { try { navigator.vibrate([120, 60, 220]); } catch (e) { /* yok say */ } }
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

    const breakdownEl = $('#result-breakdown');
    if (breakdownEl) {
      breakdownEl.textContent = comboLabel(state);
    }

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

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function countTo(el, from, to, delay, duration) {
    cancelAnimationFrame(countRaf);
    el.textContent = fmt(from);
    el.classList.remove('zeroed');
    if (from === to) {
      el.textContent = fmt(to);
      el.classList.toggle('zeroed', to === 0);
      return;
    }
    const t0 = performance.now() + delay;
    const step = (now) => {
      if (now < t0) { countRaf = requestAnimationFrame(step); return; }
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * eased));
      if (p < 1) {
        countRaf = requestAnimationFrame(step);
      } else {
        el.textContent = fmt(to);
        el.classList.add('zeroed');
      }
    };
    countRaf = requestAnimationFrame(step);
  }

  function showGameOver() {
    if (!state || !state.busted) return;

    $('#go-detail').textContent = state.picks.length === 1
      ? 'Daha ilk turda sıfır açıldı...'
      : `${state.picks.length}. turda sıfır açıldı ve elindeki sayı sıfırlandı.`;

    const goComboEl = $('#go-combo');
    if (goComboEl) goComboEl.textContent = comboLabel(state);

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

  ensureDom();

  // Olaylar
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

  syncSoundButtons();
  renderMenuBest();
  resume();
}