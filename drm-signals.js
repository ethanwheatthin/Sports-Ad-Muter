// drm-signals.js
// Non-pixel ad signals for DRM-protected sites (Peacock, ESPN) where the video
// frame can't be read. Two independent heuristics:
//   1. Audio analysis  - EME protects video, not audio. We tap the element's
//      audio via captureStream() and look at loudness / speech-band ratio /
//      temporal variance. Live sport = fluctuating broadband crowd noise with
//      sparse commentary; ad breaks = louder, more consistent, music/VO heavy.
//   2. DOM markers      - player ad UI ("Ad 0:30", ad-break containers, skip
//      buttons). Per-site selector lists, easy to extend.
//
// Everything here is best-effort and clearly labelled as heuristic. The vision
// pipeline (tab capture) remains the primary signal when available.

(function () {
  const LOG = '[SAM Signals]';
  const host = location.hostname;

  const SITE = {
    isPeacock: host.includes('peacocktv.com'),
    isESPN: host.includes('espn.com'),
    isNBC: host.includes('nbc.com')
  };

  // ---- DOM ad markers ------------------------------------------------------
  // Selectors that, when present/visible, strongly indicate an ad break.
  const DOM_RULES = {
    peacock: [
      '[data-testid="ad-break-tracker"]',
      '[data-testid="ad-countdown"]',
      '[class*="AdBreak"]',
      '[class*="ad-break"]',
      '[class*="AdCountdown"]',
      '.ad-timer',
      '[aria-label*="advertisement" i]'
    ],
    espn: [
      '.ad-plugin',
      '[class*="AdBreak"]',
      '[class*="ad-break"]',
      '[id*="ad-countdown"]',
      '.vjs-overlay-ad',
      '[class*="AdOverlay"]',
      '[aria-label*="advertisement" i]'
    ],
    generic: [
      '.video-ads',
      '.ytp-ad-player-overlay',
      '[class*="adCountdown" i]'
    ]
  };

  // Text near the player that looks like an ad countdown, e.g. "Ad · 0:15",
  // "Advertisement 0:30", "Ad 1 of 2".
  const AD_TEXT_RE = /\b(ad|advertisement)\b[^.]{0,20}(\d+\s*(:|of)\s*\d+|\d+\s*sec)/i;

  function domAdSignal() {
    let rules = DOM_RULES.generic.slice();
    if (SITE.isPeacock) rules = rules.concat(DOM_RULES.peacock);
    if (SITE.isESPN) rules = rules.concat(DOM_RULES.espn);

    const matched = [];
    for (const sel of rules) {
      let els;
      try { els = document.querySelectorAll(sel); } catch (e) { continue; }
      for (const el of els) {
        if (isVisible(el)) { matched.push(sel); break; }
      }
    }

    // Text scan limited to likely player containers to keep it cheap.
    let textHit = null;
    const containers = document.querySelectorAll(
      '[class*="player" i],[class*="Player" i],[data-testid*="player" i],[id*="player" i]'
    );
    for (const c of containers) {
      const t = (c.textContent || '').slice(0, 400);
      if (AD_TEXT_RE.test(t)) { textHit = t.match(AD_TEXT_RE)[0]; break; }
    }

    const likelyAd = matched.length > 0 || !!textHit;
    return {
      available: containers.length > 0 || matched.length > 0,
      likelyAd,
      matched,
      textHit
    };
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.05;
  }

  // ---- Audio analysis ---------------------------------------------------
  let audioCtx = null;
  let analyser = null;
  let srcNode = null;
  let mediaStream = null;
  let rafId = null;
  let boundVideo = null;

  const HISTORY = 60; // ~ last 60 samples
  const energyHist = [];
  const speechHist = [];
  let freqBuf = null;

  function startAudio(video) {
    if (!video || video === boundVideo) return;
    stopAudio();
    boundVideo = video;

    try {
      const cs = video.captureStream ? video.captureStream()
        : (video.mozCaptureStream ? video.mozCaptureStream() : null);
      if (!cs || cs.getAudioTracks().length === 0) {
        console.log(LOG, 'no audio track from captureStream - audio heuristic disabled');
        return;
      }
      mediaStream = cs;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      srcNode = audioCtx.createMediaStreamSource(cs);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      srcNode.connect(analyser); // analysis only, not routed to destination
      freqBuf = new Uint8Array(analyser.frequencyBinCount);
      console.log(LOG, 'audio analyser started');
      sample();
    } catch (e) {
      console.log(LOG, 'audio analyser unavailable:', e.message);
      stopAudio();
    }
  }

  function sample() {
    if (!analyser) return;
    analyser.getByteFrequencyData(freqBuf);

    const nyquist = (audioCtx.sampleRate || 48000) / 2;
    const binHz = nyquist / freqBuf.length;
    let total = 0, speech = 0;
    for (let i = 0; i < freqBuf.length; i++) {
      const v = freqBuf[i];
      total += v;
      const hz = i * binHz;
      if (hz >= 300 && hz <= 3400) speech += v;
    }
    const energy = total / freqBuf.length / 255;         // 0..1
    const speechRatio = total > 0 ? speech / total : 0;   // 0..1

    push(energyHist, energy);
    push(speechHist, speechRatio);

    rafId = setTimeout(sample, 250);
  }

  function push(arr, v) {
    arr.push(v);
    if (arr.length > HISTORY) arr.shift();
  }

  function stopAudio() {
    if (rafId) { clearTimeout(rafId); rafId = null; }
    try { srcNode && srcNode.disconnect(); } catch (e) {}
    try { analyser && analyser.disconnect(); } catch (e) {}
    try { audioCtx && audioCtx.close(); } catch (e) {}
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    audioCtx = analyser = srcNode = mediaStream = null;
    boundVideo = null;
    energyHist.length = 0;
    speechHist.length = 0;
  }

  function audioAdSignal() {
    if (energyHist.length < 8) return { available: false };
    const meanE = mean(energyHist);
    const varE = variance(energyHist);
    const meanSpeech = mean(speechHist);

    // Heuristic scoring: ads tend to be loud + steady + music/VO heavy.
    let score = 0;
    if (meanE > 0.28) score += 0.35;          // loud
    if (varE < 0.0015) score += 0.30;         // steady (not crowd swell)
    if (meanSpeech > 0.55) score += 0.20;     // energy concentrated in VO band
    if (meanE > 0.4 && varE < 0.002) score += 0.15;

    return {
      available: true,
      adLikelihood: +Math.min(1, score).toFixed(2),
      meanEnergy: +meanE.toFixed(3),
      energyVariance: +varE.toFixed(5),
      speechRatio: +meanSpeech.toFixed(2)
    };
  }

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const variance = (a) => {
    const m = mean(a);
    return a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length;
  };

  // ---- Public API ------------------------------------------------------
  window.__samSignals = {
    start(video) { startAudio(video); },
    stop() { stopAudio(); },
    read() {
      const dom = domAdSignal();
      const audio = audioAdSignal();

      // Combine: DOM markers are high-confidence; audio is a soft prior.
      let likelyAd = null;
      let confidence = 0;
      let source = 'none';
      if (dom.likelyAd) {
        likelyAd = true; confidence = 0.9; source = 'dom';
      } else if (audio.available && audio.adLikelihood >= 0.6) {
        likelyAd = true; confidence = audio.adLikelihood * 0.7; source = 'audio';
      } else if (audio.available && audio.adLikelihood <= 0.25) {
        likelyAd = false; confidence = 0.5; source = 'audio';
      } else if (dom.available) {
        likelyAd = false; confidence = 0.4; source = 'dom';
      }

      return { dom, audio, combined: { likelyAd, confidence: +confidence.toFixed(2), source } };
    }
  };

  console.log(LOG, 'loaded for', host, SITE);
})();
