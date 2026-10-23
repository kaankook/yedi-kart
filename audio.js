'use strict';

/* ==========================================================
   Yedi Kart: ses (Web Audio; harici dosya yok)
   Dışarıya yalnızca GameAudio nesnesini açar.
   ========================================================== */

const GameAudio = (() => {
  const MUTE_KEY = 'yedikart.muted';

  let muted = loadMuted();
  let audioCtx = null;
  let primed = false;       // iOS: AudioContext tek seferlik boş tamponla "ısıtıldı" mı
  let sessionSet = false;
  let silentEl = null;      // iOS sessiz modunda Web Audio'yu duyurmak için sessiz döngü

  function loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }

  /* ---------- Sessiz döngü (yalnızca navigator.audioSession yoksa) ---------- */

  function silentWavUrl() {
    const rate = 8000, n = 8000;  // 1 sn sessizlik; 0,1 sn'lik döngüden çok daha seyrek yeniden başlar
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

  function playSilent() {
    if (!silentEl || muted) return;
    const p = silentEl.play();
    if (p && p.catch) p.catch(() => {});
  }

  function pauseSilent() {
    if (silentEl) silentEl.pause();
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
      playSilent();
    } catch (e) { silentEl = null; }
  }

  /* ---------- AudioContext ---------- */

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
    // Sessiz döngü ilk denemede reddedildiyse (autoplay), sonraki her dokunuşta yeniden dene.
    if (silentEl && silentEl.paused) playSilent();
    const c = audio();
    if (!c || primed) return;
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
      primed = true;
    } catch (e) { /* devam */ }
  }

  ['touchend', 'click'].forEach((ev) => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));

  // Sayfa arka plana geçince sessiz döngü de durur (pil ve medya oturumu için).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      primed = false;
      playSilent();  // tarayıcı jest istemezse reddedilir; sonraki dokunuşta unlockAudio yeniden dener
    } else {
      pauseSilent();
    }
  });

  /* ---------- Sesler ---------- */

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

  /* ---------- Dışarıya açılan API ---------- */

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* sessiz geç */ }
    if (muted) {
      pauseSilent();
    } else {
      unlockAudio();
      playFlip();
    }
    return muted;
  }

  return {
    isMuted: () => muted,
    toggleMute,
    prepare: audio,   // oyun başlarken AudioContext'i hazırla
    playFlip,
    playResult,
  };
})();
