/* ==========================================================
   Yedi Kart: ses (Web Audio; harici dosya yok)
   Dışarıya yalnızca GameAudio nesnesini açar.
   Ses tercihi storage.js üzerinden saklanır.
   ========================================================== */

import { loadMuted, saveMuted } from './storage.js';

const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  || location.protocol === 'file:';

function reportAudioError(operation, error) {
  if (isDevelopment) console.warn(`[audio] ${operation} başarısız oldu`, error);
}

/* ----------------------------------------------------------
   Yapılandırma
   ----------------------------------------------------------
   sessionType seçenekleri:
     'ambient'        → Diğer seslerle karışır. Müzik ducklanmaz.
                        iOS sessiz modda ÇALMAZ. (Varsayılan)
     'playback'       → Diğer sesleri ducklar. iOS sessiz modda ÇALAR.
                        (Eski davranış)
     'transient'      → Kısa süreli ducking. iOS sessiz modda çalmaz.
     'transient-solo' → Diğer sesleri keser. iOS sessiz modda çalar.

   useSilentLoop: Yalnızca audioSession API YOKSA ve 'playback'
   benzeri davranış gerekiyorsa true yapın. True iken bazı
   platformlarda ducking'e sebep olabilir.
   ---------------------------------------------------------- */
const AUDIO_CONFIG = {
  sessionType: 'ambient',
  useSilentLoop: false,
  volume: 0.9,        // genel ses seviyesi (0-1); sesler yüksek/alçak gelirse buradan ayarla
  brightness: 4200,   // üst frekans sınırı (Hz); düşürürsen sesler yumuşar, artırırsan parlaklaşır
};

export const GameAudio = (() => {
  let muted = loadMuted();
  let audioCtx = null;
  let primed = false;       // iOS: AudioContext tek seferlik boş tamponla "ısıtıldı" mı
  let sessionSet = false;
  let silentEl = null;      // iOS sessiz modunda Web Audio'yu duyurmak için sessiz döngü
  let silentUrl = null;     // Blob URL cache (tek sefer üretilir)
  let master = null;        // ortak ses zinciri (filtre + kompresör), AudioContext başına bir kez kurulur

  /* ---------- Sessiz döngü (yalnızca gerekirse) ---------- */

  function silentWavUrl() {
    if (silentUrl) return silentUrl;
    const rate = 8000, n = 8000;  // 1 sn sessizlik
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    return silentUrl;
  }

  function playSilent() {
    if (!silentEl || muted) return;
    const p = silentEl.play();
    if (p && p.catch) p.catch((e) => reportAudioError('Sessiz döngüyü oynatma', e));
  }

  function pauseSilent() {
    if (silentEl) silentEl.pause();
  }

  function setupSession() {
    if (sessionSet) return;

    // 1) Modern API varsa kullan
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      try {
        navigator.audioSession.type = AUDIO_CONFIG.sessionType;
      } catch (e) { reportAudioError('Ses oturumunu ayarlama', e); }
      sessionSet = true;
      return;
    }

    // 2) Fallback: sessiz döngü (yalnızca opt-in)
    if (AUDIO_CONFIG.useSilentLoop) {
      try {
        silentEl = new Audio(silentWavUrl());
        silentEl.loop = true;
        silentEl.setAttribute('playsinline', '');
        playSilent();
      } catch (e) {
        reportAudioError('Sessiz ses döngüsünü oluşturma', e);
        silentEl = null;
      }
    }
    sessionSet = true;
  }

  /* ---------- AudioContext ---------- */

  function audio() {
    if (muted) return null;
    try {
      if (!audioCtx || audioCtx.state === 'closed') {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
        master = null;
        primed = false;
      }
      if (audioCtx.state !== 'running') {
        const p = audioCtx.resume();
        if (p && p.catch) p.catch((e) => reportAudioError('AudioContext sürdürme', e));
      }
      return audioCtx;
    } catch (e) {
      reportAudioError('AudioContext oluşturma', e);
      return null;
    }
  }

  function withAudio(fn) {
    const c = audio();
    if (!c) return;
    if (c.state === 'running') { fn(c); return; }
    const p = c.resume();
    if (p && p.then) {
      p.then(() => { if (c.state === 'running') fn(c); })
        .catch((e) => reportAudioError('AudioContext sürdürme', e));
    }
  }

  function unlockAudio() {
    if (muted) return;
    setupSession();
    // Sessiz döngü ilk denemede reddedildiyse (autoplay), sonraki her dokunuşta yeniden dene.
    if (silentEl && silentEl.paused) playSilent();

    if (primed) return; // touchend + click çift çağrısına karşı erken çıkış

    const c = audio();
    if (!c) return;
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
      primed = true;
    } catch (e) { reportAudioError('AudioContext hazırlama', e); }
  }

  ['touchend', 'click'].forEach((ev) =>
    document.addEventListener(ev, unlockAudio, { capture: true, passive: true })
  );

  // Sayfa arka plana geçince sessiz döngü de durur (pil ve medya oturumu için).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      primed = false;
      playSilent();
    } else {
      pauseSilent();
    }
  });

  /* ---------- Sesler (v4) ----------
     Marimba/kalimba benzeri yumuşak "pluck" notaları + çok hafif yankı.
     Tiz, cızırtılı ya da bip sesi yok; notalar majör pentatonik gamdan, yani hangisi çalsa uyumlu.
       Kart çevirme : yumuşak ahşap "tok"
       Skor artışı  : kart değeri 2→7 büyüdükçe daha uzun, hızlı ve parlak yükselen gam; 7'de tam fanfar
       Kombo        : seviyeyle uzayan, hızlanan, yükselen ve oktav parıltılı arpej
       0 açılınca   : kalp atışı, inen minör çizgi ve uzun bir çöküş */

  // Ortak zincir: alçak kesme, tiz yumuşatma, kısa yankı (wet) ve hafif kompresör
  function bus(ctx) {
    if (master && master.ctx === ctx) return master.input;
    const input = ctx.createGain();
    input.gain.value = AUDIO_CONFIG.volume;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = AUDIO_CONFIG.brightness; lp.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3;
    comp.attack.value = 0.005; comp.release.value = 0.2;
    input.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    try {
      // Çok kısa sentetik yankı odası (0.35 sn), yalnızca hafif katkı
      const len = Math.floor(ctx.sampleRate * 0.35);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const verb = ctx.createConvolver();
      verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.12;
      lp.connect(verb); verb.connect(wet); wet.connect(comp);
    } catch (e) { reportAudioError('Yankı efektini oluşturma', e); }
    master = { ctx, input };
    return input;
  }

  function env(ctx, out, t, peak, dur, attack = 0.003) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    return g;
  }

  function sine(ctx, g, freq, t, dur, to) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // Marimba benzeri nota: temel ses + hızlı sönen 2x ve 4x harmonikler
  function pluck(ctx, { freq, to, at = 0, dur = 0.25, gain = 0.1 }) {
    const t = ctx.currentTime + at;
    const out = bus(ctx);
    sine(ctx, env(ctx, out, t, gain, dur), freq, t, dur, to);
    sine(ctx, env(ctx, out, t, gain * 0.25, dur * 0.5), freq * 2, t, dur * 0.5, to && to * 2);
    sine(ctx, env(ctx, out, t, gain * 0.2, dur * 0.28), freq * 4, t, dur * 0.28, to && to * 4);
  }

  // Düz sine (harmonik yok): kalp atışı ve çöküş gibi alçak sesler için
  function soft(ctx, { freq, to, at = 0, dur = 0.3, gain = 0.15, attack = 0.01 }) {
    const t = ctx.currentTime + at;
    sine(ctx, env(ctx, bus(ctx), t, gain, dur, attack), freq, t, dur, to);
  }

  // Majör pentatonik (G4'ten): adım 0 = 392 Hz. Negatif adımlar alt oktava iner.
  const PENTA = [0, 2, 4, 7, 9];
  function noteFreq(step) {
    const oct = Math.floor(step / 5);
    return 392 * Math.pow(2, (PENTA[((step % 5) + 5) % 5] + 12 * oct) / 12);
  }

  // Kart çevirme: kısa ve net ahşap "tok"
  function playFlip() {
    withAudio((c) => {
      pluck(c, { freq: 330, to: 220, dur: 0.07, gain: 0.1 });
      pluck(c, { freq: 1320, dur: 0.03, gain: 0.025 });
    });
  }

  // before/after: seçimden önceki ve sonraki skor. busted: 0 açıldı. combo: ardışık aynı sayı sayısı
  // (verilmezse kombo sesi çalmaz). Kartın değeri before/after/combo'dan hesaplanır.
  function playResult(before, after, busted, combo = 0) {
    withAudio((c) => {
      if (busted) { playTragic(c); return; }
      if (after < before) {
        pluck(c, { freq: 349, dur: 0.16, gain: 0.09 });
        pluck(c, { freq: 262, at: 0.08, dur: 0.22, gain: 0.09 });
        return;
      }
      if (after === before) {
        pluck(c, { freq: noteFreq(2), at: 0.01, dur: 0.16, gain: 0.08 });
        return;
      }
      const mult = combo >= 2 ? combo : 1;
      const value = before ? Math.round(after / (before * mult)) : 1;   // seçilen kartın değeri
      if (combo >= 2) playCombo(c, combo, value);
      else playWin(c, value);
    });
  }

  // Kart 2→7: nota sayısı = değer, tempo hızlanır, 5+ finalde parlaklık, 6+ akor, 7'de bas vuruş ve fanfar
  // En uzun ses (7) yaklaşık 0.7 sn.
  function playWin(c, value) {
    if (value < 2) {
      pluck(c, { freq: noteFreq(0), at: 0.01, dur: 0.18, gain: 0.1 });
      pluck(c, { freq: noteFreq(2), at: 0.07, dur: 0.24, gain: 0.1 });
      return;
    }
    const v = Math.min(value, 7);
    const gap = 0.06 - (v - 2) * 0.006;                 // 0.06 ... 0.03 sn
    for (let k = 0; k < v; k++) {
      pluck(c, { freq: noteFreq(k), at: 0.01 + k * gap, dur: 0.22, gain: 0.085 + k * 0.008 });
    }
    const end = 0.01 + v * gap;
    if (v >= 5) pluck(c, { freq: noteFreq(v - 1) * 2, at: end, dur: 0.35, gain: 0.06 });
    if (v >= 6) {
      [v - 1, v - 3, v - 5].forEach((st) => pluck(c, { freq: noteFreq(st), at: end, dur: 0.45, gain: 0.08 }));
    }
    if (v >= 7) {
      pluck(c, { freq: noteFreq(-5), at: 0.01, dur: 0.3, gain: 0.13 });
      [7, 8, 9].forEach((st, i) => pluck(c, { freq: noteFreq(st), at: end + 0.03 + i * 0.03, dur: 0.25, gain: 0.055 }));
    }
  }

  // Kombo: seviye arttıkça 5→7 notalık, hızlanan ve yükselen arpej; 3+ seviyede bas vuruş, oktav parıltısı ve akor
  // Toplam yaklaşık 0.5-0.7 sn.
  function playCombo(c, combo, value) {
    const n = Math.min(combo + 3, 7);
    const start = Math.min(combo - 2, 2);
    const gap = Math.max(0.03, 0.05 - combo * 0.005);
    if (combo >= 3 || value >= 7) pluck(c, { freq: noteFreq(-5), at: 0, dur: 0.3, gain: 0.13 });
    for (let k = 0; k < n; k++) {
      const at = 0.01 + k * gap;
      const f = noteFreq(start + k);
      pluck(c, { freq: f, at, dur: 0.22, gain: 0.09 + k * 0.006 });
      if (combo >= 3) pluck(c, { freq: f * 2, at, dur: 0.14, gain: 0.03 });
    }
    const end = 0.01 + n * gap;
    const top = start + n - 1;
    pluck(c, { freq: noteFreq(top) * 2, at: end, dur: 0.4, gain: 0.06 });
    if (combo >= 3) {
      [top, top - 2, top - 4].forEach((st) => pluck(c, { freq: noteFreq(st), at: end, dur: 0.5, gain: 0.08 }));
    }
    if (value >= 6 || combo >= 4) {
      [7, 8, 9].forEach((st, i) => pluck(c, { freq: noteFreq(st), at: end + 0.03 + i * 0.03, dur: 0.25, gain: 0.055 }));
    }
  }

  // 0 açıldı: iki sert kalp atışı, hızla inen minör çizgi (la-fa-re-la), kısa çöküş. Toplam yaklaşık 1.5 sn.
  function playTragic(c) {
    soft(c, { freq: 90, to: 60, at: 0, dur: 0.12, gain: 0.28, attack: 0.005 });
    soft(c, { freq: 180, to: 120, at: 0, dur: 0.1, gain: 0.1, attack: 0.005 });
    soft(c, { freq: 90, to: 60, at: 0.12, dur: 0.14, gain: 0.22, attack: 0.005 });
    soft(c, { freq: 180, to: 120, at: 0.12, dur: 0.1, gain: 0.08, attack: 0.005 });
    pluck(c, { freq: 440, at: 0.25, dur: 0.4, gain: 0.11 });
    pluck(c, { freq: 349, at: 0.4, dur: 0.4, gain: 0.11 });
    pluck(c, { freq: 294, at: 0.55, dur: 0.45, gain: 0.11 });
    pluck(c, { freq: 220, at: 0.72, dur: 0.8, gain: 0.13 });
    soft(c, { freq: 330, to: 110, at: 0.72, dur: 0.7, gain: 0.04, attack: 0.08 });   // kısa batış
  }

  /* ---------- Dışarıya açılan API ---------- */

  function toggleMute() {
    muted = !muted;
    saveMuted(muted);
    if (muted) {
      pauseSilent();
      // AudioContext'i askıya al: arka planda medya oturumu tutmasın
      if (audioCtx && audioCtx.state === 'running') {
        const p = audioCtx.suspend();
        if (p && p.catch) p.catch((e) => reportAudioError('AudioContext duraklatma', e));
      }
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