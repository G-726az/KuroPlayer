/* Reproductor: un único <video> dentro de #shell que se acopla a la vista, pasa a mini o a pantalla completa. */
const Player = (() => {
  const shell = $('#shell');
  const stage = $('#stage');
  const video = $('#video');
  const glCanvas = $('#gl-canvas');
  const slot = $('#stage-slot');
  const glow = $('#shell-glow');
  const glowCtx = $('#glow-canvas').getContext('2d', { willReadFrequently: false });
  const subsEl = $('#subs');
  const osdEl = $('#osd');
  const centerIcon = $('#center-icon');

  const gl = new ColorGL(glCanvas, video);
  const S = {
    series: null, ep: null, mode: 'hidden', subs: [], subIdx: -1, subDelay: 0, subName: '',
    useGL: gl.ok, lastSaved: 0, nextTimer: null, nextLeft: 0, dockRaf: 0, idleTimer: 0, clickTimer: 0,
    lastGlow: 0, rvfcActive: false, lastFrame: 0, pinned: false, errored: false, resumeAt: 0,
  };

  // ------------------------------------------------------------ utilidades UI
  function icon(el, id) { el.querySelector('use').setAttribute('href', '#' + id); }
  let osdTimer = 0;
  function osd(html) {
    osdEl.innerHTML = html;
    osdEl.classList.add('show');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => osdEl.classList.remove('show'), 1100);
  }
  function pulse(id) {
    centerIcon.innerHTML = `<svg class="i"><use href="#${id}"/></svg>`;
    centerIcon.classList.remove('pulse');
    void centerIcon.offsetWidth;
    centerIcon.classList.add('pulse');
  }

  // ------------------------------------------------------------ modos del shell
  function rectOfSlot() { const r = slot.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
  function rectMini() { const w = 420, h = 236; return { left: innerWidth - w - 24, top: innerHeight - h - 24, width: w, height: h }; }
  const glowWrap = $('#glow-wrap');
  function applyRect(r) {
    shell.style.left = r.left + 'px'; shell.style.top = r.top + 'px';
    shell.style.width = r.width + 'px'; shell.style.height = r.height + 'px';
    glowWrap.style.left = r.left + 'px'; glowWrap.style.top = r.top + 'px';
    glowWrap.style.width = r.width + 'px'; glowWrap.style.height = r.height + 'px';
  }
  function setMode(mode) {
    if (mode === S.mode) return;
    const prev = S.mode;
    S.mode = mode;
    shell.classList.toggle('hidden', mode === 'hidden');
    shell.classList.toggle('mini', mode === 'mini');
    if (mode === 'hidden') { cancelAnimationFrame(S.dockRaf); return; }
    if (prev !== 'hidden') {
      shell.classList.add('anim');
      setTimeout(() => shell.classList.remove('anim'), 420);
    }
    if (mode === 'mini') { cancelAnimationFrame(S.dockRaf); applyRect(rectMini()); closePopups(); }
    if (mode === 'docked') { applyRect(rectOfSlot()); dockLoop(); }
    updateGlowVisibility();
  }
  function dockLoop() {
    cancelAnimationFrame(S.dockRaf);
    let last = '';
    const tick = () => {
      if (S.mode !== 'docked') return;
      if (!shell.classList.contains('anim') && !document.fullscreenElement) {
        const r = rectOfSlot();
        const key = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
        if (key !== last) { last = key; applyRect(r); }
      }
      S.dockRaf = requestAnimationFrame(tick);
    };
    S.dockRaf = requestAnimationFrame(tick);
  }
  addEventListener('resize', () => { if (S.mode === 'mini') applyRect(rectMini()); });

  function updateGlowVisibility() {
    glow.classList.toggle('on', S.mode === 'docked' && App.settings.ambient !== false && (S.glow == null ? 0.5 : S.glow) > 0 && !!S.ep);
  }
  // luz ambiental: 0 = apagada, 1 = máxima (tamaño + intensidad + difuminado)
  function applyGlow(v, show) {
    v = clamp(Math.round(v * 100) / 100, 0, 1);
    S.glow = v;
    glowWrap.style.setProperty('--glow-inset', -(3 + v * 18) + '%');
    glowWrap.style.setProperty('--glow-op', v <= 0 ? 0 : Math.min(1, 0.3 + v * 0.8));
    glowWrap.style.setProperty('--glow-blur', Math.round(30 + v * 80) + 'px');
    const r = $('#c-glow-r');
    r.value = v; setRangeFill(r);
    $('#glow-num').textContent = Math.round(v * 100);
    $('#c-glow').classList.toggle('on', v > 0 && App.settings.ambient !== false);
    updateGlowVisibility();
    if (show) osd(`<svg class="i"><use href="#i-glow"/></svg>Luz ambiental <div class="meter"><i style="width:${v * 100}%"></i></div> ${Math.round(v * 100)}%`);
  }
  function setGlow(v, show) {
    if (v > 0 && App.settings.ambient === false) App.saveSettings({ ambient: true });
    applyGlow(v, show);
    if (v > 0) S.lastGlowOn = v;
    App.saveSettings({ glowLevel: S.glow });
    S.lastGlow = 0;
    if (video.paused) renderFrame(); // pinta el brillo aunque el video esté en pausa
  }

  // ------------------------------------------------------------ modo compatible (FFmpeg convierte al vuelo)
  // En ese modo el <video> recibe un flujo que empieza en M.offset, así que el tiempo real = offset + currentTime.
  const M = { info: null, stream: false, offset: 0, dur: 0, audio: null, forceVideo: false, seq: 0, label: '', seekTimer: 0, pending: null, retried: false };
  function curT() { return M.stream ? M.offset + (video.currentTime || 0) : (video.currentTime || 0); }
  function durT() {
    if (M.stream) return M.dur;
    if (isFinite(video.duration) && video.duration > 0) return video.duration;
    return (M.info && M.info.duration) || 0;
  }
  function seekTo(t, immediate) {
    DIAG.seekStart = performance.now();
    const d = durT();
    t = clamp(t, 0, d ? Math.max(0, d - 0.3) : t);
    // todavía se está preparando el video: el salto se guarda y se aplica en cuanto esté listo
    if (M.loading) { M.pendingSeek = t; M.virtualT = t; S.resumeAt = 0; updateTime(); return; }
    if (!M.stream) { video.currentTime = t; return; }
    // en modo compatible cada salto reinicia la conversión: se agrupan los saltos seguidos
    M.pending = t;
    M.virtualT = t;
    updateTime();
    clearTimeout(M.seekTimer);
    M.seekTimer = setTimeout(() => { const x = M.pending; M.pending = null; startStream(x, !video.paused || S.wantPlay); }, immediate ? 0 : 380);
  }
  async function startStream(t, play) {
    const seq = ++M.seq;
    stage.classList.add('loading');
    S.wantPlay = play;
    let r;
    try {
      r = await window.cinema.mediaStream(S.ep.path, { t, audio: M.audio, forceVideo: M.forceVideo });
    } catch (e) {
      if (seq === M.seq) showError('No se pudo convertir el archivo: ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      return;
    }
    if (seq !== M.seq) return;
    M.stream = true;
    M.offset = r.offset;
    M.dur = r.duration || M.dur;
    M.label = r.label;
    M.virtualT = null;
    video.src = r.url;
    video.load();
    if (play !== false) video.play().catch(() => {});
    updateModeBadge();
  }
  function updateModeBadge() {
    const b = $('#mode-badge');
    if (!b) return;
    b.hidden = !M.stream;
    b.textContent = M.stream ? 'Modo compatible' : '';
    b.title = M.stream ? `FFmpeg convierte este archivo al vuelo: ${M.label}${M.info && M.info.plan.reasons.length ? ' (' + M.info.plan.reasons.join(', ') + ')' : ''}` : '';
  }

  // ------------------------------------------------------------ carga de episodios
  async function load(series, ep, opts = {}) {
    saveProgress(true);
    hideNextCard();
    $('#error-box').hidden = true;
    S.errored = false;
    // una lista de reproducción (p. ej. Favoritos) junta videos de varias carpetas: anterior/siguiente siguen esa lista
    S.playlist = opts.playlist || (opts.keepPlaylist ? S.playlist : null);
    S.series = series;
    S.ep = ep;
    stage.classList.add('loading');
    applyColorForSeries();
    hideResumeCard();
    const prog = App.getProgress(ep.path);
    let start = opts.startAt != null ? opts.startAt : 0;
    if (opts.startAt == null && prog && !prog.w && prog.t > 10 && (!prog.d || prog.t < prog.d - 15)) start = prog.t;
    S.resumeAt = start;
    // pregunta si continuar o empezar de cero (se queda en pausa en el punto guardado mientras tanto)
    const ask = start > 0 && opts.startAt == null && opts.autoplay !== false && App.settings.askResume !== false;
    if (ask) opts = { ...opts, autoplay: false };
    S.askResume = ask ? { t: start, d: (prog && prog.d) || 0 } : null;
    const seq = ++M.seq;
    M.info = null; M.stream = false; M.offset = 0; M.dur = 0; M.audio = null; M.forceVideo = false; M.label = ''; M.retried = false; M.virtualT = null;
    M.loading = true; M.pendingSeek = null;
    clearTimeout(M.seekTimer);
    window.cinema.mediaStop();
    updateModeBadge();
    let info = null;
    try { info = await window.cinema.mediaProbe(ep.path); } catch (e) { /* sin análisis: se intenta directo */ }
    if (seq !== M.seq) return;
    if (info && info.duration) M.dur = info.duration;
    M.info = info;
    M.dur = (info && info.duration) || 0;
    if (info) M.audio = info.plan.audio;
    if (info && info.plan.mode === 'stream') {
      previewVideo.removeAttribute('src');
      S.resumeAt = 0;
      if (start > 0 && !ask) osd(`<svg class="i"><use href="#i-refresh"/></svg>Continuando desde ${fmtTime(start)}`);
      M.seq--; // startStream incrementa el contador
      M.loading = false;
      const pend = M.pendingSeek; M.pendingSeek = null;
      await startStream(pend != null ? pend : start, opts.autoplay !== false);
    } else {
      M.loading = false;
      const pend = M.pendingSeek; M.pendingSeek = null;
      if (pend != null) { S.resumeAt = pend; M.virtualT = null; }
      video.src = ep.url;
      pvReady = false; // la vista previa de la barra se carga solo al pasar el ratón
      video.load();
    }
    video.playbackRate = video.playbackRate || 1;
    loadSubsFor(ep);
    $('#ctl-series').textContent = series.title;
    $('#ctl-ep').textContent = epLabel(ep) + (ep.num != null ? ' · ' + ep.title : '');
    buildAudioMenu();
    if (opts.autoplay !== false && !M.stream) {
      video.play().catch(() => {});
    }
    App.onEpisodeChange(series, ep);
    updateNavButtons();
    updateGlowVisibility();
    if (ask && S.ep === ep && S.askResume) showResumeCard(start, S.askResume.d || M.dur);
    loadSkips(series, ep);
  }

  // ------------------------------------------------------------ saltar opening / ending
  const SKIP_NAMES = { op: 'Saltar opening', 'mixed-op': 'Saltar opening', ed: 'Saltar ending', 'mixed-ed': 'Saltar ending', recap: 'Saltar resumen' };
  let skipShown = null;
  async function loadSkips(series, ep) {
    S.skips = []; S.skipDone = new Set(); hideSkip();
    if (App.settings.skipMode === 'off') return;
    const list = [];
    const man = (series.skip || {});
    const dur = () => durT() || (M.info && M.info.duration) || 0;
    if (man.opStart != null && man.opEnd != null) list.push({ type: 'op', start: man.opStart, end: man.opEnd, src: 'manual' });
    if (man.edStart != null && man.edEnd != null) list.push({ type: 'ed', fromEnd: true, start: man.edStart, end: man.edEnd, src: 'manual' });
    const malId = series.web && (series.web.malId || (series.web.source === 'MyAnimeList' ? series.web.id : null));
    if (malId && ep.num != null && App.settings.aniskip !== false) {
      try {
        const res = await window.cinema.skipTimes(malId, ep.num, Math.round(dur()));
        if (S.ep !== ep) return;
        for (const r of res) {
          const t = r.type === 'mixed-op' ? 'op' : r.type === 'mixed-ed' ? 'ed' : r.type;
          if (list.some((x) => x.type === t && x.src === 'manual')) continue;
          // el ending se mide desde el final: se corrige si el archivo dura distinto
          if (t === 'ed' && r.len) list.push({ type: t, fromEnd: true, start: r.start - r.len, end: r.end - r.len, src: 'AniSkip' });
          else list.push({ type: t, start: r.start, end: r.end, src: 'AniSkip' });
        }
      } catch (e) { /* sin conexión */ }
    }
    if (S.ep === ep) S.skips = list;
  }
  function skipRange(x) {
    const d = durT();
    return x.fromEnd ? { start: d + x.start, end: Math.min(d, d + x.end) } : { start: x.start, end: x.end };
  }
  function checkSkip() {
    if (!S.skips || !S.skips.length || M.virtualT != null) { hideSkip(); return; }
    const t = curT();
    const hit = S.skips.find((x) => { const r = skipRange(x); return t >= r.start && t < r.end - 0.8; });
    if (!hit) { hideSkip(); return; }
    const r = skipRange(hit);
    const key = hit.type + hit.start;
    const nearEnd = r.end > durT() - 25;
    const { next } = neighbours();
    if (App.settings.skipMode === 'auto' && !S.skipDone.has(key)) {
      S.skipDone.add(key);
      if (hit.type === 'ed' && nearEnd && next && App.settings.autoNext) { osd('Ending saltado'); saveProgress(true, true); loadIn(next, { startAt: 0 }); return; }
      seekTo(r.end, true);
      osd(`<svg class="i"><use href="#i-next"/></svg>${SKIP_NAMES[hit.type].replace('Saltar ', '')} saltado`);
      return;
    }
    const btn = $('#skip-btn');
    const label = hit.type === 'ed' && nearEnd && next ? 'Siguiente capítulo' : SKIP_NAMES[hit.type] || 'Saltar';
    if (skipShown !== key) { skipShown = key; btn.hidden = false; $('#skip-label').textContent = label; btn.title = `${label} (tecla Intro · fuente: ${hit.src})`; }
    btn.style.setProperty('--skip-p', Math.round(((t - r.start) / Math.max(1, r.end - r.start)) * 100) + '%');
    btn.onclick = (e) => {
      e.stopPropagation();
      hideSkip();
      S.skipDone.add(key);
      if (label === 'Siguiente capítulo') { saveProgress(true, true); loadIn(next, { startAt: 0 }); return; }
      seekTo(r.end, true);
    };
  }
  function hideSkip() { skipShown = null; const b = $('#skip-btn'); if (b) b.hidden = true; }
  for (const ev of ['click', 'dblclick', 'mousedown']) $('#skip-btn').addEventListener(ev, (e) => e.stopPropagation());
  // marcas manuales: valen para todos los capítulos de la serie (el ending se guarda relativo al final)
  function markSkip(kind) {
    if (!S.series) return;
    const t = Math.round(curT() * 10) / 10, d = durT();
    const sk = { ...(S.series.skip || {}) };
    if (kind === 'opStart') sk.opStart = t;
    if (kind === 'opEnd') sk.opEnd = t;
    if (kind === 'edStart') sk.edStart = Math.round((t - d) * 10) / 10;
    if (kind === 'edEnd') sk.edEnd = Math.round((t - d) * 10) / 10;
    if (kind === 'clear') { delete sk.opStart; delete sk.opEnd; delete sk.edStart; delete sk.edEnd; }
    if (sk.opStart != null && sk.opEnd != null && sk.opEnd < sk.opStart) [sk.opStart, sk.opEnd] = [sk.opEnd, sk.opStart];
    if (sk.edStart != null && sk.edEnd != null && sk.edEnd < sk.edStart) [sk.edStart, sk.edEnd] = [sk.edEnd, sk.edStart];
    S.series.skip = sk;
    window.cinema.setMeta(S.series.id, { skip: sk });
    loadSkips(S.series, S.ep);
    const msg = { opStart: 'Inicio del opening marcado', opEnd: 'Fin del opening marcado', edStart: 'Inicio del ending marcado', edEnd: 'Fin del ending marcado', clear: 'Marcas borradas' }[kind];
    osd(msg + (kind !== 'clear' ? ' · ' + fmtTime(t) : ''));
    if ((kind === 'opStart' && sk.opEnd == null) || (kind === 'edStart' && sk.edEnd == null)) toast('Ahora ve al final del ' + (kind === 'opStart' ? 'opening' : 'ending') + ' y marca «fin» (clic derecho sobre el video)', 4500);
    else if (kind === 'opEnd' || kind === 'edEnd') toast('Listo: se aplicará en todos los capítulos de «' + esc(S.series.title) + '»', 4000);
  }

  // ------------------------------------------------------------ ¿continuar o empezar de cero?
  const RESUME_SECS = 5;
  let resumeTimer = null, resumeEnd = 0;
  function showResumeCard(t, d) {
    const card = $('#resume-card');
    $('#resume-info').textContent = `Te quedaste en ${fmtTime(t)}${d ? ` de ${fmtTime(d)}` : ''}`;
    card.hidden = false;
    card.classList.remove('go'); void card.offsetWidth; card.classList.add('go');
    resumeEnd = Date.now() + RESUME_SECS * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((resumeEnd - Date.now()) / 1000));
      $('#resume-count').textContent = left;
      if (left <= 0) resumeChoice(true);
    };
    tick();
    clearInterval(resumeTimer);
    resumeTimer = setInterval(tick, 200);
  }
  function hideResumeCard() {
    clearInterval(resumeTimer); resumeTimer = null;
    const card = $('#resume-card');
    if (card) card.hidden = true;
    S.askResume = null;
  }
  function resumeChoice(cont) {
    if (!S.askResume) return;
    hideResumeCard();
    if (cont) {
      osd(`<svg class="i"><use href="#i-refresh"/></svg>Continuando desde ${fmtTime(curT())}`);
    } else {
      S.resumeAt = 0;
      seekTo(0, true);
      osd('<svg class="i"><use href="#i-prev"/></svg>Desde el inicio');
    }
    video.play().catch(() => {});
  }
  // los clics del cuadro no deben llegar al video (un clic en el video pausa / doble clic = pantalla completa)
  for (const ev of ['click', 'dblclick', 'mousedown', 'pointerdown']) $('#resume-card').addEventListener(ev, (e) => e.stopPropagation());
  $('#resume-go').onclick = () => resumeChoice(true);
  $('#resume-restart').onclick = () => resumeChoice(false);
  // si el usuario pulsa reproducir por su cuenta, se toma como «continuar»
  video.addEventListener('play', () => { if (S.askResume && resumeTimer) hideResumeCard(); });

  // deja listo el siguiente capítulo: análisis en caché y el inicio del archivo leído del disco
  function prefetchNext() {
    const { next } = neighbours();
    if (!next || App.settings.prefetch === false) return;
    window.cinema.mediaProbe(next.path).catch(() => {});
    fetch(next.url, { headers: { Range: 'bytes=0-6291455' } }).then((r) => r.arrayBuffer()).catch(() => {});
  }

  // ------------------------------------------------------------ panel de diagnóstico (Shift + D)
  const DIAG = { on: false, timer: 0, seekStart: 0, lastSeek: null };
  function toggleDiag(force) {
    DIAG.on = force != null ? force : !DIAG.on;
    let el = $('#diag');
    if (!DIAG.on) { if (el) el.remove(); clearInterval(DIAG.timer); return; }
    if (!el) { el = document.createElement('div'); el.id = 'diag'; el.className = 'diag glass'; stage.appendChild(el); }
    const draw = () => {
      if (!S.ep) return;
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
      let ahead = 0;
      for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime + 0.5) ahead = Math.max(ahead, video.buffered.end(i) - video.currentTime);
      const v = M.info && M.info.video, a = M.info && M.info.audios.find((x) => x.index === M.audio);
      el.innerHTML = `<b>Diagnóstico</b><span class="x">Shift+D</span>
        <div><i>Modo</i>${M.stream ? 'Compatible (FFmpeg)' : 'Directo'}</div>
        ${M.stream ? `<div><i>Conversión</i>${esc(M.label || '—')}</div>` : ''}
        <div><i>Video</i>${v ? `${esc(v.codec.toUpperCase())} ${v.width}×${v.height}${/10/.test(v.pix) ? ' 10 bits' : ''}` : '—'}</div>
        <div><i>Audio</i>${a ? `${esc(a.codec.toUpperCase())} ${a.channels}ch` : '—'}</div>
        <div><i>Contenedor</i>${esc(((M.info && M.info.container) || '').split(',')[0].toUpperCase() || S.ep.ext.toUpperCase())}</div>
        <div><i>Búfer adelante</i>${ahead.toFixed(1)} s</div>
        <div><i>Cuadros perdidos</i>${q ? `${q.droppedVideoFrames} de ${q.totalVideoFrames}` : '—'}</div>
        <div><i>Último salto</i>${DIAG.lastSeek != null ? DIAG.lastSeek + ' ms' : '—'}</div>
        <div><i>Color GPU</i>${S.useGL ? (App.settings.enhance && App.settings.enhance !== 'off' ? 'WebGL + mejora' : 'WebGL') : 'CSS'}</div>
        <div><i>Archivo</i>${fmtSize(S.ep.size)}</div>`;
    };
    draw();
    clearInterval(DIAG.timer);
    DIAG.timer = setInterval(draw, 500);
  }

  function updateNavButtons() {
    const { prev, next } = neighbours();
    $('#c-prev').disabled = !prev;
    $('#c-next').disabled = !next;
    $('#pl-prev').disabled = !prev;
    $('#pl-next').disabled = !next;
  }
  // carga otro video de la lista actual (la carpeta, o la lista de reproducción si hay una)
  function loadIn(ep, opts = {}) {
    return load(S.playlist ? S.playlist.ownerOf(ep) : S.series, ep, { ...opts, keepPlaylist: true });
  }
  function neighbours() {
    if (!S.series || !S.ep) return {};
    const list = (S.playlist || S.series).episodes;
    const i = list.findIndex((e) => e.id === S.ep.id);
    return { prev: list[i - 1] || null, next: list[i + 1] || null };
  }
  function playNext() { const { next } = neighbours(); if (next) loadIn(next, { startAt: 0 }); else toast('No hay más capítulos'); }
  function playPrev() {
    if (curT() > 5) { seekTo(0, true); return; }
    const { prev } = neighbours(); if (prev) loadIn(prev, { startAt: 0 });
  }

  // ------------------------------------------------------------ eventos del video
  video.addEventListener('loadedmetadata', () => {
    if (!M.stream && S.resumeAt > 0 && S.resumeAt < video.duration - 3) {
      video.currentTime = S.resumeAt;
      if (!S.askResume) osd(`<svg class="i"><use href="#i-refresh"/></svg>Continuando desde ${fmtTime(S.resumeAt)}`);
    }
    S.resumeAt = 0;
    $('#t-dur').textContent = fmtTime(durT());
    buildAudioMenu();
    if (!video.videoWidth && M.info && M.info.video) {
      const seqNow = M.seq;
      setTimeout(() => {
        if (seqNow !== M.seq || video.videoWidth || !S.ep) return;
        fallbackToStream('el video no se decodifica en el modo directo');
      }, 1500);
    }
  });
  // si el modo directo falla, se reintenta automáticamente convirtiendo con FFmpeg
  function fallbackToStream(reason) {
    if (M.retried || !S.ep) return false;
    M.retried = true;
    M.forceVideo = true;
    const t = curT();
    $('#error-box').hidden = true;
    S.errored = false;
    toast('Cambiando a modo compatible (' + reason + ')', 3500);
    previewVideo.removeAttribute('src');
    startStream(t, true);
    return true;
  }
  video.addEventListener('loadeddata', () => { stage.classList.remove('loading'); renderFrame(); });
  const seekDone = () => { if (DIAG.seekStart) { DIAG.lastSeek = Math.round(performance.now() - DIAG.seekStart); DIAG.seekStart = 0; } };
  video.addEventListener('playing', seekDone);
  video.addEventListener('seeked', () => { if (video.readyState >= 3) seekDone(); });
  video.addEventListener('waiting', () => stage.classList.add('loading'));
  video.addEventListener('playing', () => stage.classList.remove('loading'));
  video.addEventListener('canplay', () => stage.classList.remove('loading'));
  video.addEventListener('seeked', renderFrame);
  video.addEventListener('play', () => { updatePlayIcons(); kickIdle(); document.body.classList.remove('paused'); document.body.classList.add('playing'); });
  video.addEventListener('pause', () => { updatePlayIcons(); saveProgress(true); shell.classList.remove('idle'); document.body.classList.add('paused'); document.body.classList.remove('playing'); });
  video.addEventListener('timeupdate', () => {
    updateTime();
    if (Date.now() - S.lastSaved > 4000) saveProgress();
    checkSkip();
    const left = durT() - curT();
    if (left > 0 && left < 60 && S.ep && S.prefetchedFor !== S.ep.id) { S.prefetchedFor = S.ep.id; prefetchNext(); }
    const d = video.duration;
    if (App.settings.autoNext && d && d - video.currentTime < 0.6 && !video.paused) { /* ended se encarga */ }
  });
  video.addEventListener('progress', updateBuffer);
  video.addEventListener('ended', () => {
    saveProgress(true, true);
    const { next } = neighbours();
    if (next && App.settings.autoNext) showNextCard(next);
  });
  video.addEventListener('error', () => {
    if (!S.ep || !video.getAttribute('src')) return;
    if (!M.stream && fallbackToStream('formato no soportado directamente')) return;
    if (M.stream && !M.forceVideo && !M.retried) { M.retried = true; M.forceVideo = true; startStream(curT(), true); return; }
    const err = video.error;
    const map = { 1: 'La carga fue cancelada.', 2: 'Error de lectura del archivo.', 3: 'El archivo está dañado o usa un códec no compatible.', 4: 'Formato o códec no compatible con el reproductor integrado.' };
    showError((err && map[err.code]) || 'Error desconocido.');
  });
  video.addEventListener('volumechange', () => {
    const vol = $('#c-vol');
    vol.value = video.volume;
    setRangeFill(vol);
    $('#vol-num').textContent = Math.round(video.volume * 100);
    icon($('#c-mute'), video.muted || video.volume === 0 ? 'i-mute' : video.volume < 0.5 ? 'i-vol-low' : 'i-vol');
    App.saveSettings({ volume: video.volume, muted: video.muted });
  });
  video.addEventListener('ratechange', () => { $('#speed-label').textContent = fmtRate(video.playbackRate); });

  function showError(msg) {
    S.errored = true;
    stage.classList.remove('loading');
    $('#error-text').textContent = msg + ' (' + (S.ep ? S.ep.ext.toUpperCase() : '') + ')';
    $('#error-box').hidden = false;
    $('#err-potplayer').hidden = !App.enabledPlayers().length;
  }

  function updatePlayIcons() {
    const id = video.paused ? 'i-play' : 'i-pause';
    icon($('#c-play'), id);
    icon($('#m-play'), id);
    App.onPlayState(!video.paused);
  }
  function updateTime() {
    const d = durT(), t = M.virtualT != null ? M.virtualT : curT();
    $('#t-cur').textContent = fmtTime(t);
    if (!dragging) {
      const p = d ? (t / d) * 100 : 0;
      $('#prog-fill').style.width = p + '%';
      $('#prog-knob').style.left = p + '%';
    }
    $('#mini-fill').style.width = (d ? (t / d) * 100 : 0) + '%';
  }
  function updateBuffer() {
    const d = durT(); if (!d) return;
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime + 1) end = Math.max(end, video.buffered.end(i));
    }
    $('#prog-buf').style.width = Math.min(100, ((end + (M.stream ? M.offset : 0)) / d) * 100) + '%';
  }

  // ------------------------------------------------------------ progreso
  function saveProgress(force, ended) {
    const dur = durT();
    if (!S.ep || !dur || !isFinite(dur) || M.virtualT != null) return;
    const t = ended ? dur : curT();
    if (!force && t < 3) return;
    const prev = App.getProgress(S.ep.path) || {};
    const watched = ended || prev.w || t / dur > 0.9;
    App.setProgress(S.ep.path, { t: Math.round(t * 10) / 10, d: Math.round(dur), w: !!watched, ts: Date.now(), s: S.series.id });
    S.lastSaved = Date.now();
  }

  // ------------------------------------------------------------ render (GPU) + subtítulos + brillo ambiental
  function renderFrame() {
    if (S.useGL) {
      // si los ajustes se pueden hacer con filtros CSS, van por ahí (el compositor los aplica casi gratis);
      // WebGL solo para nitidez, viñeta, temperatura, gamma, mejora de imagen o la comparación
      const neutral = gl.isNeutral(), viaCss = !neutral && App.gpuMode !== 'quality' && cssCapable();
      const ok = !neutral && !viaCss && gl.render();
      stage.classList.toggle('gl', !!ok);
      setVideoFilter(viaCss ? cssFilterOf(gl.params) : '');
      if (!gl.ok) { S.useGL = false; stage.classList.remove('gl'); applyCssFallback(); }
    }
    updateSubs();
    const now = performance.now();
    const glowEvery = App.gpuMode === 'eco' ? 600 : App.gpuMode === 'balanced' ? 400 : 200;
    if (glow.classList.contains('on') && now - S.lastGlow > glowEvery && video.readyState >= 2) {
      S.lastGlow = now;
      // en calidad máxima el brillo sale del cuadro ya procesado; si no, del video directo (copiar el lienzo WebGL cuesta más)
      try { drawGlow(App.gpuMode === 'quality' && stage.classList.contains('gl') ? glCanvas : video); } catch (e) { /* */ }
    }
  }
  // Luz ambiental: el cuadro se reduce a 32×18 y se difumina dentro de ese lienzo diminuto (casi gratis);
  // antes se difuminaba con CSS a tamaño de pantalla, lo que en gráficas integradas costaba ~25 % de GPU.
  // El lienzo tiene un margen alrededor para que el brillo se desvanezca hacia los bordes.
  function drawGlow(src) {
    const c = glowCtx.canvas;
    if (c.width !== 48) { c.width = 48; c.height = 27; }
    const w = glow.offsetWidth || 1200;
    const cssBlur = 30 + (S.glow == null ? 0.5 : S.glow) * 80;
    glowCtx.clearRect(0, 0, 48, 27);
    glowCtx.filter = `blur(${(cssBlur * 32 / w).toFixed(2)}px)`;
    glowCtx.drawImage(src, 8, 4.5, 32, 18);
  }
  function frameLoop() {
    renderFrame();
    S.lastFrame = performance.now();
    video.requestVideoFrameCallback(frameLoop);
  }
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) video.requestVideoFrameCallback(frameLoop);
  // respaldo: si no llegan cuadros (p. ej. ventana oculta), sigue actualizando subtítulos
  setInterval(() => { if (!video.paused && performance.now() - S.lastFrame > 400) renderFrame(); }, 250);

  function cssFilterOf(p) {
    return `brightness(${1 + p.brightness * 1.5}) contrast(${p.contrast}) saturate(${p.saturation * (1 + p.vibrance * 0.3)}) hue-rotate(${p.hue}deg)`;
  }
  function cssCapable() {
    const p = gl.params, z = (k, d = 0.005) => Math.abs(p[k] - COLOR_DEFAULTS[k]) < d;
    return z('sharpness', 0.02) && z('vignette', 0.02) && z('temperature', 0.02) && z('tint', 0.02) && z('gamma', 0.03) && !gl.enhance && gl.split < 0;
  }
  function setVideoFilter(f) { if (S.videoFilter !== f) { S.videoFilter = f; video.style.filter = f; } }
  function applyCssFallback() {
    setVideoFilter(cssFilterOf(gl.params));
  }

  // ------------------------------------------------------------ subtítulos
  function embeddedSubs() {
    return ((M.info && M.info.subs) || []).filter((x) => x.text);
  }
  function subLabel(x) {
    return [x.lang, x.title && x.title.toLowerCase() !== String(x.lang).toLowerCase() ? x.title : '', x.forced ? 'forzados' : ''].filter(Boolean).join(' · ') || `Pista ${x.n + 1}`;
  }
  async function loadSubsFor(ep) {
    S.subs = []; S.subName = ''; S.subPath = ''; S.subIdx = -1; subsEl.innerHTML = '';
    const epId = ep.id;
    if (App.settings.subsAuto !== false) {
      if (ep.subs && ep.subs.length) await loadSubFile(ep.subs[0].path, ep.subs[0].label);
      else {
        const emb = embeddedSubs();
        // preferencia: español, luego la marcada por defecto, luego la primera
        const pick = emb.find((x) => /español/i.test(x.lang) && !x.forced) || emb.find((x) => x.def) || emb[0];
        if (pick && S.ep && S.ep.id === epId) await loadEmbedded(pick);
      }
    }
    $('#c-sub').classList.toggle('on', S.subs.length > 0);
  }
  async function loadEmbedded(x) {
    const ep = S.ep;
    try {
      const r = await window.cinema.mediaSub(ep.path, x.index, x.codec);
      if (S.ep !== ep) return;
      S.subs = Subs.parse(r.text, 'x.' + r.format);
      S.subName = 'Incrustado: ' + subLabel(x);
      S.subPath = 'emb:' + x.index;
      $('#c-sub').classList.toggle('on', S.subs.length > 0);
      updateSubs(true);
    } catch (e) { toast('No se pudo leer el subtítulo incrustado'); }
  }
  async function loadSubFile(p, label) {
    try {
      const txt = await window.cinema.readSub(p);
      if (txt == null) throw new Error('sin acceso');
      S.subs = Subs.parse(txt, p);
      S.subName = label || p.split(/[\\/]/).pop();
      S.subPath = p;
      S.subIdx = -1;
      $('#c-sub').classList.toggle('on', S.subs.length > 0);
      if (!S.subs.length) toast('El archivo de subtítulos no tiene líneas reconocibles');
      updateSubs(true);
    } catch (e) { toast('No se pudieron leer los subtítulos'); }
  }
  let lastSubKey = '';
  function updateSubs(force) {
    if (!S.subs.length) { if (lastSubKey) { subsEl.innerHTML = ''; lastSubKey = ''; } return; }
    const t = curT() - S.subDelay;
    const act = [];
    for (const c of S.subs) {
      if (c.start > t) break;
      if (c.end >= t) act.push(c);
    }
    const key = act.map((c) => c.start + c.text).join('|');
    if (key === lastSubKey && !force) return;
    lastSubKey = key;
    subsEl.innerHTML = act.filter((c) => !c.top).map((c) => `<div class="cue"><span class="line">${Subs.safeHtml(c.text)}</span></div>`).join('');
  }
  function applySubStyle() {
    shell.style.setProperty('--sub-size', App.settings.subSize || 1);
    shell.style.setProperty('--sub-offset', (App.settings.subOffset || 0) + 'px');
  }

  // ------------------------------------------------------------ pistas de audio
  function audioList() { return (M.info && M.info.audios) || []; }
  function buildAudioMenu() {
    const tracks = video.audioTracks;
    $('#c-audio').hidden = !(audioList().length > 1 || (tracks && tracks.length > 1));
  }

  // ------------------------------------------------------------ popups
  function closePopups(except) {
    for (const id of ['pop-speed', 'pop-audio', 'pop-sub']) if (id !== except) $('#' + id).hidden = true;
  }
  function togglePopup(id, build) {
    const el = $('#' + id);
    const open = el.hidden;
    closePopups();
    if (open) { build(el); el.hidden = false; }
  }
  const RATES = [0.25, 0.5, 0.75, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  function fmtRate(r) { return (Math.round(r * 100) / 100) + 'x'; }
  function buildSpeed(el) {
    el.innerHTML = '<div class="pop-title">Velocidad</div>' + RATES.map((r) =>
      `<button class="opt ${Math.abs(video.playbackRate - r) < 0.001 ? 'active' : ''}" data-r="${r}"><svg class="i"><use href="#i-check"/></svg>${r === 1 ? 'Normal' : fmtRate(r)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { setRate(+b.dataset.r); el.hidden = true; } };
  }
  function setRate(r) {
    video.playbackRate = clamp(r, 0.25, 4);
    osd(`<svg class="i"><use href="#i-speed"/></svg>Velocidad ${fmtRate(video.playbackRate)}`);
  }
  function buildAudio(el) {
    const list = audioList();
    const tr = video.audioTracks;
    let html = '<div class="pop-title">Pista de audio</div>';
    if (list.length) {
      for (const a of list) {
        const name = [a.lang, a.title && a.title.toLowerCase() !== String(a.lang).toLowerCase() ? a.title : '', `${a.codec.toUpperCase()} ${a.channels > 2 ? a.channels + ' canales' : 'estéreo'}`].filter(Boolean).join(' · ');
        html += `<button class="opt ${M.audio === a.index ? 'active' : ''}" data-a="${a.index}" data-n="${a.n}"><svg class="i"><use href="#i-check"/></svg>${esc(name)}</button>`;
      }
    } else if (tr) {
      for (let i = 0; i < tr.length; i++) html += `<button class="opt ${tr[i].enabled ? 'active' : ''}" data-n="${i}"><svg class="i"><use href="#i-check"/></svg>${esc(tr[i].label || tr[i].language || 'Pista ' + (i + 1))}</button>`;
    }
    el.innerHTML = html;
    el.onclick = (e) => {
      const b = e.target.closest('[data-n]'); if (!b) return;
      el.hidden = true;
      const n = +b.dataset.n;
      const idx = b.dataset.a != null ? +b.dataset.a : null;
      const t = curT();
      if (idx != null) M.audio = idx;
      // modo directo con pistas nativas disponibles: cambio instantáneo; si no, se convierte con la pista elegida
      if (!M.stream && tr && tr.length > n && (!list.length || tr.length === list.length)) {
        for (let i = 0; i < tr.length; i++) tr[i].enabled = i === n;
        video.currentTime = t;
      } else if (idx != null) {
        const a = list.find((x) => x.index === idx);
        if (!M.stream && a && !['aac', 'mp3', 'opus', 'flac', 'vorbis'].includes(a.codec)) M.forceVideo = false;
        startStream(t, !video.paused);
      }
      osd('Audio: ' + esc(b.textContent));
    };
  }
  function buildSubMenu(el) {
    const ep = S.ep;
    let html = '<div class="pop-title">Subtítulos</div>';
    html += `<button class="opt ${!S.subs.length ? 'active' : ''}" data-s="off"><svg class="i"><use href="#i-check"/></svg>Desactivados</button>`;
    for (const s of (ep && ep.subs) || []) {
      html += `<button class="opt ${S.subPath === s.path && S.subs.length ? 'active' : ''}" data-s="${esc(s.path)}"><svg class="i"><use href="#i-check"/></svg>${esc(s.label)}</button>`;
    }
    for (const x of embeddedSubs()) {
      html += `<button class="opt ${S.subPath === 'emb:' + x.index && S.subs.length ? 'active' : ''}" data-s="emb:${x.index}"><svg class="i"><use href="#i-check"/></svg>Incrustado: ${esc(subLabel(x))}</button>`;
    }
    const bitmap = ((M.info && M.info.subs) || []).filter((x) => !x.text);
    if (bitmap.length) html += `<div class="pop-row muted" style="font-size:11.5px">${bitmap.length} pista(s) de imagen (PGS/VobSub) no compatibles · usa PotPlayer</div>`;
    if (S.subs.length && !(ep.subs || []).some((s) => s.path === S.subPath) && !S.subPath.startsWith('emb:')) {
      html += `<button class="opt active"><svg class="i"><use href="#i-check"/></svg>${esc(S.subName)}</button>`;
    }
    html += `<button class="opt" data-s="load"><svg class="i"><use href="#i-check"/></svg>Cargar archivo...</button><hr>`;
    html += `<div class="pop-row">Tamaño<input type="range" min="0.5" max="2" step="0.05" value="${App.settings.subSize || 1}" data-k="subSize"><span>${Math.round((App.settings.subSize || 1) * 100)}%</span></div>`;
    html += `<div class="pop-row">Altura<input type="range" min="-60" max="300" step="5" value="${App.settings.subOffset || 0}" data-k="subOffset"><span>${App.settings.subOffset || 0}px</span></div>`;
    html += `<div class="pop-row">Retraso<input type="range" min="-10" max="10" step="0.1" value="${S.subDelay}" data-k="delay"><span>${S.subDelay.toFixed(1)}s</span></div>`;
    el.innerHTML = html;
    el.querySelectorAll('input[type=range]').forEach((r) => {
      setRangeFill(r);
      r.oninput = () => {
        setRangeFill(r);
        const v = +r.value, lab = r.nextElementSibling;
        if (r.dataset.k === 'delay') { S.subDelay = v; lab.textContent = v.toFixed(1) + 's'; updateSubs(true); return; }
        App.saveSettings({ [r.dataset.k]: v });
        lab.textContent = r.dataset.k === 'subSize' ? Math.round(v * 100) + '%' : v + 'px';
        applySubStyle();
      };
    });
    el.onclick = async (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const v = b.dataset.s;
      el.hidden = true;
      if (v === 'off') { S.subs = []; S.subPath = ''; updateSubs(true); $('#c-sub').classList.remove('on'); osd('Subtítulos desactivados'); return; }
      if (v === 'load') { const p = await window.cinema.pickSub(); if (p) { await loadSubFile(p); osd('Subtítulos: ' + esc(S.subName)); } return; }
      if (v.startsWith('emb:')) { const x = embeddedSubs().find((y) => 'emb:' + y.index === v); if (x) { await loadEmbedded(x); osd('Subtítulos: ' + esc(S.subName)); } return; }
      await loadSubFile(v, b.textContent);
      osd('Subtítulos: ' + esc(S.subName));
    };
  }
  function cycleSubs() {
    const list = [...((S.ep && S.ep.subs) || []).map((x) => ({ key: x.path, go: () => loadSubFile(x.path, x.label) })),
      ...embeddedSubs().map((x) => ({ key: 'emb:' + x.index, go: () => loadEmbedded(x) }))];
    if (!list.length) { toast('Este video no tiene subtítulos (usa el menú para cargar uno)'); return; }
    const i = S.subs.length ? list.findIndex((x) => x.key === S.subPath) : -1;
    if (i === list.length - 1) { S.subs = []; S.subPath = ''; updateSubs(true); $('#c-sub').classList.remove('on'); osd('Subtítulos desactivados'); return; }
    list[i + 1].go().then(() => osd('Subtítulos: ' + esc(S.subName)));
  }

  // ------------------------------------------------------------ panel de color
  const cp = $('#color-panel');
  function currentColorScope() { return S.series && S.series.color ? 'series' : 'global'; }
  function applyColorForSeries() {
    const src = (S.series && S.series.color) || App.settings.color || {};
    gl.params = { ...COLOR_DEFAULTS, ...src };
    if (!S.useGL) applyCssFallback();
    renderFrame();
    if (!cp.hidden) buildColorPanel();
  }
  // mejora de imagen: escalado a la resolución de pantalla + líneas y bordes más definidos
  function enhanceLevel() {
    const k = App.settings.enhance || 'off';
    return App.settings.perfMode || App.gpuMode === 'eco' ? 'off' : (ENHANCE_LEVELS[k] !== undefined ? k : 'off');
  }
  function applyEnhance() {
    gl.enhance = S.useGL ? ENHANCE_LEVELS[enhanceLevel()] : null;
    if (video.paused) renderFrame();
    buildEnhance();
  }
  function buildEnhance() {
    const cur = enhanceLevel();
    $('#cp-enhance').innerHTML = Object.entries(ENHANCE_LEVELS).map(([k, v]) =>
      `<button class="chip ${cur === k ? 'active' : ''}" data-enh="${k}">${v ? esc(v.name) : 'Apagada'}</button>`).join('');
  }
  function setEnhance(k) {
    if (!S.useGL) { toast('La mejora de imagen requiere aceleración por GPU'); return; }
    if (App.settings.perfMode && k !== 'off') { toast('Desactiva el modo rendimiento para usar la mejora de imagen'); return; }
    if (App.gpuMode === 'eco' && k !== 'off') { toast('La mejora de imagen no se usa en el modo de ahorro de GPU'); return; }
    App.saveSettings({ enhance: k });
    applyEnhance();
    osd(`<svg class="i"><use href="#i-color"/></svg>Mejora de imagen: ${ENHANCE_LEVELS[k] ? esc(ENHANCE_LEVELS[k].name) : 'apagada'}`);
  }
  $('#cp-enhance').addEventListener('click', (e) => { const b = e.target.closest('[data-enh]'); if (b) setEnhance(b.dataset.enh); });
  function buildColorPanel() {
    buildEnhance();
    const scope = currentColorScope();
    $('#cp-scope').textContent = scope === 'series' ? 'Solo esta serie' : 'Global (todas las series)';
    $('#cp-series').checked = scope === 'series';
    $('#cp-presets').innerHTML = COLOR_PRESETS.map((p, i) => {
      const v = { ...COLOR_DEFAULTS, ...p.v };
      const active = Object.keys(COLOR_DEFAULTS).every((k) => Math.abs(v[k] - gl.params[k]) < 1e-3);
      return `<button class="chip ${active ? 'active' : ''}" data-p="${i}">${esc(p.name)}</button>`;
    }).join('');
    $('#cp-sliders').innerHTML = COLOR_SLIDERS.map((s) => s.sep ? `<div class="sl-sep">${s.sep}</div>` :
      `<div class="sl"><div class="sl-head">${s.label}<span data-reset="${s.key}" title="Doble clic para restablecer">${s.fmt(gl.params[s.key])}</span></div>
       <input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${gl.params[s.key]}"></div>`).join('');
    $$('#cp-sliders input').forEach(setRangeFill);
  }
  function commitColor() {
    const val = {};
    for (const k of Object.keys(COLOR_DEFAULTS)) if (Math.abs(gl.params[k] - COLOR_DEFAULTS[k]) > 1e-4) val[k] = gl.params[k];
    if ($('#cp-series').checked && S.series) {
      S.series.color = val;
      window.cinema.setMeta(S.series.id, { color: val });
    } else {
      App.saveSettings({ color: val });
    }
  }
  const commitColorSoon = debounce(commitColor, 400);
  function setParam(k, v) {
    gl.params[k] = v;
    if (!S.useGL) applyCssFallback();
    if (video.paused) renderFrame();
    commitColorSoon();
  }
  $('#cp-sliders').addEventListener('input', (e) => {
    const r = e.target.closest('input[type=range]'); if (!r) return;
    setRangeFill(r);
    const k = r.dataset.k, v = +r.value;
    const def = COLOR_SLIDERS.find((s) => s.key === k);
    r.previousElementSibling.querySelector('span').textContent = def.fmt(v);
    setParam(k, v);
    $$('#cp-presets .chip').forEach((c) => c.classList.remove('active'));
  });
  $('#cp-sliders').addEventListener('dblclick', (e) => {
    const sp = e.target.closest('[data-reset]'); if (!sp) return;
    setParam(sp.dataset.reset, COLOR_DEFAULTS[sp.dataset.reset]);
    buildColorPanel();
  });
  // los clics dentro del panel de color nunca llegan al video
  for (const ev of ['click', 'dblclick']) cp.addEventListener(ev, (e) => e.stopPropagation());
  $('#cp-presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const p = COLOR_PRESETS[+b.dataset.p];
    gl.params = { ...COLOR_DEFAULTS, ...p.v };
    if (!S.useGL) applyCssFallback();
    renderFrame();
    commitColor();
    buildColorPanel();
    osd(`<svg class="i"><use href="#i-color"/></svg>${esc(p.name)}`);
  });
  $('#cp-reset').onclick = () => { gl.params = { ...COLOR_DEFAULTS }; if (!S.useGL) applyCssFallback(); renderFrame(); commitColor(); buildColorPanel(); };
  $('#cp-close').onclick = () => toggleColorPanel(false);
  $('#cp-series').onchange = (e) => {
    if (!S.series) return;
    if (e.target.checked) { commitColor(); toast('Estos ajustes de color se usarán solo en «' + S.series.title + '»'); }
    else { S.series.color = null; window.cinema.setMeta(S.series.id, { color: null }); commitColor(); toast('Ajustes de color globales'); }
    buildColorPanel();
  };
  let compareLine = null;
  $('#cp-compare').onchange = (e) => setCompare(e.target.checked);
  function setCompare(on) {
    if (!S.useGL) { toast('La comparación requiere aceleración por GPU'); $('#cp-compare').checked = false; return; }
    gl.split = on ? 0.5 : -1;
    if (on && !compareLine) { compareLine = document.createElement('div'); compareLine.className = 'compare-line'; stage.appendChild(compareLine); }
    if (compareLine) compareLine.style.display = on ? '' : 'none';
    positionCompareLine();
    renderFrame();
  }
  function positionCompareLine() {
    if (!compareLine || gl.split < 0) return;
    const r = stage.getBoundingClientRect(), vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const scale = Math.min(r.width / vw, r.height / vh);
    const dispW = vw * scale, offX = (r.width - dispW) / 2;
    compareLine.style.left = offX + dispW * gl.split + 'px';
  }
  stage.addEventListener('mousemove', (e) => {
    if (gl.split < 0 || !e.buttons) return;
    const r = stage.getBoundingClientRect(), vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const scale = Math.min(r.width / vw, r.height / vh), dispW = vw * scale, offX = (r.width - dispW) / 2;
    gl.split = clamp((e.clientX - r.left - offX) / dispW, 0.02, 0.98);
    positionCompareLine();
    renderFrame();
  });
  function toggleColorPanel(force) {
    const open = force != null ? force : cp.hidden;
    cp.hidden = !open;
    $('#c-color').classList.toggle('on', open);
    if (open) { closePopups(); buildColorPanel(); }
    else if (gl.split >= 0) { $('#cp-compare').checked = false; setCompare(false); }
  }

  // ------------------------------------------------------------ controles
  function togglePlay() {
    if (!S.ep) return;
    if (S.errored) return;
    if (video.paused) { video.play().catch(() => {}); pulse('i-play'); }
    else { video.pause(); pulse('i-pause'); }
  }
  function seekBy(sec) {
    const d = durT();
    if (!d) return;
    const base = M.virtualT != null ? M.virtualT : curT();
    const target = clamp(base + sec, 0, d - 0.3);
    seekTo(target);
    osd(`${sec < 0 ? '⏪' : '⏩'} ${sec > 0 ? '+' : ''}${sec} s <span style="opacity:.6;font-weight:600">${fmtTime(target)} / ${fmtTime(d)}</span>`);
    updateTime();
  }
  function volumeBy(delta) {
    video.muted = false;
    video.volume = clamp(Math.round((video.volume + delta) * 100) / 100, 0, 1);
    osd(`<svg class="i"><use href="#${video.volume === 0 ? 'i-mute' : 'i-vol'}"/></svg>Volumen <div class="meter"><i style="width:${video.volume * 100}%"></i></div> ${Math.round(video.volume * 100)}%`);
  }
  function toggleMute() {
    video.muted = !video.muted;
    osd(`<svg class="i"><use href="#${video.muted ? 'i-mute' : 'i-vol'}"/></svg>${video.muted ? 'Silenciado' : 'Sonido activado'}`);
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      if (S.mode === 'mini') App.go('player');
      await shell.requestFullscreen().catch(() => {});
    }
  }
  document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement;
    icon($('#c-full'), fs ? 'i-exitfull' : 'i-full');
    if (!fs && S.mode === 'docked') applyRect(rectOfSlot());
    setTimeout(positionCompareLine, 100);
  });
  async function screenshot() {
    if (!S.ep || video.readyState < 2) return;
    let url;
    if (S.useGL && stage.classList.contains('gl')) { gl.render(); url = glCanvas.toDataURL('image/png'); }
    else {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      url = c.toDataURL('image/png');
    }
    const f = await window.cinema.saveScreenshot(url, `${S.series.title} - ${epLabel(S.ep)} - ${fmtTime(curT()).replace(/:/g, '.')}`);
    toast('Captura guardada en Imágenes\\Kuro Player');
    return f;
  }
  function frameStep(dir) {
    if (M.stream) { osd('Cuadro a cuadro no disponible en modo compatible'); return; }
    if (!video.paused) video.pause();
    video.currentTime = clamp(video.currentTime + dir / 24, 0, video.duration || 0);
    osd(dir > 0 ? 'Cuadro siguiente ▸' : '◂ Cuadro anterior');
  }

  $('#c-play').onclick = togglePlay;
  $('#m-play').onclick = (e) => { e.stopPropagation(); togglePlay(); };
  $('#c-next').onclick = playNext;
  $('#m-next').onclick = (e) => { e.stopPropagation(); playNext(); };
  $('#c-prev').onclick = playPrev;
  $('#c-back').onclick = () => seekBy(-10);
  $('#c-fwd').onclick = () => seekBy(10);
  $('#c-mute').onclick = toggleMute;
  $('#c-vol').oninput = (e) => { video.muted = false; video.volume = +e.target.value; };
  $('#c-full').onclick = toggleFullscreen;
  $('#c-speed').onclick = () => togglePopup('pop-speed', buildSpeed);
  $('#c-glow-r').oninput = (e) => setGlow(+e.target.value);
  $('#c-glow').onclick = () => setGlow(S.glow > 0 ? 0 : (S.lastGlowOn || 0.5), true);
  $('#c-theater').onclick = () => App.toggleTheater();
  $('#c-audio').onclick = () => togglePopup('pop-audio', buildAudio);
  $('#c-sub').onclick = () => togglePopup('pop-sub', buildSubMenu);
  $('#c-color').onclick = () => toggleColorPanel();
  $('#c-shot').onclick = screenshot;
  $('#c-list').onclick = () => { if (S.mode !== 'docked' || document.fullscreenElement) { if (document.fullscreenElement) document.exitFullscreen(); App.go('player'); } App.toggleList(); };
  $('#c-mini').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); App.go(App.lastBrowseView || 'library'); };
  $('#m-expand').onclick = (e) => { e.stopPropagation(); App.go('player'); };
  $('#m-close').onclick = (e) => { e.stopPropagation(); close(); };
  $('#btn-pin').onclick = async () => { S.pinned = !S.pinned; await window.cinema.setAlwaysOnTop(S.pinned); $('#btn-pin').classList.toggle('on', S.pinned); osd(S.pinned ? 'Siempre visible: activado' : 'Siempre visible: desactivado'); };
  $('#err-potplayer').onclick = (ev) => openInPotPlayer(ev);
  $('#err-next').onclick = () => playNext();
  $('#pl-prev').onclick = playPrev;
  $('#pl-next').onclick = playNext;

  function openInPotPlayer(ev) {
    if (!S.ep) return;
    const items = App.openWithItems(S.ep.path, curT());
    if (!items.length) { toast('No hay reproductores externos activos. Configúralos en Ajustes → Programas externos.'); return; }
    if (items.length === 1 || !ev) { items[0].action(); return; }
    ctxMenu(ev.clientX, ev.clientY, items);
  }

  // clic / doble clic / rueda en el video
  // ¿el clic vino de un panel o botón? (se revisa la ruta original: el botón pudo redibujarse y quedar fuera del documento)
  const UI_SEL = '.controls, .ctl-top, .popup, .color-panel, .error-box, .next-card, .resume-card, .mini-ctl button';
  const fromUi = (e) => !e.target.isConnected || e.composedPath().some((n) => n.nodeType === 1 && n.matches && n.matches(UI_SEL));
  stage.addEventListener('click', (e) => {
    if (fromUi(e)) return;
    if (S.mode === 'mini') { App.go('player'); return; }
    if (gl.split >= 0) return;
    clearTimeout(S.clickTimer);
    S.clickTimer = setTimeout(() => { closePopups(); togglePlay(); }, 220);
  });
  stage.addEventListener('dblclick', (e) => {
    if (fromUi(e)) return;
    clearTimeout(S.clickTimer);
    toggleFullscreen();
  });
  stage.addEventListener('wheel', (e) => {
    if (e.target.closest('.color-panel, .popup')) return;
    e.preventDefault();
    const st = (App.settings.volumeStep || 5) / 100;
    volumeBy(e.deltaY < 0 ? st : -st);
  }, { passive: false });
  stage.addEventListener('contextmenu', (e) => {
    if (!S.ep) return;
    e.preventDefault();
    ctxMenu(e.clientX, e.clientY, [
      { icon: video.paused ? 'i-play' : 'i-pause', label: video.paused ? 'Reproducir' : 'Pausa', action: togglePlay },
      { icon: 'i-color', label: 'Color y efectos', action: () => toggleColorPanel(true) },
      { icon: 'i-sub', label: 'Subtítulos', action: () => togglePopup('pop-sub', buildSubMenu) },
      { icon: 'i-camera', label: 'Guardar captura', action: screenshot },
      { icon: 'i-image', label: 'Usar este cuadro como portada', action: () => App.coverFromFrame() },
      '-',
      { icon: 'i-next', label: 'El opening empieza aquí', action: () => markSkip('opStart') },
      { icon: 'i-next', label: 'El opening termina aquí', action: () => markSkip('opEnd') },
      { icon: 'i-next', label: 'El ending empieza aquí', action: () => markSkip('edStart') },
      { icon: 'i-next', label: 'El ending termina aquí', action: () => markSkip('edEnd') },
      ...(S.series && S.series.skip && Object.keys(S.series.skip).length ? [{ icon: 'i-trash', label: 'Borrar marcas de opening/ending', action: () => markSkip('clear') }] : []),
      { icon: 'i-info', label: DIAG.on ? 'Ocultar diagnóstico' : 'Diagnóstico de reproducción (Shift+D)', action: () => toggleDiag() },
      '-',
      ...App.openWithItems(S.ep.path, curT()),
      { icon: 'i-folder', label: 'Mostrar en el explorador', action: () => window.cinema.showInFolder(S.ep.path) },
    ]);
  });

  // ocultar controles tras inactividad
  function kickIdle() {
    shell.classList.remove('idle');
    clearTimeout(S.idleTimer);
    S.idleTimer = setTimeout(() => {
      if (!video.paused && cp.hidden && $$('.popup').every((p) => p.hidden) && !dragging && !stage.matches(':has(.controls:hover)')) shell.classList.add('idle');
    }, 2600);
  }
  shell.addEventListener('mousemove', kickIdle);
  shell.addEventListener('mouseleave', () => { if (!video.paused) { clearTimeout(S.idleTimer); S.idleTimer = setTimeout(() => shell.classList.add('idle'), 700); } });

  // ------------------------------------------------------------ barra de progreso + vista previa
  const progress = $('#progress');
  const tip = $('#prog-tip');
  const tipCtx = $('#tip-canvas').getContext('2d');
  const previewVideo = document.createElement('video');
  previewVideo.muted = true; previewVideo.crossOrigin = 'anonymous'; previewVideo.preload = 'metadata';
  let pvBusy = false, pvWant = -1, dragging = false, pvReady = false;
  previewVideo.addEventListener('seeked', () => {
    try { tipCtx.drawImage(previewVideo, 0, 0, 192, 108); tip.classList.remove('no-img'); } catch (e) { tip.classList.add('no-img'); }
    pvBusy = false;
    if (pvWant >= 0 && Math.abs(pvWant - previewVideo.currentTime) > 1) seekPreview(pvWant);
  });
  previewVideo.addEventListener('error', () => tip.classList.add('no-img'));
  previewVideo.addEventListener('loadedmetadata', () => { if (pvWant >= 0) { const w = pvWant; pvWant = -1; seekPreview(w); } });
  function seekPreview(t) {
    if (M.stream || !S.ep) { tip.classList.add('no-img'); return; }
    if (!pvReady) { pvReady = true; previewVideo.src = S.ep.url; pvBusy = false; }
    pvWant = t;
    if (pvBusy || previewVideo.readyState < 1) return;
    pvBusy = true; pvWant = -1;
    previewVideo.currentTime = t;
  }
  function posToTime(clientX) {
    const r = progress.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    return { p, t: p * (durT() || 0), r };
  }
  progress.addEventListener('mousemove', (e) => {
    const { p, t, r } = posToTime(e.clientX);
    $('#prog-hover').style.width = p * 100 + '%';
    $('#tip-time').textContent = fmtTime(t);
    tip.style.left = clamp(p * r.width, 100, r.width - 100) + 'px';
    seekPreview(t);
    if (dragging) { $('#prog-fill').style.width = p * 100 + '%'; $('#prog-knob').style.left = p * 100 + '%'; }
  });
  progress.addEventListener('mousedown', (e) => {
    if (!durT()) return;
    dragging = true;
    progress.classList.add('drag');
    const move = (ev) => {
      const { p, t } = posToTime(ev.clientX);
      $('#prog-fill').style.width = p * 100 + '%';
      $('#prog-knob').style.left = p * 100 + '%';
      $('#t-cur').textContent = fmtTime(t);
      $('#tip-time').textContent = fmtTime(t);
      seekPreview(t);
    };
    const up = (ev) => {
      dragging = false;
      progress.classList.remove('drag');
      seekTo(posToTime(ev.clientX).t, true);
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
    };
    move(e);
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });

  // ------------------------------------------------------------ siguiente capítulo automático
  function showNextCard(next) {
    const card = $('#next-card');
    $('#next-thumb').style.backgroundImage = cssUrl(next.thumb || S.series.cover);
    $('#next-name').textContent = epLabel(next) + ' · ' + next.title;
    S.nextLeft = App.settings.autoNextDelay || 8;
    $('#next-count').textContent = S.nextLeft;
    card.hidden = false;
    shell.classList.remove('idle');
    clearInterval(S.nextTimer);
    S.nextTimer = setInterval(() => {
      S.nextLeft--;
      $('#next-count').textContent = S.nextLeft;
      if (S.nextLeft <= 0) { hideNextCard(); loadIn(next, { startAt: 0 }); }
    }, 1000);
    $('#next-go').onclick = () => { hideNextCard(); loadIn(next, { startAt: 0 }); };
  }
  function hideNextCard() { clearInterval(S.nextTimer); $('#next-card').hidden = true; }
  $('#next-cancel').onclick = hideNextCard;

  // ------------------------------------------------------------ teclado
  function handleKey(e) {
    if (S.askResume && resumeTimer) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resumeChoice(true); return true; }
      if (e.key === 'Home' || e.key === 'Backspace') { e.preventDefault(); resumeChoice(false); return true; }
      if (e.key === 'Escape') { e.preventDefault(); resumeChoice(true); return true; }
    }
    if (!S.ep || S.mode === 'hidden') return false;
    if (e.key === 'Enter' && !$('#skip-btn').hidden) { $('#skip-btn').click(); return true; }
    const k = e.key;
    const long = e.shiftKey;
    const step = long ? (App.settings.seekStepLong || 30) : (App.settings.seekStep || 5);
    const vstep = (App.settings.volumeStep || 5) / 100;
    if (e.ctrlKey && (k === 's' || k === 'S')) { screenshot(); return true; }
    if (e.shiftKey && (k === 'd' || k === 'D')) { toggleDiag(); return true; }
    if (e.shiftKey && (k === 'e' || k === 'E')) {
      const keys = Object.keys(ENHANCE_LEVELS), i = keys.indexOf(enhanceLevel());
      setEnhance(keys[(i + 1) % keys.length]);
      return true;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    switch (k) {
      case ' ': case 'k': case 'K': togglePlay(); return true;
      case 'ArrowRight': seekBy(step); return true;
      case 'ArrowLeft': seekBy(-step); return true;
      case 'ArrowUp': volumeBy(vstep); return true;
      case 'ArrowDown': volumeBy(-vstep); return true;
      case 'j': case 'J': seekBy(-10); return true;
      case 'l': case 'L': App.toggleList(); return true;
      case 'f': case 'F': case 'Enter': toggleFullscreen(); return true;
      case 'm': case 'M': toggleMute(); return true;
      case 'n': case 'N': case 'PageDown': playNext(); return true;
      case 'p': case 'P': case 'PageUp': playPrev(); return true;
      case 'c': case 'C': if (S.mode !== 'mini') toggleColorPanel(); return true;
      case 's': case 'S': cycleSubs(); return true;
      case 'i': case 'I': if (S.mode === 'mini') App.go('player'); else $('#c-mini').click(); return true;
      case 't': case 'T': if (document.fullscreenElement) document.exitFullscreen(); App.toggleTheater(); return true;
      case 'g': case 'G': setGlow(S.glow > 0 ? 0 : (S.lastGlowOn || 0.5), true); return true;
      case ']': case '+': setRate(video.playbackRate + 0.1); return true;
      case '[': case '-': setRate(video.playbackRate - 0.1); return true;
      case '=': case 'Backspace': setRate(1); return true;
      case '.': frameStep(1); return true;
      case ',': frameStep(-1); return true;
      case 'Home': seekTo(0, true); return true;
      case 'End': if (durT()) seekTo(durT() - 2, true); return true;
      case 'Escape':
        if (!cp.hidden) { toggleColorPanel(false); return true; }
        if ($$('.popup').some((p) => !p.hidden)) { closePopups(); return true; }
        if (document.fullscreenElement) { document.exitFullscreen(); return true; }
        return false;
      default:
        if (/^[0-9]$/.test(k) && durT()) { seekTo(durT() * (+k / 10), true); osd(`Saltar a ${k * 10}%`); return true; }
    }
    return false;
  }

  function close() {
    document.body.classList.remove('playing');
    saveProgress(true);
    video.pause();
    hideNextCard();
    if (document.fullscreenElement) document.exitFullscreen();
    setMode('hidden');
    M.seq++;
    M.stream = false;
    window.cinema.mediaStop();
    video.removeAttribute('src');
    video.load();
    previewVideo.removeAttribute('src');
    S.ep = null;
    S.series = null;
    S.playlist = null;
    App.onClosed();
  }

  function init() {
    video.volume = App.settings.volume != null ? App.settings.volume : 0.9;
    video.muted = !!App.settings.muted;
    setRangeFill($('#c-vol'));
    applySubStyle();
    S.lastGlowOn = App.settings.glowLevel > 0 ? App.settings.glowLevel : 0.5;
    applyGlow(App.settings.glowLevel != null ? App.settings.glowLevel : 0.5);
    if (!gl.ok) { S.useGL = false; console.warn('WebGL no disponible, usando filtros CSS'); }
    applyGpuMode();
  }
  function applyGpuMode() {
    const was = S.useGL;
    S.useGL = gl.ok && App.gpuMode !== 'eco';
    if (!S.useGL) { stage.classList.remove('gl'); applyCssFallback(); }
    else if (!was) setVideoFilter('');
    if (!S.useGL && gl.split >= 0) setCompare(false);
    applyEnhance();
    renderFrame();
  }
  addEventListener('beforeunload', () => saveProgress(true));

  return {
    init, load, setMode, handleKey, close, togglePlay, playNext, playPrev, saveProgress, applyColorForSeries, applyEnhance, applyGpuMode,
    get state() { return S; }, get video() { return video; }, get mode() { return S.mode; },
    currentTime: () => curT(), get media() { return M; }, seek: (t) => seekTo(t, true),
    grabFrame(w = 480) {
      if (video.readyState < 2) return null;
      const c = document.createElement('canvas');
      const h = Math.round(w * (video.videoHeight / video.videoWidth));
      c.width = w; c.height = h;
      const useGl = stage.classList.contains('gl') && gl.render();
      c.getContext('2d').drawImage(useGl ? glCanvas : video, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.9);
    },
    grabPoster() {
      if (video.readyState < 2) return null;
      const vw = video.videoWidth, vh = video.videoHeight;
      const h = vh, w = Math.min(vw, Math.round(h * 2 / 3));
      const c = document.createElement('canvas');
      c.width = 600; c.height = 900;
      const useGl = stage.classList.contains('gl') && gl.render();
      const src = useGl ? glCanvas : video, k = useGl ? glCanvas.width / vw : 1;
      c.getContext('2d').drawImage(src, (vw - w) / 2 * k, 0, w * k, h * k, 0, 0, 600, 900);
      return c.toDataURL('image/jpeg', 0.9);
    },
    refreshGlow: updateGlowVisibility,
  };
})();
