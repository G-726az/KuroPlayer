/* Aplicación: biblioteca, vistas (inicio, cartelera, serie, reproductor), miniaturas y ajustes. */
const App = (() => {
  const A = {
    series: [], allSeries: [], groups: [], group: null, profiles: [], profile: null, byId: new Map(), progress: {}, settings: {}, roots: [], potplayer: '',
    view: 'home', lastBrowseView: 'home', currentSeries: null, letter: 'all', groupFilter: null, panelGroup: null,
    pendingProgress: {}, scanning: false, rootsInfo: [], genre: null, genreExpand: false, selecting: false, selected: new Set(),
  };

  // ------------------------------------------------------------ datos
  function getProgress(p) { return A.progress[p] || null; }
  function setProgress(p, v) {
    if (v) A.progress[p] = v; else delete A.progress[p];
    if (v && (v.w || v.t > 30)) for (const s of A.series) { const e = s.episodes.find((x) => x.path === p); if (e && e.isNew) { e.isNew = false; s.newCount = Math.max(0, (s.newCount || 1) - 1); } }
    A.pendingProgress[p] = v || null;
    flushProgressSoon();
    if (v) refreshEpisodeProgressUI(p);
  }
  const flushProgressSoon = debounce(() => {
    const batch = A.pendingProgress; A.pendingProgress = {};
    if (Object.keys(batch).length) window.cinema.setProgress(batch);
  }, 1500);
  function saveSettings(patch) {
    Object.assign(A.settings, patch);
    saveSettingsSoon();
  }
  const saveSettingsSoon = debounce(() => window.cinema.setSettings(A.settings), 500);

  function seriesStats(s) {
    let watched = 0, lastTs = 0, lastEp = null;
    for (const e of s.episodes) {
      const p = A.progress[e.path];
      if (!p) continue;
      if (p.w) watched++;
      if (p.ts > lastTs) { lastTs = p.ts; lastEp = e; }
    }
    return { watched, lastTs, lastEp, total: s.episodes.length };
  }
  // episodio con el que continuar una serie
  function resumeTarget(s) {
    const st = seriesStats(s);
    if (!st.lastEp) return { ep: s.episodes[0], fresh: true };
    const p = A.progress[st.lastEp.path];
    if (p && !p.w) return { ep: st.lastEp, fresh: false };
    const i = s.episodes.indexOf(st.lastEp);
    const next = s.episodes.slice(i + 1).find((e) => !(A.progress[e.path] || {}).w) || s.episodes.find((e) => !(A.progress[e.path] || {}).w);
    return { ep: next || s.episodes[0], fresh: !next };
  }

  function applyDisplayTitles() {
    const src = A.settings.titleSource || 'romaji';
    for (const s of A.allSeries) {
      s.customTitle = s.title !== s.folderName && s.title !== s.displayFolder;
      if (!s.customTitle && s.web && src !== 'folder') {
        s.title = src === 'english' ? (s.web.titleEn || s.web.title) : src === 'japanese' ? (s.web.titleJp || s.web.title) : (s.web.title || s.folderName);
      }
    }
  }
  function synopsisOf(s) {
    if (s.synopsis) return s.synopsis;
    if (!s.web) return '';
    if (I18N.lang === 'en') return s.web.synopsis || s.web.synopsisEs || '';
    return (A.settings.translateSynopsis !== false && s.web.synopsisEs) || s.web.synopsis || '';
  }
  function altTitles(s) {
    const out = [];
    const add = (t) => { if (t && t !== s.title && !out.includes(t)) out.push(t); };
    if (s.web) { add(s.web.title); add(s.web.titleEn); add(s.web.titleJp); (s.web.synonyms || []).forEach(add); }
    if (s.folderName !== s.title && !s.displayFolder) add(s.folderName);
    return out;
  }
  function genresOf(s) {
    const out = [...(s.customGenres || [])];
    const web = s.web ? (I18N.lang === 'en' ? (s.web.genres || s.web.genresEs) : (s.web.genresEs || s.web.genres)) || [] : [];
    for (const g of web) if (!out.includes(g)) out.push(g);
    return out;
  }
  function allCustomCategories() {
    const m = new Map();
    for (const x of A.series) for (const g of x.customGenres || []) m.set(g, (m.get(g) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }
  function tagHtml(s, g) {
    const custom = (s.customGenres || []).includes(g);
    return `<span class="tag ${custom ? 'custom' : ''} ${A.genre === g ? 'active' : ''}" data-genre="${esc(g)}" title="Ver todas las series de «${esc(g)}»">${custom ? '★ ' : ''}${esc(g)}</span>`;
  }
  function webChips(s, max) {
    if (!s.web) return '';
    const w = s.web, c = [];
    (w.studios || []).slice(0, 2).forEach((x) => c.push(`<span class="mini-chip accent">${esc(x)}</span>`));
    if (w.year) c.push(`<span class="mini-chip">${w.year}</span>`);
    if (w.typeEs) c.push(`<span class="mini-chip">${esc(w.typeEs)}</span>`);
    return c.slice(0, max || 6).join('');
  }

  const NEW_MS = 7 * 86400000;
  function markNew() {
    const now = Date.now();
    for (const s of A.allSeries) {
      let n = 0;
      for (const e of s.episodes) {
        const p = A.progress[e.path];
        e.isNew = !!(e.addedAt && now - e.addedAt < NEW_MS && e.addedAt - (s.addedAt || 0) > 60000 && !(p && (p.w || p.t > 30)));
        if (e.isNew) n++;
      }
      s.newCount = n;
    }
  }
  function diffSummary(diff, root) {
    if (!diff) return { text: '', changed: false };
    const inRoot = (x) => !root || (x.root || '').toLowerCase() === root.toLowerCase();
    const ns = diff.newSeries.filter(inRoot), ne = diff.newEpisodes.filter(inRoot), rs = diff.removedSeries.filter(inRoot);
    const parts = [];
    if (ns.length) parts.push(ns.length === 1 ? `nuevo: «${ns[0].title}»${ns[0].count > 1 ? ` (${ns[0].count} cap.)` : ''}` : `${ns.length} títulos nuevos`);
    const epCount = ne.reduce((a, x) => a + x.count, 0);
    if (epCount) parts.push(ne.length === 1 ? `${epCount} capítulo${epCount > 1 ? 's' : ''} nuevo${epCount > 1 ? 's' : ''} en «${ne[0].title}»` : `${epCount} capítulos nuevos en ${ne.length} series`);
    if (rs.length) parts.push(`${rs.length} título${rs.length > 1 ? 's' : ''} ya no está${rs.length > 1 ? 'n' : ''}`);
    if (!root && diff.removedEpisodes) parts.push(`${diff.removedEpisodes} capítulo${diff.removedEpisodes > 1 ? 's' : ''} quitado${diff.removedEpisodes > 1 ? 's' : ''}`);
    return { text: parts.join(' · '), changed: parts.length > 0 };
  }

  async function scan(silent, opts = {}) {
    if (A.scanning) { A.rescanPending = true; return null; }
    A.scanning = true;
    Busy.set('scan', 'Revisando la biblioteca');
    $('#btn-rescan').classList.add('spin');
    try {
      const { series: list, diff } = await window.cinema.scan();
      A.lastDiff = diff;
      A.allSeries = list;
      A.byId = new Map(list.map((s) => [s.id, s]));
      applyGroupFilter();
      renderRail();
      applyDisplayTitles();
      markNew();
      // mantener referencias del reproductor actualizadas
      const st = Player.state;
      if (st.series && A.byId.has(st.series.id)) {
        const ns = A.byId.get(st.series.id);
        const ne = ns.episodes.find((e) => e.id === (st.ep && st.ep.id));
        st.series = ns; if (ne) st.ep = ne;
      }
      if (A.currentSeries) A.currentSeries = A.byId.get(A.currentSeries.id) || null;
      renderAll();
      queueMissingCoverThumbs();
      const sum = diffSummary(diff, opts.root);
      if (sum.changed && !opts.quiet) toast('Novedades: ' + sum.text, 6000);
      else if (!silent) toast(opts.root ? 'Sin cambios en esa carpeta' : `Sin cambios · ${A.series.length} ${groupNoun(A.series.length)} en «${esc(curGroup().name)}»`);
      return diff;
    } catch (e) {
      console.error(e); toast('Error al escanear la biblioteca');
    } finally {
      A.scanning = false;
    Busy.clear('scan');
      $('#btn-rescan').classList.remove('spin');
      if (A.rescanPending) { A.rescanPending = false; setTimeout(() => scan(true), 500); }
    }
  }

  // ------------------------------------------------------------ navegación
  function go(view, opts = {}) {
    if (view === 'player' && !Player.state.ep) view = 'home';
    if (view === 'series' && opts.id) A.currentSeries = A.byId.get(opts.id) || A.currentSeries;
    if (view === 'series' && !A.currentSeries) view = 'library';
    if (view !== 'library' && A.selecting) { A.selecting = false; A.selected.clear(); }
    A.view = view;
    document.body.classList.toggle('in-player', view === 'player');
    renderSelBar();
    if (view !== 'player') A.lastBrowseView = view === 'series' ? 'series' : view;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.go === view || (view === 'series' && b.dataset.go === 'library')));
    if (view === 'series') renderSeries();
    if (view === 'library') renderLibrary();
    if (view === 'home') renderHome();
    if (Player.state.ep) { if (view !== 'player') Player.saveProgress(true); Player.setMode(view === 'player' ? 'docked' : 'mini'); }
    if (view === 'player') { renderPanel(true); setAmbient(Player.state.series); }
    else if (view === 'series') setAmbient(A.currentSeries);
    else setAmbient(heroSeries());
    if (opts.scrollTop !== false) { const v = $('#view-' + view); if (v && view !== 'player') v.scrollTop = 0; }
  }
  function setAmbient(s) {
    const img = $('#amb-img');
    const url = s && (s.backdrop || s.cover || (s.episodes[0] && s.episodes[0].thumb));
    coverAccent(s);
    img.style.backgroundImage = url ? cssUrl(url) : 'none';
    img.classList.toggle('on', !!url);
  }

  // ------------------------------------------------------------ tarjetas
  function posterArt(s) {
    const art = s.cover || (s.episodes[0] && s.episodes[0].thumb);
    if (art) return `<img src="${esc(art)}" loading="lazy" draggable="false" alt="">`;
    return `<div class="no-art" style="--g:${hashGradient(s.title)}">${esc(s.title)}<small>${s.episodes.length} capítulos</small></div>`;
  }
  function posterHtml(s) {
    const st = seriesStats(s);
    const isNew = !st.lastTs && Date.now() - (s.addedAt || 0) < 7 * 86400000;
    const pct = st.total ? (st.watched / st.total) * 100 : 0;
    const seen = st.watched ? `<span class="seen ${st.watched === st.total ? 'done' : ''}">${st.watched === st.total ? '✓ Visto' : st.watched + '/' + st.total}</span>` : '';
    return `<div class="poster ${A.selected.has(s.id) ? 'selected' : ''}" data-series="${s.id}" title="${esc(s.title)}"><span class="sel-box"><svg class="i"><use href="#i-check"/></svg></span>
      <div class="art">${posterArt(s)}
        ${isNew ? '<span class="new">NUEVO</span>' : s.newCount ? `<span class="new">+${s.newCount} NUEVO${s.newCount > 1 ? 'S' : ''}</span>` : ''}
        <span class="count">${s.kind === 'movie' && st.total === 1 ? 'PELÍCULA' : st.total + ' EP'}</span>${seen}
        ${s.web && s.web.score ? `<span class="score"><svg class="i"><use href="#i-star"/></svg>${s.web.score}</span>` : ''}
        <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
        ${favBtn(s)}
        ${pct ? `<div class="p-bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <div class="p-title">${esc(s.title)}</div>
      <div class="p-meta">${s.web && s.web.year ? `<span class="mini-chip">${s.web.year}</span>` : '<span></span>'}<span class="p-sub">${st.lastTs ? 'Visto ' + fmtAgo(st.lastTs) : s.groups.filter(Boolean).length ? s.groups.filter(Boolean).length + ' temporadas' : fmtSize(s.size)}</span></div>
    </div>`;
  }
  function listCardHtml(s) {
    const st = seriesStats(s);
    const art = s.cover || (s.episodes[0] && s.episodes[0].thumb);
    const pct = st.total ? (st.watched / st.total) * 100 : 0;
    const syn = synopsisOf(s);
    const alts = altTitles(s);
    const genres = genresOf(s);
    const epTotal = s.web && s.web.episodes ? `${st.total}/${s.web.episodes} capítulos` : `${st.total} capítulos`;
    let doubt = '';
    if (!s.web && s.webStatus === 'doubt' && s.webCandidate) {
      doubt = `<div class="doubt-bar">¿Es <b>${esc(s.webCandidate.title)}</b>${s.webCandidate.year ? ' (' + s.webCandidate.year + ')' : ''}?
        <button class="btn primary" data-web-confirm="${s.id}">Sí, usar</button><button class="btn glass" data-web-pick="${s.id}">Elegir otro</button><button class="btn glass" data-web-reject="${s.id}">No es</button></div>`;
    } else if (!s.web && s.webStatus === 'none') {
      doubt = `<div class="doubt-bar">No se encontró en internet con este nombre. <button class="btn glass" data-web-pick="${s.id}">Buscar manualmente</button></div>`;
    }
    return `<div class="lcard ${A.selected.has(s.id) ? 'selected' : ''}" data-series="${s.id}"><span class="sel-box"><svg class="i"><use href="#i-check"/></svg></span>
      <div class="lcard-left">
        <div class="lcard-art">${art ? `<img src="${esc(art)}" loading="lazy" draggable="false" alt="">` : `<div class="no-art" style="--g:${hashGradient(s.title)}">${esc(s.title)}</div>`}
          <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
          ${favBtn(s)}
          ${pct ? `<div class="p-bar"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <div class="lcard-stats">
          <span class="stat" title="Puntuación">${s.web && s.web.score ? `<svg class="i star"><use href="#i-star"/></svg>${s.web.score}` : '<span class="muted">—</span>'}</span>
          <span class="stat" title="Capítulos vistos"><svg class="i" style="color:var(--ok)"><use href="#i-check"/></svg>${st.watched}/${st.total}</span>
        </div>
      </div>
      <div class="lcard-body">
        <div class="lcard-title" title="${esc(s.title)}">${esc(s.title)}</div>
        ${alts.length ? `<div class="lcard-alt" title="${esc(alts.join(', '))}">${esc(alts.join(', '))}</div>` : ''}
        <div class="chips">${webChips(s, 3)}<span class="mini-chip cyan">${epTotal}</span>${s.newCount ? `<span class="mini-chip ok">+${s.newCount} nuevo${s.newCount > 1 ? 's' : ''}</span>` : ''}${renameSuggestion(s) ? `<button class="mini-chip warn" data-rename="${s.id}" title="La carpeta no tiene el nombre oficial">Renombrar carpeta</button>` : ''}${st.lastTs ? `<span class="mini-chip">Visto ${fmtAgo(st.lastTs)}</span>` : ''}</div>
        ${doubt}
        <div class="lcard-syn ${syn ? '' : 'none'}">${syn ? esc(syn) : 'Sin descripción. Usa Ajustes → Datos de internet, o clic derecho → Buscar en internet.'}</div>
        ${syn && syn.length > 180 ? '<button class="read-more" data-read-more>Leer más</button>' : ''}
        ${genres.length ? `<div class="tags">${genres.map((g) => tagHtml(s, g)).join('')}</div>` : ''}
      </div>
    </div>`;
  }
  function eyeBtn(e, s) {
    const p = A.progress[e.path];
    const w = !!(p && p.w);
    return `<button class="eye-btn ${w ? 'on' : ''}" data-eye="${e.id}" data-sid="${s.id}" title="${w ? 'Visto · clic para marcar como no visto' : 'Marcar como visto'}"><svg class="i"><use href="#${w ? 'i-eye' : 'i-eye-off'}"/></svg></button>`;
  }
  // ------------------------------------------------------------ FAVORITOS (series/películas y videos sueltos)
  function favBtn(s) {
    return `<button class="fav-btn ${s.fav ? 'on' : ''}" data-fav-s="${s.id}" title="${s.fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"><svg class="i"><use href="#${s.fav ? 'i-heart-f' : 'i-heart'}"/></svg></button>`;
  }
  function favEpBtn(e, s) {
    return `<button class="fav-btn ep ${e.fav ? 'on' : ''}" data-fav-e="${e.id}" data-sid="${s.id}" title="${e.fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"><svg class="i"><use href="#${e.fav ? 'i-heart-f' : 'i-heart'}"/></svg></button>`;
  }
  async function toggleFavSeries(s) {
    s.fav = !s.fav; s.favAt = s.fav ? Date.now() : 0;
    await window.cinema.setMeta(s.id, { fav: s.fav, favAt: s.favAt });
    toast(s.fav ? `«${s.title}» agregado a favoritos` : `«${s.title}» quitado de favoritos`);
    renderAll();
  }
  async function toggleFavEp(s, e) {
    e.fav = !e.fav;
    await window.cinema.favEp(e.path, e.fav);
    toast(e.fav ? 'Video agregado a favoritos' : 'Video quitado de favoritos');
    renderAll();
  }
  const isFavItem = (s) => s.fav || s.episodes.some((e) => e.fav);
  // los videos favoritos forman una lista propia, sin importar en qué carpeta estén
  function favPlaylist() {
    const owner = new Map();
    const episodes = [];
    for (const ser of A.series) for (const ep of ser.episodes) if (ep.fav) { episodes.push(ep); owner.set(ep.id, ser); }
    return { id: '__fav__', title: 'Favoritos', episodes, ownerOf: (ep) => owner.get(ep.id) };
  }

  // ------------------------------------------------------------ DURACIÓN (grupos «Otros»)
  const DUR_BUCKETS = [
    { k: 'lt1', label: 'Menos de 1 minuto', test: (d) => d < 60 },
    { k: '1to5', label: 'De 1 a 5 minutos', test: (d) => d >= 60 && d < 300 },
    { k: '5to10', label: 'De 5 a 10 minutos', test: (d) => d >= 300 && d < 600 },
    { k: '10to30', label: 'De 10 a 30 minutos', test: (d) => d >= 600 && d < 1800 },
    { k: 'gt30', label: 'Más de 30 minutos', test: (d) => d >= 1800 },
  ];
  function epDur(ep) {
    if (ep.dur) return ep.dur;
    const p = A.progress[ep.path];
    return p && p.d ? p.d : null;
  }
  // las duraciones se leen con FFmpeg en segundo plano, por tandas, y quedan guardadas
  function durTargets() {
    const out = [];
    if (A.view === 'library' && curGroup().type === 'other') for (const s of A.series) out.push(...s.episodes);
    if (A.view === 'series' && A.currentSeries) out.push(...A.currentSeries.episodes);
    return out;
  }
  async function loadDurations() {
    if (A.durLoading) return;
    A.durLoading = true;
    Busy.set('dur', 'Midiendo la duración de los videos');
    try {
      for (;;) {
        const pending = durTargets().filter((e) => epDur(e) == null && !e.durTried);
        if (!pending.length) break;
        const batch = pending.slice(0, 30);
        batch.forEach((e) => { e.durTried = true; });
        const res = await window.cinema.durations(batch.map((e) => e.path));
        for (const e of batch) if (res[e.path]) e.dur = res[e.path];
        if (A.view === 'library') renderLibrary();
        if (A.view === 'series') renderSeries();
      }
    } catch (err) { console.warn('duraciones', err); }
    A.durLoading = false;
    Busy.clear('dur');
    if (A.view === 'library') renderLibrary();
    if (A.view === 'series') renderSeries();
  }
  // filtro por duración dentro de una carpeta (grupos «Otros»)
  function renderSeriesDur(s) {
    const box = $('#series-dur');
    if (A.serDurFor !== s.id) { A.serDurFor = s.id; A.serDur = A.durFilter || null; A.serFav = false; }
    const favN = s.episodes.filter((e) => e.fav).length;
    if (!favN) A.serFav = false;
    const favChip = favN ? `<button class="chip fav-chip ${A.serFav ? 'active' : ''}" data-sfav><svg class="i"><use href="#${A.serFav ? 'i-heart-f' : 'i-heart'}"/></svg>Favoritos <small>${favN}</small></button>` : '';
    if (groupOf(s).type !== 'other' || s.episodes.length < 2) {
      A.serDur = null;
      box.hidden = !favChip;
      box.innerHTML = favChip;
      return;
    }
    const durs = s.episodes.map(epDur).filter((d) => d != null);
    const pending = s.episodes.filter((e) => epDur(e) == null && !e.durTried).length;
    box.hidden = false;
    box.innerHTML = favChip + `<span class="seg-label">Duración:</span><button class="chip ${!A.serDur ? 'active' : ''}" data-sdur="">Todas <small>${s.episodes.length}</small></button>`
      + DUR_BUCKETS.map((b) => `<button class="chip ${A.serDur === b.k ? 'active' : ''}" data-sdur="${b.k}">${b.label} <small>${durs.filter(b.test).length}</small></button>`).join('')
      + (pending ? `<span class="muted small dur-wait">Calculando duraciones… ${durs.length}/${s.episodes.length}</span>` : '');
  }
  function vidCardHtml(s, ep, pl) {
    const d = epDur(ep);
    return `<div class="continue-card vid-card" data-play-ep="${ep.id}" data-sid="${s.id}" ${pl ? `data-pl="${pl}"` : ''}>
      <div class="thumb" data-thumb="${ep.id}" style="background-image:${cssUrl(ep.thumb || s.cover)}">
        ${d ? `<span class="dur-badge">${fmtTime(d)}</span>` : ''}
        <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
        ${eyeBtn(ep, s)}${favEpBtn(ep, s)}
        ${progressBar(ep)}
      </div>
      <div class="cc-t">${esc(ep.title)}</div>
      <div class="cc-s">${esc(s.title)}</div>
    </div>`;
  }
  function renderLibFilters() {
    const bar = $('#lib-filters');
    const isOther = curGroup().type === 'other';
    if (!isOther) A.durFilter = null;
    const favN = A.series.filter(isFavItem).length;
    if (!isOther && !favN && !A.favOnly) { bar.hidden = true; return; }
    bar.hidden = false;
    let html = `<button class="chip fav-chip ${A.favOnly ? 'active' : ''}" data-fav-only><svg class="i"><use href="#${A.favOnly ? 'i-heart-f' : 'i-heart'}"/></svg>Favoritos <small>${favN}</small></button>`;
    if (isOther) {
      const eps = A.series.flatMap((s) => s.episodes);
      const durs = eps.map(epDur).filter((d) => d != null);
      html += `<span class="seg-label">Duración:</span><button class="chip ${!A.durFilter ? 'active' : ''}" data-dur="">Todas</button>`
        + DUR_BUCKETS.map((b) => `<button class="chip ${A.durFilter === b.k ? 'active' : ''}" data-dur="${b.k}">${b.label} <small>${durs.filter(b.test).length}</small></button>`).join('');
      const pending = eps.filter((e) => epDur(e) == null && !e.durTried).length;
      if (pending) { html += `<span class="muted small dur-wait">Calculando duraciones… ${durs.length}/${eps.length}</span>`; loadDurations(); }
    }
    bar.innerHTML = html;
  }

  // aleatorio con semilla (la recomendación del día no cambia al recargar)
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  let recoShift = 0;
  let recoCache = null;
  function dailyPicks(n = 5) {
    const d = new Date();
    const key = d.toDateString() + '|' + recoShift + '|' + A.series.length;
    if (recoCache && recoCache.key === key) {
      const got = recoCache.ids.map(([sid, eid]) => { const ser = A.byId.get(sid); const ep = ser && ser.episodes.find((e) => e.id === eid); return ser && ep ? { s: ser, ep } : null; });
      if (got.every(Boolean)) return got;
    }
    const picks = computePicks(d, n);
    recoCache = { key, ids: picks.map((x) => [x.s.id, x.ep.id]) };
    return picks;
  }
  function computePicks(d, n) {
    const rnd = seededRandom(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + recoShift * 7919);
    const pool = A.series.filter((x) => x.episodes.length);
    // se prefieren series no terminadas
    const weighted = pool.map((x) => { const st = seriesStats(x); return { s: x, w: st.watched >= st.total ? 0.25 : 1, r: rnd() }; })
      .sort((a, b) => b.r * b.w - a.r * a.w);
    const picks = [];
    for (const { s: ser } of weighted) {
      if (picks.length >= n) break;
      const unwatched = ser.episodes.filter((e) => !(A.progress[e.path] || {}).w);
      const list = unwatched.length ? unwatched : ser.episodes;
      picks.push({ s: ser, ep: list[Math.floor(rnd() * list.length)] });
    }
    return picks;
  }
  function playRandomSeries() {
    const fresh = A.series.filter((x) => x.episodes.length && !seriesStats(x).lastTs);
    const pool = fresh.length ? fresh : A.series.filter((x) => x.episodes.length);
    if (!pool.length) return toast('Primero agrega una carpeta');
    const s = pool[Math.floor(Math.random() * pool.length)];
    toast(`🎲 Al azar: ${s.title}`, 3500);
    playEpisode(s, s.episodes[0], { startAt: 0 });
  }
  function epThumbStyle(ep, s) {
    const url = ep.thumb || '';
    return url ? `style="background-image:${cssUrl(url)}"` : '';
  }
  function progressBar(ep) {
    const p = A.progress[ep.path];
    if (!p || !p.d) return '';
    const pct = p.w ? 100 : clamp((p.t / p.d) * 100, 0, 100);
    return `<div class="bar"><i style="width:${pct}%"></i></div>`;
  }

  // ------------------------------------------------------------ INICIO
  function heroSeries() {
    if (!A.series.length) return null;
    let best = null, bestTs = 0;
    for (const s of A.series) { const st = seriesStats(s); if (st.lastTs > bestTs) { bestTs = st.lastTs; best = s; } }
    return best || [...A.series].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))[0];
  }
  function renderHome() {
    const empty = !A.series.length;
    $('#empty-state').hidden = !empty;
    if (empty) updateGroupChrome();
    $('#home-content').hidden = empty;
    if (empty) return;
    const s = heroSeries();
    const st = seriesStats(s);
    const tgt = resumeTarget(s);
    const p = A.progress[tgt.ep.path];
    const bg = s.backdrop || s.cover || (s.episodes[0] && s.episodes[0].thumb);
    $('#hero').innerHTML = `
      <div class="hero-bg ${s.backdrop ? '' : 'blurred'}" style="background-image:${cssUrl(bg)}"></div>
      <div class="hero-inner">
        <div class="hero-poster" style="${(s.cover || (s.episodes[0] && s.episodes[0].thumb)) ? 'background-image:' + cssUrl(s.cover || s.episodes[0].thumb) : 'background:' + hashGradient(s.title)}"></div>
        <div class="hero-txt">
          <div class="hero-tag"><span class="dot"></span>${st.lastTs ? 'Continuar viendo' : 'Recién agregado'}</div>
          <h1>${esc(s.title)}</h1>
          <div class="hero-meta"><span>${st.total} capítulos</span>${st.watched ? `<span>${st.watched} ${st.watched === 1 ? 'visto' : 'vistos'}</span>` : ''}${s.groups.filter(Boolean).length ? `<span>${s.groups.filter(Boolean).length} temporadas</span>` : ''}<span>${fmtSize(s.size)}</span></div>
          ${p && !p.w && p.d ? `<div class="hero-prog"><i style="width:${(p.t / p.d) * 100}%"></i></div>` : ''}
          <div class="hero-actions">
            <button class="btn primary big" data-play-series="${s.id}"><svg class="i"><use href="#i-play"/></svg>${tgt.fresh && !st.lastTs ? 'Ver desde el inicio' : 'Continuar ' + esc(epLabel(tgt.ep))}</button>
            <button class="btn glass big" data-open-series="${s.id}"><svg class="i"><use href="#i-list"/></svg>Capítulos</button>
          </div>
        </div>
      </div>`;
    // continuar viendo
    const items = [];
    for (const ser of A.series) {
      const sst = seriesStats(ser);
      if (!sst.lastTs) continue;
      if (sst.lastTs <= (A.settings[pk('continueClearedAt')] || 0)) continue;
      if (sst.lastTs <= ((A.settings[pk('continueHidden')] || {})[ser.id] || 0)) continue;
      const t = resumeTarget(ser);
      if (t.fresh && sst.watched === sst.total) continue;
      items.push({ s: ser, ep: t.ep, ts: sst.lastTs });
    }
    items.sort((a, b) => b.ts - a.ts);
    $('#continue-section').hidden = !items.length || A.settings.homeContinue === false;
    $('#continue-row').innerHTML = items.slice(0, 16).map(({ s: ser, ep }) => {
      const pp = A.progress[ep.path];
      return `<div class="continue-card" data-play-ep="${ep.id}" data-sid="${ser.id}">
        <div class="thumb" data-thumb="${ep.id}" style="background-image:${cssUrl(ep.thumb || ser.cover)}">
          <span class="ep-badge">${ep.num != null ? 'EP ' + ep.num : 'EP'}</span>
          ${pp && pp.d ? `<span class="dur-badge">${fmtTime(pp.d - pp.t)} restantes</span>` : ''}
          <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
          ${eyeBtn(ep, ser)}
          <button class="hide-btn" data-hide-continue="${ser.id}" title="Quitar de «Continuar viendo»"><svg class="i"><use href="#i-close"/></svg></button>
          ${progressBar(ep)}
        </div>
        <div class="cc-t">${esc(ser.title)}</div>
        <div class="cc-s">${esc(epLabel(ep))} · ${esc(ep.title)}</div>
      </div>`;
    }).join('');
    items.slice(0, 16).forEach(({ s: ser, ep }) => { if (!ep.thumb) Thumbs.request(ser, ep); });
    // favoritos: series/películas marcadas y videos sueltos marcados
    const favS = A.series.filter((x) => x.fav).sort((a, b) => (b.favAt || 0) - (a.favAt || 0));
    const favE = [];
    for (const ser of A.series) for (const ep of ser.episodes) if (ep.fav) favE.push({ s: ser, ep });
    $('#fav-section').hidden = A.settings.homeFav === false || (!favS.length && !favE.length);
    $('#fav-row').hidden = !favS.length;
    $('#fav-row').innerHTML = favS.map(posterHtml).join('');
    $('#fav-ep-row').hidden = !favE.length;
    $('#fav-ep-row').innerHTML = favE.slice(0, 40).map(({ s: ser, ep }) => vidCardHtml(ser, ep, 'fav')).join('');
    favE.slice(0, 40).forEach(({ s: ser, ep }) => { if (!ep.thumb) Thumbs.request(ser, ep); });
    const showReco = A.settings.dailyReco !== false && A.series.length > 0;
    $('#reco-section').hidden = !showReco;
    if (showReco) {
      const picks = dailyPicks(5);
      $('#reco-row').innerHTML = picks.map(({ s: ser, ep }, i) => `<div class="reco-card" data-play-ep="${ep.id}" data-sid="${ser.id}" style="animation-delay:${i * 60}ms">
          <div class="thumb" data-thumb="${ep.id}" style="background-image:${cssUrl(ep.thumb || ser.cover)}">
            <span class="ep-badge">${ep.num != null ? 'EP ' + ep.num : 'EP'}</span>
            <span class="reco-n">${i + 1}</span>
            <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
            ${eyeBtn(ep, ser)}
            ${progressBar(ep)}
          </div>
          <div class="reco-info">
            ${ser.cover ? `<img src="${esc(ser.cover)}" alt="">` : ''}
            <div><div class="cc-t">${esc(ser.title)}</div><div class="cc-s">${esc(epLabel(ep))}${ser.web && ser.web.genresEs && ser.web.genresEs.length ? ' · ' + esc(ser.web.genresEs.slice(0, 2).join(', ')) : ''}</div></div>
          </div>
        </div>`).join('');
      picks.forEach(({ s: ser, ep }) => { if (!ep.thumb) Thumbs.request(ser, ep); });
    }
    const fresh = [];
    for (const ser of A.series) for (const e of ser.episodes) if (e.isNew) fresh.push({ s: ser, ep: e });
    fresh.sort((a, b) => b.ep.addedAt - a.ep.addedAt || (a.ep.num || 0) - (b.ep.num || 0));
    $('#new-section').hidden = !fresh.length || A.settings.homeNew === false;
    $('#new-row').innerHTML = fresh.slice(0, 20).map(({ s: ser, ep }) => `<div class="continue-card" data-play-ep="${ep.id}" data-sid="${ser.id}">
        <div class="thumb" data-thumb="${ep.id}" style="background-image:${cssUrl(ep.thumb || ser.cover)}">
          <span class="ep-badge">${ep.num != null ? 'EP ' + ep.num : 'EP'}</span><span class="ep-new">NUEVO</span>
          <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
          ${eyeBtn(ep, ser)}
        </div>
        <div class="cc-t">${esc(ser.title)}</div>
        <div class="cc-s">${esc(epLabel(ep))} · agregado ${fmtAgo(ep.addedAt)}</div>
      </div>`).join('');
    fresh.slice(0, 20).forEach(({ s: ser, ep }) => { if (!ep.thumb) Thumbs.request(ser, ep); });
    const recent = [...A.series].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 18);
    $('#recent-row').innerHTML = recent.map(posterHtml).join('');
    $('#recent-section').hidden = A.settings.homeRecent === false;
  }

  // ------------------------------------------------------------ PERFILES
  // «Continuar viendo» se oculta/limpia por perfil (el perfil principal usa las claves de siempre)
  function pk(k) { return A.profiles.length && A.profile !== A.profiles[0].id ? `${k}@${A.profile}` : k; }
  function curProfile() { return A.profiles.find((p) => p.id === A.profile) || A.profiles[0] || { name: '?', color: '#a855f7' }; }
  function renderAvatar() {
    const p = curProfile(); const b = $('#btn-profile');
    b.textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    b.style.setProperty('--pc', p.color);
    b.title = `Perfil: ${p.name} (clic para cambiar)`;
  }
  async function switchProfile(id) {
    if (id === A.profile) return;
    if (Player.state.ep) { Player.saveProgress(true); Player.close(); }
    await new Promise((r) => setTimeout(r, 50));
    const res = await window.cinema.switchProfile(id);
    if (!res) return;
    A.profile = res.activeProfile; A.progress = res.progress || {};
    recoCache = null;
    markNew(); renderAvatar(); renderAll();
    toast(`Perfil: ${esc(curProfile().name)}`);
  }
  function profileMenu(ev) {
    const r = ev.currentTarget.getBoundingClientRect();
    ctxMenu(r.right - 240, r.bottom + 8, [
      ...A.profiles.map((p) => ({ icon: p.id === A.profile ? 'i-check' : 'i-eye-off', label: p.name + (p.id === A.profile ? '  (actual)' : ''), action: () => switchProfile(p.id) })),
      '-',
      { icon: 'i-edit', label: 'Administrar perfiles...', action: openProfiles },
    ]);
  }
  function openProfiles() {
    let list = A.profiles.map((p) => ({ ...p }));
    const draw = () => {
      openModal(`<h2>Perfiles</h2>
        <p class="sub">Cada perfil tiene su propio progreso, capítulos vistos y «Continuar viendo». La biblioteca, los grupos y los ajustes son compartidos.</p>
        <div class="prof-list">${list.map((p, i) => `<div class="prof-row ${p.id === A.profile ? 'cur' : ''}"><span class="avatar" style="--pc:${p.color}">${esc((p.name || '?').charAt(0).toUpperCase())}</span>
          <input type="text" class="sel" data-pf-name="${i}" value="${esc(p.name)}" maxlength="24" spellcheck="false">
          <div class="g-colors">${GROUP_COLORS.slice(0, 6).map((c) => `<button class="${p.color === c ? 'on' : ''}" data-pf-color="${i}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
          ${list.length > 1 ? `<button class="icon-btn" data-pf-del="${i}" title="Eliminar perfil y su progreso"><svg class="i"><use href="#i-trash"/></svg></button>` : ''}</div>`).join('')}</div>
        <div class="set-actions" style="margin-top:12px"><button class="btn glass" id="pf-add"><svg class="i"><use href="#i-plus"/></svg>Agregar perfil</button></div>
        <div class="modal-actions"><button class="btn glass" data-close>Cancelar</button><button class="btn primary" id="pf-save">Guardar</button></div>`);
      $$('[data-pf-name]').forEach((inp) => inp.oninput = () => { list[+inp.dataset.pfName].name = inp.value; });
      $$('[data-pf-color]').forEach((b) => b.onclick = () => { list[+b.dataset.pfColor].color = b.dataset.c; draw(); });
      $$('[data-pf-del]').forEach((b) => b.onclick = async () => {
        const p = list[+b.dataset.pfDel];
        if (!await confirmBox({ title: `Eliminar el perfil «${p.name}»`, danger: true, ok: 'Eliminar', html: '<p>Se borra su progreso y sus capítulos vistos. Los demás perfiles no cambian.</p>' })) return;
        list.splice(+b.dataset.pfDel, 1); draw();
      });
      $('#pf-add').onclick = () => { if (list.length >= 12) return; list.push({ id: 'p' + randomGroupId().slice(1), name: `Perfil ${list.length + 1}`, color: GROUP_COLORS[list.length % 6] }); draw(); };
      $('#pf-save').onclick = async () => {
        const res = await window.cinema.saveProfiles(list);
        A.profiles = res.profiles;
        if (res.activeProfile !== A.profile) { A.profile = null; await switchProfile(res.activeProfile); }
        renderAvatar(); closeModal(); toast('Perfiles guardados');
      };
    };
    draw();
  }

  // ------------------------------------------------------------ ACTUALIZACIONES
  async function checkUpdates(manual) {
    let u;
    try { u = await window.cinema.updateCheck(); } catch (e) { if (manual) toast('No se pudo revisar: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 4500); return; }
    if (!u.available) { if (manual) toast(`Tienes la última versión (${esc(u.current)})`); return; }
    if (!manual && A.settings.skipVersion === u.latest) return;
    if (manual) return openUpdate(u);
    let pill = $('#update-pill');
    if (!pill) { pill = document.createElement('div'); pill.id = 'update-pill'; pill.className = 'update-pill glass'; document.body.appendChild(pill); }
    pill.innerHTML = `<svg class="i"><use href="#i-star"/></svg><span>Nueva versión <b>${esc(u.latest)}</b> disponible</span><button class="btn primary" id="up-see">Ver novedades</button><button class="icon-btn" id="up-x" title="Ahora no"><svg class="i"><use href="#i-close"/></svg></button>`;
    $('#up-see').onclick = () => { pill.remove(); openUpdate(u); };
    $('#up-x').onclick = () => pill.remove();
  }
  function openUpdate(u) {
    openModal(`<h2>Kuro Player ${esc(u.latest)}</h2>
      <p class="sub">Tienes la ${esc(u.current)}. Novedades de esta versión:</p>
      <div class="upd-notes">${esc(u.notes || 'Sin notas.')}</div>
      <div class="upd-bar" id="up-bar" hidden><i></i></div>
      <div class="modal-actions"><button class="btn glass" id="up-skip" style="margin-right:auto">Omitir esta versión</button><button class="btn glass" id="up-web">Ver en GitHub</button>
        ${u.asset ? `<button class="btn primary" id="up-go"><svg class="i"><use href="#i-refresh"/></svg>Descargar e instalar (${fmtSize(u.asset.size)})</button>` : ''}</div>`);
    $('#up-skip').onclick = () => { saveSettings({ skipVersion: u.latest }); closeModal(); };
    $('#up-web').onclick = () => window.cinema.openUrl(u.url);
    if ($('#up-go')) $('#up-go').onclick = async () => {
      const b = $('#up-go'); b.disabled = true; b.textContent = 'Descargando...';
      $('#up-bar').hidden = false;
      try {
        await window.cinema.updateDownload(u.asset.url, u.asset.name);
        b.textContent = 'Instalando...';
        if (Player.state.ep) Player.saveProgress(true);
        await window.cinema.updateInstall();
      } catch (e) { b.disabled = false; b.textContent = 'Reintentar'; toast('Error al descargar: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 5000); }
    };
  }
  window.cinema.onUpdateProgress((d) => { const i = $('#up-bar i'); if (i && d.total) i.style.width = (d.got / d.total) * 100 + '%'; });

  // ------------------------------------------------------------ TEMA Y COLORES
  const ACCENTS = {
    violeta: { name: 'Violeta', c: ['168, 85, 247', '34, 211, 238', '99, 102, 241'] },
    rosa: { name: 'Rosa', c: ['236, 72, 153', '167, 139, 250', '244, 63, 94'] },
    azul: { name: 'Azul', c: ['59, 130, 246', '34, 211, 238', '99, 102, 241'] },
    cian: { name: 'Cian', c: ['6, 182, 212', '52, 211, 153', '59, 130, 246'] },
    verde: { name: 'Verde', c: ['16, 185, 129', '163, 230, 53', '20, 184, 166'] },
    naranja: { name: 'Naranja', c: ['249, 115, 22', '250, 204, 21', '239, 68, 68'] },
    rojo: { name: 'Rojo', c: ['244, 63, 94', '251, 146, 60', '236, 72, 153'] },
    oro: { name: 'Dorado', c: ['234, 179, 8', '251, 146, 60', '217, 119, 6'] },
  };
  function hexRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((x) => Math.round(x * 255));
  }
  // a partir de un color se arman los tres tonos del degradado
  function paletteFrom(rgb) {
    const [h, s, l] = rgbHsl(rgb);
    const S = Math.max(0.55, s), L = Math.min(0.62, Math.max(0.5, l));
    return [hslRgb(h, S, L), hslRgb(h + 70, S, 0.55), hslRgb(h - 35, S, 0.58)].map((c) => c.join(', '));
  }
  let coverAccentUrl = '';
  function setAccentVars(c) {
    const st = document.documentElement.style;
    st.setProperty('--a1', c[0]); st.setProperty('--a2', c[1]); st.setProperty('--a4', c[2]); st.setProperty('--a3', c[0]);
  }
  function baseAccent() {
    const acc = A.settings.accent || 'violeta';
    return /^#[0-9a-f]{6}$/i.test(acc) ? paletteFrom(hexRgb(acc)) : (ACCENTS[acc] || ACCENTS.violeta).c;
  }
  // color de acento a partir de la portada (si está activado)
  function coverAccent(s) {
    if (!A.settings.accentFromCover) return;
    const url = s && (s.cover || (s.episodes[0] && s.episodes[0].thumb));
    if (!url) { coverAccentUrl = ''; setAccentVars(baseAccent()); return; }
    if (url === coverAccentUrl) return;
    coverAccentUrl = url;
    const img = new Image();
    img.onload = () => {
      if (coverAccentUrl !== url) return;
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; const bk = {};
        for (let i = 0; i < d.length; i += 4) {
          const [h, sat, l] = rgbHsl([d[i], d[i + 1], d[i + 2]]);
          if (l < 0.18 || l > 0.9 || sat < 0.25) continue;
          const k = Math.round(h / 20); const w = sat * sat;
          (bk[k] = bk[k] || { w: 0, r: 0, g: 0, b: 0 }); bk[k].w += w; bk[k].r += d[i] * w; bk[k].g += d[i + 1] * w; bk[k].b += d[i + 2] * w;
        }
        const best = Object.values(bk).sort((a, b) => b.w - a.w)[0];
        setAccentVars(best ? paletteFrom([best.r / best.w, best.g / best.w, best.b / best.w]) : baseAccent());
      } catch (e) { setAccentVars(baseAccent()); }
    };
    img.src = url;
  }
  const sysLight = matchMedia('(prefers-color-scheme: light)');
  sysLight.addEventListener('change', () => { if ((A.settings.theme || 'dark') === 'system') applyTheme(); });
  // Uso de la GPU: se detecta la tarjeta gráfica y se elige cuánto «cristal» y animación se puede permitir
  let gpuInfo = null;
  function detectGpu() {
    if (gpuInfo) return gpuInfo;
    let name = '';
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl');
      if (g) {
        const ext = g.getExtension('WEBGL_debug_renderer_info');
        name = String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
        const lose = g.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (e) { /* */ }
    const clean = name.replace(/^ANGLE \(|\)$/g, '').replace(/,? ?Direct3D.*$|,? ?D3D1\d.*$|,? ?OpenGL.*$|,? ?vs_\d.*$/i, '').replace(/^(Intel|NVIDIA|AMD|Google|Microsoft),\s*/i, '').replace(/\s*\(0x[0-9A-F]+\)/gi, '').trim();
    let tier = 'balanced';
    if (!name || /swiftshader|llvmpipe|basic render|software|microsoft basic/i.test(name)) tier = 'eco';
    else if (/nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|radeon r9|arc\(tm\) a\d|arc a\d|\brx \d/i.test(name)) tier = 'quality';
    gpuInfo = { name: clean || name || '—', tier };
    return gpuInfo;
  }
  const GPU_LABELS = { quality: 'Calidad máxima', balanced: 'Equilibrado', eco: 'Ahorro' };
  function gpuMode() {
    const m = A.settings.gpuMode || 'auto';
    return m === 'auto' ? detectGpu().tier : m;
  }
  function applyTheme() {
    const st = A.settings;
    const theme = st.theme || 'dark';
    const light = theme === 'light' || (theme === 'system' && sysLight.matches);
    const b = document.body.classList;
    b.toggle('theme-light', light);
    b.toggle('theme-oled', theme === 'oled');
    b.toggle('perf', !!st.perfMode);
    const gm = gpuMode();
    b.toggle('gpu-balanced', gm === 'balanced');
    b.toggle('gpu-eco', gm === 'eco');
    b.toggle('no-bganim', st.bgAnim === false);
    const root = document.documentElement.style;
    const g = st.glassLevel == null ? 50 : st.glassLevel, bl = st.blurLevel == null ? 50 : st.blurLevel;
    // sin desenfoque (ahorro) los paneles necesitan algo más de opacidad para leerse igual de bien
    root.setProperty('--gk', ((0.3 + (g / 100) * 1.4) * (gm === 'eco' ? 1.35 : 1)).toFixed(2));
    root.setProperty('--bk', (bl / 50).toFixed(2));
    coverAccentUrl = '';
    setAccentVars(baseAccent());
    if (st.accentFromCover) coverAccent(A.view === 'player' ? Player.state.series : A.view === 'series' ? A.currentSeries : null);
    const bg = $('#amb-custom');
    b.toggle('has-bg', !!st.bgImage);
    if (bg) { bg.style.backgroundImage = st.bgImage ? cssUrl(st.bgImage) : 'none'; root.setProperty('--bg-op', ((st.bgOpacity == null ? 45 : st.bgOpacity) / 100).toFixed(2)); }
    window.cinema.setZoom(st.uiScale || 1);
    window.cinema.setWinTheme(light);
    b.toggle('no-rail', st.showRail === false);
  }

  // ------------------------------------------------------------ GRUPOS
  const GROUP_TYPES = {
    anime: { label: 'Anime', one: 'serie', many: 'series', web: 'AniList / MyAnimeList / Kitsu', hint: 'Series y películas de anime' },
    series: { label: 'Series', one: 'serie', many: 'series', web: 'TVmaze / Wikipedia', hint: 'Series de TV y dramas' },
    movies: { label: 'Películas', one: 'película', many: 'películas', web: 'Wikipedia', hint: 'Cada video suelto es una película' },
    other: { label: 'Otros', one: 'título', many: 'títulos', web: '', hint: 'Videos personales, clases, etc.' },
  };
  const GROUP_ICONS = ['anime', 'film', 'tv', 'heart', 'smile', 'bolt', 'folder', 'music', 'game', 'book', 'kids', 'globe'];
  const GROUP_COLORS = ['#a855f7', '#6366f1', '#22d3ee', '#34d399', '#f59e0b', '#f43f5e', '#ec4899', '#94a3b8'];
  function curGroup() { return A.groups.find((g) => g.id === A.group) || A.groups[0] || { id: null, name: 'Biblioteca', type: 'anime', icon: 'folder', color: '#a855f7', roots: [] }; }
  function groupOf(s) { return A.groups.find((g) => g.id === s.groupId) || curGroup(); }
  function groupNoun(n, g = curGroup()) { const t = GROUP_TYPES[g.type] || GROUP_TYPES.other; return n === 1 ? t.one : t.many; }
  function applyGroupFilter() {
    const g = curGroup();
    A.series = A.allSeries.filter((s) => s.groupId === g.id);
  }
  function setGroup(id) {
    if (id === A.group || !A.groups.some((g) => g.id === id)) return;
    A.group = id;
    saveSettings({ activeGroup: id });
    A.letter = 'all'; A.genre = null; A.selecting = false; A.selected.clear(); A.favOnly = false; A.durFilter = null;
    applyGroupFilter();
    renderRail(); updateGroupChrome();
    if (A.view === 'series' || A.view === 'player') go('home');
    else { renderCurrent(); if (A.view === 'home') setAmbient(heroSeries()); }
    const v = $('#view-' + A.view); if (v) v.scrollTop = 0;
  }
  // Kuro (el oso de la esquina): un haz de luz recorre su contorno mientras algo se está procesando
  const Busy = (() => {
    const tasks = new Map();
    let timer = 0;
    function paint() {
      const el = $('#kuro-bear');
      if (!el) return;
      el.classList.toggle('busy', tasks.size > 0);
      el.title = tasks.size ? 'Kuro está trabajando: ' + [...tasks.values()].join(' · ') : 'Kuro: todo listo';
    }
    function set(key, label) {
      tasks.set(key, label);
      clearTimeout(timer); paint();
    }
    // al terminar se espera un momento, para que el haz no parpadee entre tareas seguidas
    function clear(key) {
      if (!tasks.delete(key)) return;
      clearTimeout(timer); timer = setTimeout(paint, 600);
    }
    return { set, clear };
  })();
  function renderRail() {
    const rail = $('#rail');
    if (!rail) return;
    const counts = new Map();
    for (const s of A.allSeries) counts.set(s.groupId, (counts.get(s.groupId) || 0) + 1);
    rail.innerHTML = A.groups.map((g) => {
      const n = counts.get(g.id) || 0;
      return `<button class="rail-item ${g.id === A.group ? 'active' : ''}" data-rail-group="${g.id}" style="--gc:${g.color}" title="${esc(g.name)} · ${n} ${groupNoun(n, g)} (clic derecho para opciones)">
        <span class="rail-ico"><svg class="i"><use href="#i-g-${esc(g.icon)}"/></svg></span><b>${esc(g.name)}</b>${n ? `<small>${n}</small>` : ''}</button>`;
    }).join('') + `<button class="rail-item add" data-rail-new title="Crear un grupo nuevo (películas, series, etc.)"><span class="rail-ico"><svg class="i"><use href="#i-plus"/></svg></span><b>Nuevo</b></button>`;
    document.body.classList.toggle('no-rail', A.settings.showRail === false);
  }
  function updateGroupChrome() {
    const g = curGroup();
    const t = GROUP_TYPES[g.type] || GROUP_TYPES.other;
    $('#search').placeholder = `Buscar en ${g.name}...`;
    const empty = !A.allSeries.length && A.groups.length <= 1;
    $('#empty-title').textContent = empty ? 'Tu videoteca está vacía' : `«${g.name}» está vacío`;
    $('#empty-text').textContent = g.type === 'movies'
      ? 'Agrega la carpeta donde guardas tus películas. Cada video suelto (o cada subcarpeta) se convierte en una película de la cartelera.'
      : `Agrega la carpeta donde guardas tus ${t.many === 'títulos' ? 'videos' : g.type === 'anime' ? 'animes' : t.many}. Cada subcarpeta se convertirá en una tarjeta de la cartelera y sus videos en capítulos.`;
    $('#btn-add-folder-empty span').textContent = `Agregar carpeta a «${g.name}»`;
  }
  async function saveGroups(list) {
    const res = await window.cinema.saveGroups(list);
    A.groups = res.groups; A.roots = res.roots;
    if (!A.groups.some((g) => g.id === A.group)) A.group = A.groups[0] && A.groups[0].id;
    applyGroupFilter(); renderRail(); updateGroupChrome();
  }
  function randomGroupId() { const b = new Uint8Array(4); crypto.getRandomValues(b); return 'g' + [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  function openGroupEditor(g, after) {
    const isNew = !g;
    const d = g ? { ...g } : { id: randomGroupId(), name: '', icon: 'film', color: GROUP_COLORS[A.groups.length % GROUP_COLORS.length], type: 'movies', web: true, roots: [] };
    const draw = () => {
      openModal(`<h2>${isNew ? 'Nuevo grupo' : 'Editar grupo'}</h2>
        <p class="sub">Los grupos separan tu biblioteca (por ejemplo Anime, Películas, Series). Cada uno aparece en el menú de la izquierda con sus propias carpetas.</p>
        <div class="field"><label>Nombre</label><input type="text" id="ge-name" value="${esc(d.name)}" placeholder="Ej: Películas, Series, Clases..." maxlength="40" spellcheck="false"></div>
        <div class="field"><label>Tipo de contenido</label><div class="g-types">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="${d.type === k ? 'on' : ''}" data-ge-type="${k}"><b>${t.label}</b><span>${t.hint}</span></button>`).join('')}</div></div>
        <div class="field"><label>Ícono</label><div class="g-icons" style="--gsel:${d.color}">${GROUP_ICONS.map((ic) => `<button class="${d.icon === ic ? 'on' : ''}" data-ge-icon="${ic}"><svg class="i"><use href="#i-g-${ic}"/></svg></button>`).join('')}</div></div>
        <div class="field"><label>Color</label><div class="g-colors">${GROUP_COLORS.map((c) => `<button class="${d.color === c ? 'on' : ''}" data-ge-color="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="ge-color" value="${d.color}" title="Otro color"></div></div>
        <label class="switch"><input type="checkbox" id="ge-web" ${d.web ? 'checked' : ''} ${d.type === 'other' ? 'disabled' : ''}><span></span>Buscar datos en internet para este grupo${GROUP_TYPES[d.type].web ? ` (${GROUP_TYPES[d.type].web})` : ''}</label>
        <div class="modal-actions">${!isNew && A.groups.length > 1 ? '<button class="btn glass danger" id="ge-del" style="margin-right:auto"><svg class="i"><use href="#i-trash"/></svg>Eliminar grupo</button>' : ''}<button class="btn glass" data-close>Cancelar</button><button class="btn primary" id="ge-save">${isNew ? 'Crear grupo' : 'Guardar'}</button></div>`);
      const nameIn = $('#ge-name');
      nameIn.oninput = () => { d.name = nameIn.value; };
      $$('[data-ge-type]').forEach((b) => b.onclick = () => {
        const prev = d.type; d.type = b.dataset.geType;
        if (d.type === 'other') d.web = false; else if (prev === 'other') d.web = true;
        if (isNew && !d.name.trim()) d.icon = { anime: 'anime', movies: 'film', series: 'tv', other: 'folder' }[d.type];
        draw();
      });
      $$('[data-ge-icon]').forEach((b) => b.onclick = () => { d.icon = b.dataset.geIcon; draw(); });
      $$('[data-ge-color]').forEach((b) => b.onclick = () => { d.color = b.dataset.geColor; draw(); });
      $('#ge-color').onchange = (e) => { d.color = e.target.value; draw(); };
      $('#ge-web').onchange = (e) => { d.web = e.target.checked; };
      if ($('#ge-del')) $('#ge-del').onclick = () => deleteGroup(g, after);
      $('#ge-save').onclick = async () => {
        d.name = nameIn.value.trim() || GROUP_TYPES[d.type].label;
        const list = isNew ? [...A.groups, d] : A.groups.map((x) => (x.id === d.id ? { ...x, ...d } : x));
        await saveGroups(list);
        closeModal();
        if (isNew) {
          setGroup(d.id);
          toast(`Grupo «${esc(d.name)}» creado. Agrega sus carpetas.`, 4000);
          if (!after) { await addFolders(d.id); }
        } else { await scan(true); toast('Grupo actualizado'); }
        if (after) after();
      };
      nameIn.focus();
    };
    draw();
  }
  async function deleteGroup(g, after) {
    if (A.groups.length <= 1) return toast('Debe quedar al menos un grupo');
    const n = A.allSeries.filter((s) => s.groupId === g.id).length;
    const ok = await confirmBox({ title: `Eliminar el grupo «${g.name}»`, danger: true, ok: 'Eliminar grupo',
      html: `<p>Se quitan del programa el grupo y sus ${g.roots.length} carpeta${g.roots.length === 1 ? '' : 's'} (${n} ${groupNoun(n, g)}). <b>Tus videos no se borran</b>; puedes volver a agregarlos en otro grupo.</p>` });
    if (!ok) return;
    if (Player.state.series && Player.state.series.groupId === g.id) Player.close();
    await saveGroups(A.groups.filter((x) => x.id !== g.id));
    closeModal();
    await scan(true);
    toast(`Grupo «${esc(g.name)}» eliminado`);
    if (after) after();
  }
  function groupMenu(g, x, y) {
    if (!g) return;
    const i = A.groups.indexOf(g);
    const move = async (dir) => { const list = [...A.groups]; list.splice(i, 1); list.splice(i + dir, 0, g); await saveGroups(list); };
    ctxMenu(x, y, [
      { icon: 'i-plus', label: 'Agregar carpeta a este grupo...', action: async () => { setGroup(g.id); await addFolders(g.id); } },
      { icon: 'i-edit', label: 'Editar grupo (nombre, ícono, tipo)...', action: () => openGroupEditor(g) },
      ...(g.web ? [{ icon: 'i-globe', label: 'Cargar datos de internet de este grupo', action: () => startWebFetch({ onlyMissing: true, groupId: g.id }) }] : []),
      '-',
      ...(i > 0 ? [{ icon: 'i-chev-l', label: 'Subir en el menú', action: () => move(-1) }] : []),
      ...(i < A.groups.length - 1 ? [{ icon: 'i-chev-r', label: 'Bajar en el menú', action: () => move(1) }] : []),
      ...(A.groups.length > 1 ? [{ icon: 'i-trash', label: 'Eliminar grupo...', action: () => deleteGroup(g) }] : []),
    ]);
  }

  // ------------------------------------------------------------ CARTELERA
  const LETTERS = ['all', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  function firstLetter(t) {
    const c = t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }
  function renderLibrary() {
    const q = $('#search').value.trim().toLowerCase();
    const present = new Set(A.series.map((s) => firstLetter(s.title)));
    $('#letters').innerHTML = LETTERS.map((l) => `<button data-letter="${l}" class="${A.letter === l ? 'active' : ''}" ${l !== 'all' && !present.has(l) ? 'disabled' : ''}>${l === 'all' ? 'Todo' : l}</button>`).join('');
    const sort = A.settings.sort || 'az';
    $$('#sort-seg button').forEach((b) => b.classList.toggle('active', b.dataset.sort === sort));
    const lview = A.settings.libraryView || 'grid';
    $$('#view-seg button').forEach((b) => b.classList.toggle('active', b.dataset.lview === lview));
    $('#size-seg').hidden = lview === 'list';
    const size = A.settings.cardSize || 'm';
    $$('#size-seg button').forEach((b) => b.classList.toggle('active', b.dataset.size === size));
    const grid = $('#poster-grid');
    grid.className = lview === 'list' ? 'list-grid' : 'poster-grid ' + size;
    renderLibFilters();
    renderGenreBar();
    grid.classList.toggle('selecting', A.selecting);
    $('#btn-select').classList.toggle('active', A.selecting);
    let list = A.series.filter((s) => (A.letter === 'all' || firstLetter(s.title) === A.letter));
    if (A.genre) list = list.filter((s) => genresOf(s).includes(A.genre));
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.folderName.toLowerCase().includes(q)
      || altTitles(s).some((t) => t.toLowerCase().includes(q)) || genresOf(s).some((g) => g.toLowerCase().includes(q))
      || s.episodes.some((e) => e.name.toLowerCase().includes(q)));
    if (A.favOnly) list = list.filter(isFavItem);
    const col = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    const favNote = A.favOnly ? ` · <b>favoritos</b> <button class="link-btn" data-fav-only>quitar filtro</button>` : '';
    // filtro por duración: se muestran los videos sueltos que caen en ese rango
    const bucket = A.durFilter && DUR_BUCKETS.find((b) => b.k === A.durFilter);
    if (bucket) {
      const vids = [];
      for (const s of list) for (const ep of s.episodes) {
        const d = epDur(ep);
        if (d == null || !bucket.test(d)) continue;
        if (A.favOnly && !s.fav && !ep.fav) continue;
        if (q && !ep.name.toLowerCase().includes(q) && !s.title.toLowerCase().includes(q)) continue;
        vids.push({ s, ep });
      }
      if (sort === 'recent') vids.sort((a, b) => (b.ep.addedAt || 0) - (a.ep.addedAt || 0));
      else if (sort === 'az') vids.sort((a, b) => col.compare(a.ep.title, b.ep.title));
      else vids.sort((a, b) => epDur(a.ep) - epDur(b.ep));
      $('#lib-count').innerHTML = `${vids.length} ${vids.length === 1 ? 'video' : 'videos'} · ${bucket.label} <button class="link-btn" data-dur="">quitar filtro</button>${favNote}`;
      A.visibleIds = [];
      renderSelBar();
      grid.className = 'vid-grid';
      grid.innerHTML = vids.length ? vids.map(({ s, ep }) => vidCardHtml(s, ep)).join('')
        : `<div class="muted" style="grid-column:1/-1;padding:40px;text-align:center">${A.durLoading ? 'Calculando duraciones…' : 'No hay videos de esa duración.'}</div>`;
      vids.slice(0, 150).forEach(({ s, ep }) => { if (!ep.thumb) Thumbs.request(s, ep); });
      return;
    }
    if (sort === 'az') list.sort((a, b) => col.compare(a.title, b.title));
    if (sort === 'recent') list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    if (sort === 'watched') list.sort((a, b) => seriesStats(b).lastTs - seriesStats(a).lastTs);
    if (sort === 'count') list.sort((a, b) => b.episodes.length - a.episodes.length);
    if (sort === 'score') list.sort((a, b) => ((b.web && b.web.score) || 0) - ((a.web && a.web.score) || 0));
    if (sort === 'year') list.sort((a, b) => ((b.web && b.web.year) || 0) - ((a.web && a.web.year) || 0));
    $('#lib-count').innerHTML = `${list.length} ${groupNoun(list.length)}${q ? ` · búsqueda «${esc($('#search').value.trim())}»` : ''}${A.genre ? ` · género <b>«${esc(A.genre)}»</b> <button class="link-btn" data-genre-clear>quitar filtro</button>` : ''}${favNote}`;
    A.visibleIds = list.map((x) => x.id);
    renderSelBar();
    grid.innerHTML = list.length ? list.map(lview === 'list' ? listCardHtml : posterHtml).join('')
      : `<div class="muted" style="grid-column:1/-1;padding:40px;text-align:center">${A.series.length ? 'Nada coincide con el filtro.' : 'Agrega una carpeta para llenar la cartelera.'}</div>`;
  }

  function renderGenreBar() {
    const bar = $('#genre-bar');
    const counts = new Map();
    for (const x of A.series) for (const g of genresOf(x)) counts.set(g, (counts.get(g) || 0) + 1);
    if (!counts.size) { bar.hidden = true; return; }
    bar.hidden = false;
    const customs = new Set(allCustomCategories().map(([g]) => g));
    const sorted = [...counts.entries()].sort((a, b) => (customs.has(b[0]) - customs.has(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    const LIMIT = 16;
    let shown = A.genreExpand ? sorted : sorted.slice(0, LIMIT);
    if (A.genre && !shown.some(([g]) => g === A.genre)) shown = [...shown, [A.genre, counts.get(A.genre) || 0]];
    bar.innerHTML = `<span class="seg-label">Géneros:</span>
      <button class="chip ${!A.genre ? 'active' : ''}" data-genre-clear>Todos</button>
      ${shown.map(([g, n]) => `<button class="chip ${customs.has(g) ? 'custom' : ''} ${A.genre === g ? 'active' : ''}" data-genre="${esc(g)}">${customs.has(g) ? '★ ' : ''}${esc(g)} <small>${n}</small></button>`).join('')}
      ${sorted.length > LIMIT ? `<button class="chip ghost" data-genre-expand>${A.genreExpand ? 'Ver menos' : `Ver todos (${sorted.length})`}</button>` : ''}`;
  }
  function renderSelBar() {
    let bar = $('#sel-bar');
    if (!A.selecting || A.view !== 'library') { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'sel-bar'; bar.className = 'sel-bar glass'; document.body.appendChild(bar); }
    const n = A.selected.size;
    bar.innerHTML = `<b>${n}</b><span>${n === 1 ? 'serie seleccionada' : 'series seleccionadas'}</span>
      <button class="btn glass" data-sel-all>Seleccionar todas las visibles</button>
      <button class="btn primary" data-cat-add ${n ? '' : 'disabled'}><svg class="i"><use href="#i-plus"/></svg>Agregar categoría</button>
      <button class="btn glass" data-cat-remove ${n ? '' : 'disabled'}><svg class="i"><use href="#i-close"/></svg>Quitar categoría</button>
      <button class="btn glass" data-sel-cancel>Listo</button>`;
  }
  function setSelecting(on) {
    A.selecting = on;
    if (!on) A.selected.clear();
    renderLibrary();
  }
  async function saveCategories(list, fn) {
    for (const x of list) {
      const next = fn([...(x.customGenres || [])]);
      x.customGenres = [...new Set(next.map((g) => g.trim()).filter(Boolean))];
      await window.cinema.setMeta(x.id, { customGenres: x.customGenres });
    }
    renderAll();
  }
  function openCategoryModal(list, mode) {
    const cats = allCustomCategories();
    if (mode === 'remove') {
      const present = new Map();
      for (const x of list) for (const g of x.customGenres || []) present.set(g, (present.get(g) || 0) + 1);
      openModal(`<h2>Quitar categoría</h2><p class="sub">${list.length} ${list.length === 1 ? 'serie' : 'series'} seleccionadas. Elige qué categoría propia quitarles.</p>
        <div class="chips">${present.size ? [...present.entries()].map(([g, n]) => `<button class="chip custom" data-cat-do-remove="${esc(g)}">★ ${esc(g)} <small>${n}</small> ✕</button>`).join('') : '<span class="muted small">Estas series no tienen categorías propias.</span>'}</div>
        <p class="hint muted small" style="margin-top:12px">Los géneros de internet no se pueden quitar; solo las categorías que creaste tú.</p>
        <div class="modal-actions"><button class="btn glass" data-close>Cerrar</button></div>`);
      $$('[data-cat-do-remove]').forEach((b) => b.onclick = async () => {
        const g = b.dataset.catDoRemove;
        await saveCategories(list, (arr) => arr.filter((x) => x !== g));
        closeModal(); toast(`Categoría «${g}» quitada de ${list.length} series`);
      });
      return;
    }
    openModal(`<h2>Agregar categoría</h2><p class="sub">${list.length === 1 ? `«${esc(list[0].title)}»` : `${list.length} series seleccionadas`}. Escribe una categoría nueva o elige una existente.</p>
      <div class="search-row field"><input type="text" id="cat-name" placeholder="Ej: Favoritos, Para ver con amigos, Isekai top..." spellcheck="false"><button class="btn primary" id="cat-go"><svg class="i"><use href="#i-plus"/></svg>Agregar</button></div>
      ${cats.length ? `<div class="field"><label>Categorías existentes</label><div class="chips">${cats.map(([g, n]) => `<button class="chip custom" data-cat-pick="${esc(g)}">★ ${esc(g)} <small>${n}</small></button>`).join('')}</div></div>` : ''}
      <div class="modal-actions"><button class="btn glass" data-close>Cancelar</button></div>`);
    const apply = async (g) => {
      g = String(g || '').trim().slice(0, 40);
      if (!g) return toast('Escribe un nombre de categoría');
      await saveCategories(list, (arr) => [...arr, g]);
      closeModal();
      toast(`Categoría «${g}» agregada a ${list.length} ${list.length === 1 ? 'serie' : 'series'}`);
    };
    $('#cat-name').focus();
    $('#cat-go').onclick = () => apply($('#cat-name').value);
    $('#cat-name').onkeydown = (e) => { if (e.key === 'Enter') apply($('#cat-name').value); };
    $$('[data-cat-pick]').forEach((b) => b.onclick = () => apply(b.dataset.catPick));
  }
  function openCategoryRename(g) {
    openModal(`<h2>Renombrar categoría</h2><p class="sub">Se cambia en todas las series que la tienen.</p>
      <div class="field"><input type="text" id="cat-new" value="${esc(g)}" spellcheck="false"></div>
      <div class="modal-actions"><button class="btn glass" id="cat-back">Cancelar</button><button class="btn primary" id="cat-ok">Renombrar</button></div>`);
    $('#cat-back').onclick = () => openSettings('look');
    $('#cat-ok').onclick = async () => {
      const n = $('#cat-new').value.trim().slice(0, 40);
      if (!n) return;
      await saveCategories(A.series.filter((x) => (x.customGenres || []).includes(g)), (arr) => arr.map((x) => (x === g ? n : x)));
      if (A.genre === g) A.genre = n;
      toast(`Categoría renombrada a «${n}»`);
      openSettings('look');
    };
  }

  // ------------------------------------------------------------ SERIE
  function renderSeries() {
    const s = A.currentSeries;
    if (!s) return;
    const st = seriesStats(s);
    const tgt = resumeTarget(s);
    const bg = s.backdrop || s.cover || (s.episodes[0] && s.episodes[0].thumb);
    $('#series-hero').innerHTML = `
      <div class="hero-bg ${s.backdrop ? '' : 'blurred'}" style="background-image:${cssUrl(bg)}"></div>
      <div class="hero-inner">
        <div class="hero-poster" id="series-poster" style="background-image:${cssUrl(s.cover || (s.episodes[0] && s.episodes[0].thumb))};${s.cover || (s.episodes[0] && s.episodes[0].thumb) ? '' : 'background:' + hashGradient(s.title)}" title="Cambiar portada">
          <div class="edit-o"><span><svg class="i"><use href="#i-image"/></svg> Cambiar portada</span></div>
        </div>
        <div class="hero-txt">
          <div class="hero-tag"><span class="dot"></span>${s.web ? esc(s.web.typeEs || 'Serie') : 'Serie'}${s.splitFrom ? ` · parte de «${esc(s.splitFrom.name)}»` : ''}${s.web && s.web.url ? ` · <span class="src-link" data-open-web="${esc(s.web.url)}"><svg class="i"><use href="#i-globe"/></svg>Ver en ${esc(s.web.source)}</span>` : ''}</div>
          <h1>${esc(s.title)}</h1>
          ${altTitles(s).length ? `<div class="web-alt">${esc(altTitles(s).slice(0, 4).join(' · '))}</div>` : ''}
          <div class="hero-meta">${s.web && s.web.score ? `<span>★ ${s.web.score}</span>` : ''}${s.web && s.web.year ? `<span>${s.web.year}</span>` : ''}${s.web && s.web.studios && s.web.studios.length ? `<span>${esc(s.web.studios.join(', '))}</span>` : ''}<span>${st.total}${s.web && s.web.episodes ? '/' + s.web.episodes : ''} capítulos</span><span>${st.watched} ${st.watched === 1 ? 'visto' : 'vistos'}</span>${s.groups.filter(Boolean).length ? `<span>${s.groups.filter(Boolean).length} temporadas / carpetas</span>` : ''}<span>${fmtSize(s.size)}</span></div>
          ${genresOf(s).length ? `<div class="series-tags">${genresOf(s).map((g) => tagHtml(s, g)).join('')}</div>` : ''}
          ${!s.web && s.webStatus === 'doubt' && s.webCandidate ? `<div class="doubt-bar">¿Es <b>${esc(s.webCandidate.title)}</b>${s.webCandidate.year ? ' (' + s.webCandidate.year + ')' : ''}? <button class="btn primary" data-web-confirm="${s.id}">Sí, usar</button><button class="btn glass" data-web-pick="${s.id}">Elegir otro</button><button class="btn glass" data-web-reject="${s.id}">No es</button></div>` : ''}
          ${renameBar(s)}
          <p class="synopsis ${synopsisOf(s) ? '' : 'empty'}" id="series-synopsis" title="Clic para expandir">${synopsisOf(s) ? esc(synopsisOf(s)) : 'Sin sinopsis · clic en «Editar» para escribir una o buscarla en internet'}</p>
          <div class="series-actions">
            <button class="btn primary big" data-play-series="${s.id}"><svg class="i"><use href="#i-play"/></svg>${st.lastTs && !tgt.fresh ? 'Continuar ' + esc(epLabel(tgt.ep)) : 'Reproducir'}</button>
            <button class="btn glass big ${s.fav ? 'fav-on' : ''}" data-fav-s="${s.id}"><svg class="i"><use href="#${s.fav ? 'i-heart-f' : 'i-heart'}"/></svg>${s.fav ? 'En favoritos' : 'Favorito'}</button>
            <button class="btn glass big" id="s-cover"><svg class="i"><use href="#i-image"/></svg>Portada</button>
            <button class="btn glass big" id="s-backdrop"><svg class="i"><use href="#i-image"/></svg>Fondo</button>
            <button class="btn glass big" id="s-edit"><svg class="i"><use href="#i-edit"/></svg>Editar</button>
            <button class="btn glass big" data-web-pick="${s.id}"><svg class="i"><use href="#i-globe"/></svg>Internet</button>
            ${s.hasSubfolders && !s.splitFrom ? `<button class="btn glass big" data-split="${s.id}" title="Mostrar cada subcarpeta como una serie propia"><svg class="i"><use href="#i-grid"/></svg>Separar temporadas</button>` : ''}
            ${s.splitFrom ? `<button class="btn glass big" data-unsplit="${s.splitFrom.id}" title="Volver a agrupar todas las subcarpetas de «${esc(s.splitFrom.name)}»"><svg class="i"><use href="#i-list"/></svg>Unir temporadas</button>` : ''}
            <button class="btn glass big" id="s-folder"><svg class="i"><use href="#i-folder"/></svg>Carpeta</button>
          </div>
        </div>
      </div>`;
    const groups = s.groups;
    if (A.groupFilter && !groups.includes(A.groupFilter)) A.groupFilter = null;
    $('#series-groups').innerHTML = groups.length > 1
      ? `<button class="chip ${A.groupFilter == null ? 'active' : ''}" data-group="__all__">Todos</button>` + groups.map((g) => `<button class="chip ${A.groupFilter === g ? 'active' : ''}" data-group="${esc(g)}">${esc(g || 'Principal')}</button>`).join('')
      : '';
    renderSeriesDur(s);
    const sb = A.serDur && DUR_BUCKETS.find((b) => b.k === A.serDur);
    const eps = s.episodes.filter((e) => (A.groupFilter == null || e.group === A.groupFilter) && (!sb || (epDur(e) != null && sb.test(epDur(e)))) && (!A.serFav || e.fav));
    if (s.episodes.some((e) => epDur(e) == null && !e.durTried)) loadDurations();
    $('#series-episodes').innerHTML = !eps.length && (sb || A.serFav) ? `<div class="muted" style="grid-column:1/-1;padding:30px;text-align:center">${A.durLoading ? 'Calculando duraciones…' : sb ? 'No hay videos de esa duración en esta carpeta.' : 'No hay favoritos en esta carpeta.'}</div>` : eps.map((e, i) => {
      const p = A.progress[e.path];
      return `<div class="ep-card ${p && p.w ? 'watched' : ''}" data-play-ep="${e.id}" data-sid="${s.id}" style="animation-delay:${Math.min(i, 20) * 25}ms">
        <div class="thumb" data-thumb="${e.id}" ${epThumbStyle(e, s)}>
          <span class="ep-badge">${e.num != null ? 'EP ' + e.num : 'EP ' + (i + 1)}</span>${e.isNew ? '<span class="ep-new">NUEVO</span>' : ''}
          ${p && p.w ? '<span class="watched-mark"><svg class="i"><use href="#i-check"/></svg></span>' : ''}
          ${epDur(e) ? `<span class="dur-badge">${fmtTime(epDur(e))}</span>` : ''}
          <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
          ${eyeBtn(e, s)}${favEpBtn(e, s)}
          ${progressBar(e)}
        </div>
        <div class="e-t">${esc(epLabel(e))}</div>
        <div class="e-s"><span>${esc(e.title)}</span></div>
      </div>`;
    }).join('');
    eps.forEach((e) => { if (!e.thumb) Thumbs.request(s, e); });
    $('#series-poster').onclick = () => changeImage(s, 'cover');
    $('#s-cover').onclick = (ev) => coverMenu(s, ev);
    $('#s-backdrop').onclick = (ev) => backdropMenu(s, ev);
    $('#s-edit').onclick = () => editSeries(s);
    $('#s-folder').onclick = () => window.cinema.openDir(s.dir);
    $('#series-synopsis').onclick = (e) => { if (synopsisOf(s)) e.currentTarget.classList.toggle('open'); else editSeries(s); };
  }

  // ------------------------------------------------------------ PANEL DE CAPÍTULOS (vista reproductor)
  function renderPanel(scrollToCurrent) {
    const { series: owner, ep: cur, playlist: pl } = Player.state;
    if (!owner) return;
    const s = pl || owner;
    $('#ep-panel-title').textContent = s.title;
    const st = seriesStats(s);
    const idx = s.episodes.findIndex((e) => e.id === (cur && cur.id));
    $('#ep-panel-sub').textContent = pl ? `Video ${idx + 1} de ${s.episodes.length} · lista de favoritos` : `Capítulo ${idx + 1} de ${s.episodes.length} · ${st.watched} ${st.watched === 1 ? 'visto' : 'vistos'}`;
    const groups = pl ? [] : s.groups;
    if (A.panelGroup && !groups.includes(A.panelGroup)) A.panelGroup = null;
    // con muchas carpetas la barra se pliega para dejar sitio a la lista de videos
    const gOpen = A.settings.panelGroupsOpen != null ? A.settings.panelGroupsOpen : groups.length <= 6;
    $('#ep-panel-groups').innerHTML = groups.length > 1
      ? `<button class="pg-toggle ${gOpen ? 'open' : ''}" data-pg-toggle title="${gOpen ? 'Contraer carpetas' : 'Mostrar carpetas'}"><span class="pg-arrow">▸</span>Carpetas · <b>${esc(A.panelGroup == null ? 'Todas' : A.panelGroup || 'Principal')}</b><small>${groups.length}</small></button>`
        + (gOpen ? `<div class="pg-chips"><button class="chip ${A.panelGroup == null ? 'active' : ''}" data-pgroup="__all__">Todos</button>` + groups.map((g) => `<button class="chip ${A.panelGroup === g ? 'active' : ''}" data-pgroup="${esc(g)}">${esc(g || 'Principal')}</button>`).join('') + '</div>' : '')
      : '';
    const q = $('#ep-filter').value.trim().toLowerCase();
    let lastGroup = null;
    let html = '';
    s.episodes.forEach((e, i) => {
      if (A.panelGroup != null && e.group !== A.panelGroup) return;
      if (q && !e.name.toLowerCase().includes(q) && !String(e.num).includes(q)) return;
      if (groups.length > 1 && A.panelGroup == null && e.group !== lastGroup) { lastGroup = e.group; html += `<div class="ep-group-label">${esc(e.group || 'Principal')}</div>`; }
      const p = A.progress[e.path];
      const isCur = cur && e.id === cur.id;
      const es = pl ? pl.ownerOf(e) || owner : s;
      html += `<div class="ep-item ${isCur ? 'current' : ''}" data-play-ep="${e.id}" data-sid="${es.id}" ${pl ? 'data-pl="cur"' : ''}>
        <div class="thumb" data-thumb="${e.id}" ${epThumbStyle(e, s)}>
          <span class="ep-no">${e.num != null ? 'EP ' + e.num : i + 1}</span>${e.isNew ? '<span class="ep-new">NUEVO</span>' : ''}
          <div class="eq"><div class="eq-bars"><i></i><i></i><i></i><i></i></div></div>
          ${eyeBtn(e, es)}${favEpBtn(e, es)}
          ${progressBar(e)}
        </div>
        <div class="info">
          <div class="t">${esc(pl ? e.title : epLabel(e))}</div>
          <div class="s">${pl ? `<span>${esc(es.title)}</span>` : e.num != null ? `<span>${esc(e.title)}</span>` : ''}</div>
          <div class="s">${p && p.w ? '<span class="ok"><svg class="i"><use href="#i-check"/></svg>Visto</span>' : p && p.d ? `<span>${fmtTime(p.t)} / ${fmtTime(p.d)}</span>` : `<span>${fmtSize(e.size)}</span>`}</div>
        </div>
      </div>`;
      if (!e.thumb) Thumbs.request(s, e);
    });
    $('#ep-list').innerHTML = html || '<div class="muted" style="padding:20px;text-align:center">Sin resultados</div>';
    if (scrollToCurrent) {
      requestAnimationFrame(() => {
        const c = $('#ep-list .current'), box = $('#ep-list');
        if (c) box.scrollTo({ top: box.scrollTop + c.getBoundingClientRect().top - box.getBoundingClientRect().top - (box.clientHeight - c.offsetHeight) / 2, behavior: 'smooth' });
      });
    }
  }

  function refreshEpisodeProgressUI(p) {
    // actualización ligera: solo se re-renderiza el panel si está visible (cada ~4 s)
    if (A.view === 'player') renderPanelSoon();
  }
  const renderPanelSoon = debounce(() => renderPanel(false), 800);

  // ------------------------------------------------------------ callbacks del reproductor
  function onEpisodeChange(s, ep) {
    $('#nav-player').hidden = false;
    $('#now-series').textContent = s.title;
    $('#now-title').textContent = epLabel(ep) + (ep.num != null ? ' — ' + ep.title : '');
    const idx = s.episodes.indexOf(ep);
    $('#now-meta').innerHTML = `<span>${idx + 1} de ${s.episodes.length}</span><span>${esc(ep.name)}</span><span>${fmtSize(ep.size)}</span>${ep.group ? `<span>${esc(ep.group)}</span>` : ''}`;
    $('#now-cover').style.backgroundImage = cssUrl(s.cover || ep.thumb);
    renderNowExtra(s);
    $('#now-potplayer').hidden = !enabledPlayers().length;
    document.title = `${s.title} · ${epLabel(ep)} — Kuro Player`;
    if (A.view === 'player') { renderPanel(true); setAmbient(s); }
  }
  // ficha bajo el video: mismos datos que la cartelera (títulos, estudio, año, descripción, géneros)
  function renderNowExtra(s) {
    const box = $('#now-extra');
    if (!box || !s) return;
    const st = seriesStats(s);
    const alts = altTitles(s);
    const syn = synopsisOf(s);
    const genres = genresOf(s);
    const chips = [];
    if (s.web && s.web.score) chips.push(`<span class="mini-chip"><span style="color:#fbbf24">★</span> ${s.web.score}</span>`);
    chips.push(webChips(s, 4));
    chips.push(`<span class="mini-chip cyan">${st.total}${s.web && s.web.episodes ? '/' + s.web.episodes : ''} capítulos</span>`);
    chips.push(`<span class="mini-chip ok">✓ ${st.watched} ${st.watched === 1 ? 'visto' : 'vistos'}</span>`);
    box.innerHTML = `
      ${alts.length ? `<div class="lcard-alt" title="${esc(alts.join(', '))}">${esc(alts.join(', '))}</div>` : ''}
      <div class="chips">${chips.join('')}</div>
      ${syn ? `<div class="lcard-syn" id="now-syn">${esc(syn)}</div>${syn.length > 220 ? '<button class="read-more" data-read-more>Leer más</button>' : ''}`
        : `<div class="lcard-syn none">Sin descripción · <button class="link-btn" data-web-pick="${s.id}">buscar en internet</button> o <button class="link-btn" data-open-series="${s.id}">editar la serie</button></div>`}
      ${genres.length ? `<div class="tags now-tags">${genres.map((g) => tagHtml(s, g)).join('')}</div>` : ''}`;
  }
  function onPlayState(playing) { document.body.classList.toggle('paused', !playing); }
  function onClosed() {
    $('#nav-player').hidden = true;
    document.title = 'Kuro Player';
    if (A.view === 'player') go(A.lastBrowseView || 'home');
    else renderCurrent();
  }
  function toggleTheater(force) {
    const on = force != null ? !!force : !document.body.classList.contains('theater');
    document.body.classList.toggle('theater', on);
    $('#c-theater').classList.toggle('on', on);
    $('#c-theater').title = on ? 'Salir del modo cine (T)' : 'Modo cine (T)';
    saveSettings({ theater: on });
    if (on && A.view !== 'player' && Player.state.ep) go('player');
    if (!on && A.settings.listOpen !== false) renderPanel(true);
  }
  function toggleList(force) {
    const layout = $('#player-layout');
    let open = force != null ? force : layout.classList.contains('list-closed');
    // en modo cine la lista está oculta: pedirla sale del modo cine
    if (document.body.classList.contains('theater') && force == null) { toggleTheater(false); open = true; }
    layout.classList.toggle('list-closed', !open);
    $('#pl-toggle-list span').textContent = open ? 'Ocultar lista' : 'Lista de capítulos';
    $('#c-list').classList.toggle('on', open);
    saveSettings({ listOpen: open });
    if (open) renderPanel(true);
  }
  function renderCurrent() {
    if (A.view === 'home') renderHome();
    if (A.view === 'library') renderLibrary();
    if (A.view === 'series') renderSeries();
    if (A.view === 'player') renderPanel(false);
  }
  function renderAll() {
    renderCurrent();
    renderRail();
    if (Player.state.series) renderNowExtra(A.byId.get(Player.state.series.id) || Player.state.series);
    if (A.view !== 'home') renderHome();
  }

  function playEpisode(s, ep, opts) {
    Player.load(s, ep, opts || {});
    // con el reproductor minimizado, elegir otro video lo cambia ahí mismo (volver a elegir el mismo lo maximiza)
    if (Player.mode === 'mini') return;
    go('player');
  }
  function playSeries(s) {
    const t = resumeTarget(s);
    playEpisode(s, t.ep, t.fresh ? { startAt: 0 } : {});
  }

  // ------------------------------------------------------------ portadas / edición
  async function changeImage(s, kind) {
    const url = await window.cinema.pickImage(s.id, kind);
    if (!url) return;
    s[kind] = url;
    if (kind === 'cover') s.hasCustomCover = true;
    toast(kind === 'cover' ? 'Portada actualizada' : 'Fondo actualizado');
    renderAll();
    if (Player.state.series === s) onEpisodeChange(s, Player.state.ep);
  }
  function coverMenu(s, ev) {
    const r = ev.currentTarget.getBoundingClientRect();
    ctxMenu(r.left, r.bottom + 6, [
      { icon: 'i-image', label: 'Elegir imagen...', action: () => changeImage(s, 'cover') },
      ...(Player.state.ep && Player.state.series === s ? [{ icon: 'i-camera', label: 'Usar cuadro actual del video', action: coverFromFrame }] : []),
      ...(s.hasCustomCover ? [{ icon: 'i-refresh', label: 'Quitar portada personalizada', action: async () => { await window.cinema.resetImage(s.id, 'cover'); await scan(true); } }] : []),
    ]);
  }
  function backdropMenu(s, ev) {
    const r = ev.currentTarget.getBoundingClientRect();
    ctxMenu(r.left, r.bottom + 6, [
      { icon: 'i-image', label: 'Elegir imagen de fondo...', action: () => changeImage(s, 'backdrop') },
      { icon: 'i-refresh', label: 'Quitar fondo personalizado', action: async () => { await window.cinema.resetImage(s.id, 'backdrop'); await scan(true); } },
    ]);
  }
  async function coverFromFrame() {
    const s = Player.state.series;
    if (!s) return;
    const data = Player.grabPoster();
    if (!data) return toast('No hay cuadro disponible');
    const url = await window.cinema.coverFromFrame(s.id, data);
    if (url) { s.cover = url; s.hasCustomCover = true; toast('Portada creada a partir del cuadro actual'); renderAll(); onEpisodeChange(s, Player.state.ep); }
  }
  function editSeries(s) {
    openModal(`
      <h2>Editar serie</h2>
      <p class="sub">${esc(s.dir)}</p>
      <div class="field"><label>Título</label><input type="text" id="ed-title" value="${esc(s.customTitle ? s.title : '')}" placeholder="${esc(s.title)}"><div class="hint">Vacío = automático (nombre de la carpeta «${esc(s.folderName)}» o el título de internet, según Ajustes)</div></div>
      <div class="field"><label>Sinopsis propia</label><textarea id="ed-syn" placeholder="${esc(s.web ? 'Vacío = usar la descripción de internet' : 'Descripción, notas, año, estudio...')}">${esc(s.synopsis)}</textarea></div>
      <div class="field"><label>Categorías propias</label>
        <div class="chips" id="ed-cats"></div>
        <div class="search-row" style="margin-top:8px"><input type="text" id="ed-cat-in" placeholder="Nueva categoría (Enter para agregar)" list="ed-cat-list" spellcheck="false"><button class="btn glass" id="ed-cat-add"><svg class="i"><use href="#i-plus"/></svg>Agregar</button></div>
        <datalist id="ed-cat-list">${allCustomCategories().map(([g]) => `<option value="${esc(g)}">`).join('')}</datalist>
        ${s.web && s.web.genresEs && s.web.genresEs.length ? `<div class="hint">Géneros de internet: ${esc(s.web.genresEs.join(', '))}</div>` : ''}
      </div>
      <div class="field"><label>Datos de internet</label>
        <div class="hint" style="margin:0 0 8px">${s.web ? `Vinculado a <b>${esc(s.web.title)}</b> (${esc(s.web.source)})` : 'Sin vincular'}</div>
        <div class="set-actions"><button class="btn glass" id="ed-web"><svg class="i"><use href="#i-globe"/></svg>${s.web ? 'Cambiar coincidencia' : 'Buscar en internet'}</button>${s.web ? '<button class="btn glass danger" id="ed-web-clear"><svg class="i"><use href="#i-trash"/></svg>Quitar datos de internet</button>' : ''}</div>
      </div>
      <div class="modal-actions"><button class="btn glass" data-close>Cancelar</button><button class="btn primary" id="ed-save">Guardar</button></div>`);
    $('#ed-title').focus();
    let cats = [...(s.customGenres || [])];
    const drawCats = () => {
      $('#ed-cats').innerHTML = cats.length ? cats.map((g, i) => `<button class="chip custom" data-ed-cat-rm="${i}" title="Quitar">★ ${esc(g)} ✕</button>`).join('') : '<span class="muted small">Sin categorías propias</span>';
      $$('[data-ed-cat-rm]').forEach((b) => b.onclick = () => { cats.splice(+b.dataset.edCatRm, 1); drawCats(); });
    };
    const addCat = () => { const v = $('#ed-cat-in').value.trim().slice(0, 40); if (v && !cats.includes(v)) cats.push(v); $('#ed-cat-in').value = ''; drawCats(); };
    drawCats();
    $('#ed-cat-add').onclick = addCat;
    $('#ed-cat-in').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } };
    $('#ed-web').onclick = () => webPick(s);
    if ($('#ed-web-clear')) $('#ed-web-clear').onclick = async () => { await window.cinema.webClear(s.id); closeModal(); await scan(true); toast('Datos de internet quitados'); };
    $('#ed-save').onclick = async () => {
      const title = $('#ed-title').value.trim();
      const synopsis = $('#ed-syn').value.trim();
      if ($('#ed-cat-in').value.trim()) addCat();
      await window.cinema.setMeta(s.id, { title: title && title !== s.folderName ? title : '', synopsis, customGenres: cats });
      s.title = title || s.folderName;
      s.synopsis = synopsis;
      s.customGenres = cats;
      closeModal();
      applyDisplayTitles();
      renderAll();
      toast('Serie actualizada');
    };
  }
  // ------------------------------------------------------------ renombrar carpeta con el nombre oficial
  function splitPrefix(name) {
    const m = /^((?:[A-Za-z]|\d{1,3})\s*[_\-.)]\s*|\d{1,3}\s+-\s+)(?=\S)/.exec(name);
    return m && name.length - m[0].length >= 3 ? { prefix: m[0], core: name.slice(m[0].length) } : { prefix: '', core: name };
  }
  function lettersOnly(t) {
    return String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\[[^\]]*\]|\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, '');
  }
  function officialName(s) {
    if (!s.web) return '';
    const src = A.settings.titleSource || 'romaji';
    return src === 'english' ? (s.web.titleEn || s.web.title) : (s.web.title || s.web.titleEn);
  }
  function safeFolderName(n) {
    return String(n).replace(/[:]/g, ' -').replace(/[\\/*?"<>|]/g, '').replace(/\s{2,}/g, ' ').replace(/[. ]+$/g, '').trim();
  }
  function renameSuggestion(s) {
    if (!s.web || s.root === s.dir || s.keepName || A.settings.suggestRename === false) return null;
    const official = officialName(s);
    if (!official) return null;
    const { prefix, core } = splitPrefix(s.folderName);
    // se comparan palabras (los _ y . cuentan como espacios; la puntuación se ignora)
    const words = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .toLowerCase().replace(/[_.]+/g, ' ').replace(/[^a-z0-9぀-ヿ一-鿿 ]+/g, '').replace(/\s+/g, ' ').trim();
    if ([official, s.web.title, s.web.titleEn, ...(s.web.synonyms || [])].some((t) => t && words(t) === words(core))) return null;
    return { prefix, core, official, newName: prefix + safeFolderName(official) };
  }
  function renameBar(s) {
    const r = renameSuggestion(s);
    if (!r) return '';
    return `<div class="rename-bar"><svg class="i"><use href="#i-folder"/></svg><span>La carpeta se llama <b>${esc(r.core)}</b>; el nombre oficial es <b>${esc(r.official)}</b>.</span>
      <button class="btn glass" data-rename="${s.id}">Renombrar carpeta</button><button class="btn glass" data-keep-name="${s.id}" title="No volver a sugerir para esta serie">Mantener mi nombre</button></div>`;
  }
  async function doRename(s, newName) {
    if (Player.state.series && Player.state.series.id === s.id) Player.close();
    const res = await window.cinema.renameSeries(s.id, newName);
    const lib = await window.cinema.getLibrary();
    A.progress = lib.progress || {};
    return res;
  }
  function openRename(s) {
    const r = renameSuggestion(s) || { prefix: splitPrefix(s.folderName).prefix, core: splitPrefix(s.folderName).core, official: officialName(s) || s.title, newName: '' };
    const suggested = r.newName || (r.prefix + safeFolderName(r.official));
    openModal(`
      <h2>Renombrar carpeta</h2>
      <p class="sub">Cambia el nombre real de la carpeta en el disco. Tu progreso, portada y datos se conservan.</p>
      <div class="field"><label>Nombre actual</label><input type="text" value="${esc(s.folderName)}" disabled></div>
      <div class="field"><label>Nuevo nombre</label><input type="text" id="rn-name" value="${esc(suggested)}" spellcheck="false">
        <div class="hint">Nombre oficial: ${esc(r.official)}${s.web && s.web.titleEn && s.web.titleEn !== r.official ? ' · Inglés: ' + esc(s.web.titleEn) : ''}</div></div>
      ${r.prefix ? `<label class="switch"><input type="checkbox" id="rn-prefix" checked><span></span>Conservar mi prefijo de orden «${esc(r.prefix.trim())}»</label>` : ''}
      <div class="rn-alt chips" style="margin-top:12px">${[s.web && s.web.title, s.web && s.web.titleEn, ...((s.web && s.web.synonyms) || []).slice(0, 2)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
        .map((t) => `<button class="chip" data-rn-use="${esc(safeFolderName(t))}">${esc(t)}</button>`).join('')}</div>
      <div class="modal-actions"><button class="btn glass" data-keep-name="${s.id}" style="margin-right:auto">Mantener mi nombre</button><button class="btn glass" data-close>Cancelar</button><button class="btn primary" id="rn-go"><svg class="i"><use href="#i-edit"/></svg>Renombrar</button></div>`);
    const input = $('#rn-name');
    const pre = () => ($('#rn-prefix') && $('#rn-prefix').checked ? r.prefix : '');
    if ($('#rn-prefix')) $('#rn-prefix').onchange = () => { const core = input.value.startsWith(r.prefix) ? input.value.slice(r.prefix.length) : input.value; input.value = pre() + core; };
    $$('[data-rn-use]').forEach((b) => b.onclick = () => { input.value = pre() + b.dataset.rnUse; });
    $('#rn-go').onclick = async () => {
      const name = safeFolderName(input.value);
      if (!name) return toast('Escribe un nombre válido');
      $('#rn-go').disabled = true;
      try {
        const res = await doRename(s, name);
        closeModal();
        await scan(true);
        toast(`Carpeta renombrada a «${name}»`);
        if (A.view === 'series') go('series', { id: res.id, scrollTop: false });
      } catch (e) {
        $('#rn-go').disabled = false;
        toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 5000);
      }
    };
  }
  async function keepName(id, keep) {
    await window.cinema.setMeta(id, { keepName: !!keep });
    const s = A.byId.get(id);
    if (s) s.keepName = !!keep;
    if (!$('#modal').hidden && $('#rn-name')) closeModal();
    renderAll();
    if (!$('#modal').hidden && $('.set-nav')) openSettings();
    toast(keep ? 'Se conservará tu nombre de carpeta' : 'Se volverá a sugerir el nombre oficial');
  }
  async function setSplit(parentId, split) {
    await window.cinema.setSplit(parentId, split);
    await scan(true);
    toast(split ? 'Temporadas separadas: cada subcarpeta es ahora una serie' : 'Temporadas unidas en una sola serie');
    if (split) go('library');
    else go('series', { id: parentId });
  }
  async function renameAll(list) {
    let ok = 0, fail = 0;
    for (const s of list) {
      const r = renameSuggestion(s);
      if (!r) continue;
      try { await doRename(s, r.newName); ok++; } catch (e) { fail++; }
    }
    await scan(true);
    toast(`${ok} carpetas renombradas${fail ? `, ${fail} no se pudieron (archivos abiertos o nombre repetido)` : ''}`, 5000);
  }

  // ------------------------------------------------------------ datos de internet
  function confClass(c) { return c >= 0.8 ? 'hi' : c >= 0.45 ? 'mid' : 'lo'; }
  function webPick(s) {
    const g = groupOf(s);
    const t = GROUP_TYPES[g.type] || GROUP_TYPES.other;
    openModal(`
      <h2>Buscar «${esc(s.searchName || s.folderName)}» en internet</h2>
      <p class="sub">Elige el resultado correcto. Se guardan título oficial, descripción, géneros, año, puntuación y portada${t.web ? ` (fuentes: ${t.web})` : ''}.</p>
      <div class="search-row field" style="margin:0"><input type="text" id="wp-q" value="${esc(s.searchName || s.folderName)}" spellcheck="false"><button class="btn primary" id="wp-go"><svg class="i"><use href="#i-search"/></svg>Buscar</button></div>
      <div class="url-row"><input type="text" class="sel" id="wp-url" placeholder="¿No aparece? Pega el enlace de su página en AniList, MyAnimeList, Kitsu, TVmaze o Wikipedia" spellcheck="false"><button class="btn glass" id="wp-url-go"><svg class="i"><use href="#i-link"/></svg>Vincular</button><button class="btn glass" id="wp-google" title="Buscar en Google (se abre el navegador)"><svg class="i"><use href="#i-globe"/></svg>Google</button></div>
      <label class="switch" style="margin-top:12px"><input type="checkbox" id="wp-cover" ${s.hasFolderCover || (s.hasCustomCover && !s.coverFromWeb) ? '' : 'checked'}><span></span>Usar también la portada de internet${s.hasFolderCover ? ' (reemplaza la de la carpeta solo en la app)' : ''}</label>
      <div class="web-results" id="wp-res"><div class="muted small">Buscando...</div></div>
      <div class="modal-actions"><button class="btn glass" data-close>Cerrar</button></div>`);
    const run = async () => {
      const q = $('#wp-q').value.trim();
      if (!q) return;
      $('#wp-res').innerHTML = '<div class="muted small">Buscando...</div>';
      try {
        const res = await window.cinema.webSearch(q, g.type === 'other' ? 'anime' : g.type);
        if (!$('#wp-res')) return;
        $('#wp-res').innerHTML = res.length ? res.map((c, i) => `<div class="web-res">
          <img src="${esc(c.image)}" alt="" loading="lazy">
          <div class="wr-body">
            <div class="wr-t">${esc(c.title)} <span class="conf ${confClass(c.confidence)}">${Math.round(c.confidence * 100)}%</span><span class="src">${esc(c.source)}</span></div>
            <div class="wr-s">${esc([c.titleEn, c.titleJp].filter(Boolean).join(' · '))}</div>
            <div class="chips">${c.year ? `<span class="mini-chip">${c.year}</span>` : ''}${c.typeEs ? `<span class="mini-chip">${esc(c.typeEs)}</span>` : ''}${c.episodes ? `<span class="mini-chip cyan">${c.episodes} ep.</span>` : ''}${c.score ? `<span class="mini-chip">★ ${c.score}</span>` : ''}${(c.studios || []).slice(0, 1).map((x) => `<span class="mini-chip accent">${esc(x)}</span>`).join('')}</div>
          </div>
          <button class="btn primary" data-wp-use="${i}">Usar</button></div>`).join('')
          : '<div class="muted small">Sin resultados. Prueba con el nombre en romaji o en inglés.</div>';
        $$('#wp-res [data-wp-use]').forEach((b) => b.onclick = async () => {
          b.disabled = true; b.textContent = 'Guardando...';
          await window.cinema.webApply(s.id, res[+b.dataset.wpUse], { cover: $('#wp-cover').checked, overwriteCover: $('#wp-cover').checked, translate: A.settings.translateSynopsis !== false });
          closeModal();
          await scan(true);
          toast('Datos de internet guardados');
        });
      } catch (e) {
        if ($('#wp-res')) $('#wp-res').innerHTML = `<div class="doubt-bar">${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</div>`;
      }
    };
    $('#wp-go').onclick = run;
    $('#wp-q').onkeydown = (e) => { if (e.key === 'Enter') run(); };
    $('#wp-google').onclick = () => window.cinema.openWeb('https://www.google.com/search?q=' + encodeURIComponent(`${$('#wp-q').value.trim()} ${g.type === 'movies' ? 'película' : g.type === 'series' ? 'serie' : 'anime'} anilist OR myanimelist OR wikipedia`));
    const link = async () => {
      const url = $('#wp-url').value.trim();
      if (!url) return;
      $('#wp-url-go').disabled = true;
      try {
        const c = await window.cinema.webFromUrl(url);
        await window.cinema.webApply(s.id, c, { cover: $('#wp-cover').checked, overwriteCover: $('#wp-cover').checked, translate: A.settings.translateSynopsis !== false });
        closeModal();
        await scan(true);
        toast(`Vinculado a «${esc(c.title)}» (${esc(c.source)})`);
      } catch (e) {
        $('#wp-url-go').disabled = false;
        toast(esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 4500);
      }
    };
    $('#wp-url-go').onclick = link;
    $('#wp-url').onkeydown = (e) => { if (e.key === 'Enter') link(); };
    run();
  }
  async function webConfirm(s) {
    if (!s.webCandidate) return;
    toast('Guardando datos...');
    await window.cinema.webApply(s.id, s.webCandidate, { cover: true, translate: A.settings.translateSynopsis !== false });
    await scan(true);
    toast(`«${s.folderName}» vinculado a ${s.webCandidate.title}`);
  }
  let webRun = null;
  function startWebFetch(opts) {
    if (webRun) { toast('Ya se están descargando datos'); return; }
    webRun = { done: 0, total: 0, title: '' };
    showWebPill();
    window.cinema.webFetchAll({ translate: A.settings.translateSynopsis !== false, cover: A.settings.webCovers !== false, ...opts })
      .then((r) => { if (r && r.busy) toast('Ya se están descargando datos'); })
      .catch((e) => { toast('Error: ' + e.message); webRun = null; showWebPill(); });
  }
  function showWebPill() {
    let pill = $('#web-pill');
    if (!webRun) { if (pill) pill.remove(); return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'web-pill'; pill.className = 'web-pill glass';
      pill.onclick = () => openSettings('web');
      document.body.appendChild(pill);
    }
    pill.innerHTML = `<svg class="i"><use href="#i-refresh"/></svg><span>Datos de internet ${webRun.done}/${webRun.total || '…'} · ${esc(webRun.title || '')}</span>`;
  }
  window.cinema.onWebProgress(async (d) => {
    webRun = d.finished ? null : { ...d };
    if (d.finished) Busy.clear('web'); else Busy.set('web', `Buscando datos en internet (${d.done}/${d.total})`);
    showWebPill();
    const prog = $('#web-prog');
    if (prog) {
      prog.hidden = false;
      $('#web-prog i').style.width = (d.total ? (d.done / d.total) * 100 : 100) + '%';
      $('#web-prog-t').textContent = d.finished ? 'Terminado' : `Buscando: ${d.title || ''}`;
      $('#web-prog-n').textContent = `${d.done}/${d.total} · ✓ ${d.ok} · ? ${d.doubt} · ✗ ${d.none}`;
      if ($('#web-run')) $('#web-run').hidden = !d.finished;
      if ($('#web-stop')) $('#web-stop').hidden = !!d.finished;
    }
    if (d.finished) {
      await scan(true);
      if (d.offline) toast('Sin conexión a internet: no se pudo completar');
      else toast(`Datos de internet: ${d.ok} encontrados, ${d.doubt} por confirmar, ${d.none} sin coincidencia${d.cancelled ? ' (detenido)' : ''}`, 5000);
      if (!$('#modal').hidden && $('.set-nav')) openSettings();
    } else if (d.done && d.done % 5 === 0) {
      scan(true);
    }
  });

  function markSeries(s, watched) {
    for (const e of s.episodes) {
      if (watched) { const p = A.progress[e.path] || {}; setProgress(e.path, { t: p.d || 0, d: p.d || 0, w: true, ts: p.ts || Date.now(), s: s.id }); }
      else setProgress(e.path, null);
    }
    renderAll();
    toast(watched ? 'Serie marcada como vista' : 'Progreso de la serie borrado');
  }
  function markEpisode(s, e, watched) {
    const p = A.progress[e.path] || {};
    if (watched) setProgress(e.path, { t: p.d || 0, d: p.d || 0, w: true, ts: Date.now(), s: s.id });
    else setProgress(e.path, null);
    renderAll();
  }

  // ------------------------------------------------------------ modal
  function openModal(html) {
    $('#modal-card').className = 'modal-card glass';
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
    $$('#modal [data-close]').forEach((b) => (b.onclick = closeModal));
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }
  // confirmación que aparece encima de cualquier ventana (también de Ajustes)
  function confirmBox({ title, html, ok = 'Aceptar', danger = false }) {
    return new Promise((resolve) => {
      const layer = document.createElement('div');
      layer.className = 'confirm-layer';
      layer.innerHTML = `<div class="confirm-card glass"><h3>${esc(title)}</h3><div class="confirm-body">${html}</div>
        <div class="set-actions confirm-actions"><button class="btn glass" data-cf="0">Cancelar</button><button class="btn ${danger ? 'danger-solid' : 'primary'}" data-cf="1">${esc(ok)}</button></div></div>`;
      document.body.appendChild(layer);
      const done = (v) => { layer.remove(); removeEventListener('keydown', key, true); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } };
      addEventListener('keydown', key, true);
      layer.addEventListener('mousedown', (e) => { if (e.target === layer) done(false); });
      $$('[data-cf]', layer).forEach((b) => b.onclick = () => done(b.dataset.cf === '1'));
      $('[data-cf="1"]', layer).focus();
    });
  }
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

  // ------------------------------------------------------------ AJUSTES (pestañas)
  const SET_TABS = [
    { id: 'library', icon: 'i-folder', label: 'Biblioteca y carpetas', desc: 'Qué carpetas lee la cartelera. Cada subcarpeta es una serie y sus videos, los capítulos.' },
    { id: 'web', icon: 'i-globe', label: 'Datos de internet', desc: 'Verifica los nombres contra AniList / MyAnimeList y trae descripción, géneros, estudio, año, puntuación y portada.' },
    { id: 'play', icon: 'i-play-circle', label: 'Reproducción', desc: 'Saltos con el teclado, volumen y capítulo siguiente.' },
    { id: 'subs', icon: 'i-sub', label: 'Subtítulos', desc: 'Archivos .srt / .ass / .vtt con el mismo nombre del video.' },
    { id: 'look', icon: 'i-image', label: 'Apariencia', desc: 'Cartelera, miniaturas y luz ambiental.' },
    { id: 'ext', icon: 'i-external', label: 'Programas externos', desc: 'Reproductores instalados para la opción «Abrir con» del clic derecho.' },
    { id: 'about', icon: 'i-info', label: 'Acerca de', desc: 'Versión, formatos compatibles y datos de la aplicación.' },
  ];
  let setTab = 'library';

  function rowSwitch(key, label, desc, def = true) {
    const on = A.settings[key] == null ? def : !!A.settings[key];
    return `<div class="set-row"><div class="lbl"><b>${label}</b>${desc ? `<span>${desc}</span>` : ''}</div>
      <label class="switch"><input type="checkbox" data-set-bool="${key}" ${on ? 'checked' : ''}><span></span></label></div>`;
  }
  function rowNum(key, label, desc, min, max, unit) {
    return `<div class="set-row"><div class="lbl"><b>${label}</b>${desc ? `<span>${desc}</span>` : ''}</div>
      <div style="display:flex;align-items:center;gap:8px"><input type="number" data-set-num="${key}" min="${min}" max="${max}" value="${A.settings[key]}"><span class="muted small">${unit || ''}</span></div></div>`;
  }
  function webStats() {
    let ok = 0, doubt = 0, none = 0, pending = 0;
    const webGroups = new Set(A.groups.filter((g) => g.web).map((g) => g.id));
    for (const s of A.allSeries) {
      if (!webGroups.has(s.groupId)) continue;
      if (s.web) ok++; else if (s.webStatus === 'doubt') doubt++; else if (s.webStatus === 'none') none++; else pending++;
    }
    return { ok, doubt, none, pending };
  }

  // ------------------------------------------------------------ REPRODUCTORES EXTERNOS
  function playersList() {
    let list = Array.isArray(A.settings.players) ? A.settings.players : null;
    // compatibilidad: si solo se conocía PotPlayer, aparece como primer reproductor
    if (!list) list = A.potplayer ? [{ id: 'potplayer', name: 'PotPlayer', path: A.potplayer, seek: true, enabled: true }] : [];
    return list;
  }
  function savePlayers(list) { saveSettings({ players: list }); }
  function enabledPlayers() { return playersList().filter((p) => p.enabled !== false); }
  function openWith(id, file, seconds) {
    if (Player.state.ep && Player.state.ep.path === file) Player.video.pause();
    window.cinema.playersOpen(id, file, seconds || 0).then((ok) => { if (!ok) toast('No se pudo abrir ese programa (¿se desinstaló?)'); });
  }
  function openWithItems(file, seconds) {
    return enabledPlayers().map((p) => ({ icon: 'i-external', label: `Abrir con ${p.name}`, action: () => openWith(p.id, file, seconds) }));
  }
  function confirmDetectPlayers() {
    openModal(`<h2>Identificar reproductores</h2>
      <p class="sub">¿Seguro que quieres buscar reproductores de video instalados en este equipo?</p>
      <div class="set-card" style="margin:0"><p style="margin:0" class="small">Se revisan solo las carpetas de programas habituales y las rutas de aplicaciones del registro de Windows, <b>en modo lectura</b>. No se instala, abre ni modifica nada. Se buscan: PotPlayer, VLC, MPC-HC, MPC-BE, mpv, mpv.net, SMPlayer, KMPlayer, GOM Player, Kodi y Windows Media Player.</p></div>
      <div class="modal-actions"><button class="btn glass" id="pd-cancel">Cancelar</button><button class="btn primary" id="pd-go"><svg class="i"><use href="#i-search"/></svg>Sí, identificar</button></div>`);
    $('#pd-cancel').onclick = () => openSettings('ext');
    $('#pd-go').onclick = async () => {
      $('#pd-go').disabled = true; $('#pd-go').textContent = 'Buscando...';
      let found = [];
      try { found = await window.cinema.playersDetect(); } catch (e) { toast('No se pudo completar la búsqueda'); }
      const list = playersList();
      let added = 0;
      for (const f of found) {
        const i = list.findIndex((x) => x.id === f.id || x.path.toLowerCase() === f.path.toLowerCase());
        if (i >= 0) list[i] = { ...list[i], path: f.path, name: f.name, seek: f.seek };
        else { list.push({ ...f, enabled: true }); added++; }
      }
      savePlayers(list);
      A.playersLastScan = new Date().toLocaleString('es') + ` · ${found.length} encontrados`;
      toast(found.length ? `Se encontraron ${found.length} reproductores${added ? ` (${added} nuevos)` : ''}` : 'No se encontraron reproductores conocidos', 4500);
      openSettings('ext');
    };
  }

  // ------------------------------------------------------------ ACERCA DE
  const FORMAT_GROUPS = [
    { icon: 'i-folder', title: 'Contenedores de video', items: [
      ['MP4', 'd'], ['M4V', 'd'], ['MKV', 'd'], ['WebM', 'd'], ['MOV', 'd'], ['OGV', 'd'],
      ['AVI', 'c'], ['WMV', 'c'], ['ASF', 'c'], ['FLV', 'c'], ['F4V', 'c'], ['TS', 'c'], ['M2TS', 'c'], ['MTS', 'c'],
      ['MPG / MPEG', 'c'], ['VOB', 'c'], ['3GP', 'c'], ['RM / RMVB', 'c'], ['DivX', 'c'], ['OGM', 'c'], ['MXF', 'c'], ['DV', 'c']] },
    { icon: 'i-play-circle', title: 'Códecs de video', items: [
      ['H.264 / AVC (8 bits)', 'd'], ['H.265 / HEVC', 'd'], ['VP8', 'd'], ['VP9', 'd'], ['AV1', 'd'],
      ['H.264 10 bits (Hi10P)', 'c'], ['MPEG-4 ASP (Xvid / DivX)', 'c'], ['MPEG-2', 'c'], ['MPEG-1', 'c'], ['VC-1', 'c'],
      ['WMV 7/8/9', 'c'], ['RealVideo', 'c'], ['Theora', 'c'], ['ProRes', 'c'], ['H.263', 'c']] },
    { icon: 'i-audio', title: 'Códecs de audio', items: [
      ['AAC', 'd'], ['MP3', 'd'], ['Opus', 'd'], ['Vorbis', 'd'], ['FLAC', 'd'],
      ['AC3 (Dolby Digital)', 'c'], ['E-AC3 (Dolby Digital+)', 'c'], ['DTS / DTS-HD', 'c'], ['TrueHD', 'c'], ['WMA', 'c'],
      ['PCM / WAV', 'c'], ['ALAC', 'c'], ['MP2', 'c'], ['RealAudio', 'c']] },
    { icon: 'i-sub', title: 'Subtítulos', items: [
      ['SRT (externo)', 'd'], ['ASS / SSA (externo)', 'd'], ['WebVTT (externo)', 'd'],
      ['ASS / SSA incrustado', 'c'], ['SRT incrustado', 'c'], ['mov_text incrustado', 'c'],
      ['PGS (Blu-ray)', 'p'], ['VobSub (DVD)', 'p'], ['DVB', 'p']] },
    { icon: 'i-image', title: 'Portadas y fondos', items: [
      ['JPG', 'd'], ['PNG', 'd'], ['WebP', 'd'], ['GIF', 'd'], ['BMP', 'd'], ['AVIF', 'd']] },
  ];
  const CHANGELOG = [
    { v: '2.1.3', name: 'Favoritos', date: 'Octubre 2026', items: [
      'Los videos favoritos son una lista de reproducción propia: al reproducir uno desde Favoritos, «Siguiente» y la lista lateral siguen solo los favoritos, estén en la carpeta que estén',
      'En la lista lateral del reproductor la barra de carpetas se puede contraer (se contrae sola si hay muchas) para dejar más espacio a los videos',
      'Corregido: al llegar al final de la lista lateral el video principal ya no se desplaza hacia abajo',
      'Filtro de favoritos dentro de cada carpeta o serie de la cartelera',
      'Botón «Invitar un café en Ko-fi» en Acerca de para apoyar el proyecto',
      'Con el reproductor minimizado (I), elegir otro video en la cartelera o en una carpeta lo cambia en el mini reproductor sin maximizarlo; elegir de nuevo el mismo video lo maximiza',
    ] },
    { v: '2.1.2', name: 'Favoritos', date: 'Octubre 2026', items: [
      'Kuro, el oso de la esquina inferior del menú de grupos: un haz de luz recorre su contorno mientras se generan miniaturas, se revisa la biblioteca, se miden duraciones o se buscan datos en internet (al pasar el mouse dice qué está haciendo)',
    ] },
    { v: '2.1.1', name: 'Favoritos', date: 'Octubre 2026', items: [
      'Al abrir una serie o carpeta cada video muestra su duración',
      'El filtro por duración también funciona dentro de las carpetas de los grupos «Otros» (si venías filtrando en la cartelera, la carpeta se abre con el mismo filtro)',
    ] },
    { v: '2.1.0', name: 'Favoritos', date: 'Octubre 2026', items: [
      'Favoritos ♥ en todos los grupos: marca series, películas o videos sueltos desde la tarjeta, la página de la serie o el clic derecho',
      'Nueva sección «Favoritos» en el Inicio (se activa o desactiva en Ajustes → Apariencia) y filtro de favoritos en la cartelera',
      'Grupos «Otros»: filtro por duración de los videos (menos de 1 minuto, de 1 a 5, de 5 a 10, de 10 a 30 y más de 30 minutos); la duración se mide una sola vez y queda guardada',
    ] },
    { v: '2.0.1', name: 'Horizonte', date: 'Septiembre 2026', items: [
      'Mucho menos uso de la tarjeta gráfica, sobre todo en equipos con gráfica integrada (Intel/AMD): en Inicio baja de ~70 % a ~10 % y viendo un video de ~70 % a entre 10 % y 35 %',
      'Nuevo ajuste «Uso de la tarjeta gráfica» (Apariencia): Automático detecta tu gráfica y elige Calidad máxima, Equilibrado o Ahorro',
      'El fondo animado se pausa mientras ves un video o si la ventana no está en primer plano',
      'La luz ambiental se calcula en un lienzo diminuto: se ve igual y cuesta una décima parte',
      'El color por GPU solo se usa cuando hace falta; los ajustes simples van por filtros más livianos',
    ] },
    { v: '2.0.0', name: 'Horizonte', date: 'Septiembre 2026', items: [
      'Grupos personalizables en un menú lateral (Anime, Películas, Series, Otros…): cada uno con sus carpetas, ícono, color y su propia búsqueda en internet (o sin ella)',
      'Más fuentes para reconocer títulos: TVmaze y Wikipedia, además de AniList, MyAnimeList y Kitsu; y se puede vincular pegando el enlace de la página',
      'Rendimiento: los saltos al abrir un video en modo compatible ya no se quedan trabados; precarga del siguiente capítulo y panel de diagnóstico (Shift+D)',
      'Personalización: tema claro, oscuro, negro OLED o automático; color de acento (o según la portada); transparencia y desenfoque del cristal; imagen de fondo propia; tamaño de la interfaz y modo rendimiento',
      'Saltar opening y ending con marcas de AniSkip o las tuyas (clic derecho sobre el video)',
      'Perfiles: cada persona con su propio progreso y «Continuar viendo»',
      'Copia de seguridad: exporta y restaura toda tu biblioteca en un archivo',
      'Aviso de versiones nuevas desde GitHub, con descarga e instalación desde la app',
      'Mejora de imagen para anime: escalado a la resolución de la pantalla y líneas más nítidas por GPU (Shift+E)',
      'Interfaz en inglés (Ajustes → Apariencia → Idioma)',
    ] },
    { v: '1.7.1', name: 'Control', date: 'Septiembre 2026', items: ['Detecta bien el número de capítulo en nombres como «1x01», «Hielo03» o «Serie_01.Grupo»', 'Instalador para Windows (setup.exe)'] },
    { v: '1.7.0', name: 'Control', date: 'Septiembre 2026', items: ['Al abrir un capítulo a medias pregunta si continuar o empezar de cero (continúa solo a los 5 s)', 'Restablecer Kuro Player: deja la app como recién instalada', 'Quitar todas las carpetas y borrar progreso ahora piden confirmación en una ventana clara', 'Los preajustes del panel de color ya no pausan el video'] },
    { v: '1.6.1', name: 'Kuro', date: 'Septiembre 2026', items: ['Nuevo nombre: Kuro Player (tu biblioteca y progreso se conservan)', 'Identificar reproductores instalados y «Abrir con» para cada uno'] },
    { v: '1.6.0', name: 'Aurora', date: 'Septiembre 2026', items: ['Motor FFmpeg integrado: reproduce prácticamente cualquier formato (Hi10P, AC3, DTS, AVI, WMV…) con conversión al vuelo por GPU', 'Subtítulos incrustados y selección de pistas de audio', 'Miniaturas con FFmpeg para cualquier archivo', 'Sección «Acerca de»'] },
    { v: '1.5.0', name: 'Cine', date: 'Septiembre 2026', items: ['Modo cine (T) y barra de luz ambiental (G)', 'Ficha del capítulo con descripción y géneros', 'La ventana recuerda si estaba maximizada'] },
    { v: '1.4.0', name: 'Categorías', date: 'Septiembre 2026', items: ['Filtro por género y categorías propias', 'Recomendación del día y «Elegir uno al azar»', 'Ojo para marcar como visto y limpiar «Continuar viendo»', 'Separar o unir temporadas en subcarpetas'] },
    { v: '1.3.0', name: 'Novedades', date: 'Septiembre 2026', items: ['Detección automática de series y capítulos nuevos', 'Actualizar por carpeta sin duplicar', 'Marcas «NUEVO» y fila de capítulos nuevos'] },
    { v: '1.2.0', name: 'Inteligente', date: 'Septiembre 2026', items: ['Búsqueda tolerante a errores, prefijos y nombres pegados', 'Sugerencia de renombrar carpetas conservando prefijos'] },
    { v: '1.1.0', name: 'Cartelera', date: 'Septiembre 2026', items: ['Vista de lista con detalles', 'Datos de internet: descripción, géneros, estudio, puntuación y portada', 'Ajustes por secciones'] },
    { v: '1.0.0', name: 'Glass', date: 'Septiembre 2026', items: ['Primera versión: cartelera, reproductor moderno glass, color por GPU, subtítulos, mini reproductor'] },
  ];
  function libraryTotals() {
    let eps = 0, size = 0, secs = 0, watched = 0, withWeb = 0;
    for (const s of A.allSeries) {
      eps += s.episodes.length; size += s.size; if (s.web) withWeb++;
      for (const e of s.episodes) {
        const p = A.progress[e.path];
        if (!p) continue;
        secs += p.w ? (p.d || p.t || 0) : (p.t || 0);
        if (p.w) watched++;
      }
    }
    return { series: A.allSeries.length, eps, size, hours: secs / 3600, watched, withWeb, groups: A.groups.length };
  }
  function aboutBody() {
    const info = A.appInfo || {};
    const t = libraryTotals();
    const enc = { h264_qsv: 'Intel Quick Sync (GPU)', h264_nvenc: 'NVIDIA NVENC (GPU)', h264_amf: 'AMD AMF (GPU)', libx264: 'x264 (procesador)' }[info.encoder] || '—';
    const legend = { d: 'Directo', c: 'Modo compatible', p: 'Vía PotPlayer' };
    return `
      <div class="about-hero">
        <div class="about-glow"></div>
        <img class="about-logo" src="icon.png" alt="">
        <div class="about-title">
          <h1>Kuro<b>Player</b></h1>
          <div class="about-ver"><span class="ver-pill">v${esc(info.version || '2.1.3')}</span><span class="ver-name">«${esc(CHANGELOG[0].name)}»</span><span class="muted small">${esc(CHANGELOG[0].date)}</span></div>
          <p>Videoteca local para tu anime, películas y series: cartelera con portadas, reproductor moderno con efectos de cristal, color por GPU y compatibilidad universal de formatos.</p>
        </div>
      </div>

      <div class="about-stats">
        <div class="astat"><b>${t.series}</b><span>series</span></div>
        <div class="astat"><b>${t.eps.toLocaleString('es')}</b><span>capítulos</span></div>
        <div class="astat"><b>${fmtSize(t.size) || '0 B'}</b><span>en disco</span></div>
        <div class="astat"><b>${t.hours >= 10 ? Math.round(t.hours) : t.hours.toFixed(1)}</b><span>horas vistas</span></div>
        <div class="astat"><b>${t.watched}</b><span>capítulos vistos</span></div>
        <div class="astat"><b>${t.withWeb}</b><span>con datos web</span></div>
      </div>

      <div class="set-card">
        <h4><svg class="i"><use href="#i-check"/></svg>Formatos compatibles</h4>
        <div class="fmt-legend"><span class="fmt d">Directo</span> sin conversión · <span class="fmt c">Modo compatible</span> FFmpeg convierte al vuelo · <span class="fmt p">Vía PotPlayer</span> botón para abrirlo externo</div>
        <div class="fmt-groups">${FORMAT_GROUPS.map((g) => `<div class="fmt-group">
          <div class="fmt-head"><svg class="i"><use href="#${g.icon}"/></svg>${g.title}<small>${g.items.length}</small></div>
          <div class="chips">${g.items.map(([n, k]) => `<span class="fmt ${k}" title="${legend[k]}">${esc(n)}</span>`).join('')}</div>
        </div>`).join('')}</div>
      </div>

      <div class="set-card">
        <h4><svg class="i"><use href="#i-gear"/></svg>Información técnica</h4>
        <div class="tech-grid">
          <div><span>Versión</span><b>${esc(info.version || '—')}</b></div>
          <div><span>Motor de conversión</span><b>FFmpeg ${esc(info.ffmpeg || 'no disponible')}</b></div>
          <div><span>Aceleración de video</span><b>${esc(enc)}</b></div>
          <div><span>Electron</span><b>${esc(info.electron || '—')}</b></div>
          <div><span>Chromium</span><b>${esc(info.chrome || '—')}</b></div>
          <div><span>Node.js</span><b>${esc(info.node || '—')}</b></div>
          <div><span>Sistema</span><b>${esc(info.os || '—')}</b></div>
          <div><span>Procesado de color</span><b>WebGL (GPU)</b></div>
        </div>
        <div class="set-actions" style="margin-top:14px">
          <button class="btn glass" id="about-data"><svg class="i"><use href="#i-folder"/></svg>Abrir carpeta de datos</button>
          <button class="btn primary" id="about-update"><svg class="i"><use href="#i-refresh"/></svg>Buscar actualizaciones</button>
          <button class="btn glass" id="about-github"><svg class="i"><use href="#i-globe"/></svg>Página del proyecto</button>
        </div>
        ${rowSwitch('updateCheck', 'Avisar cuando haya una versión nueva', 'Al abrir la app se revisa GitHub; nunca se instala nada sin que lo confirmes.')}
      </div>
      <div class="set-card kofi-card"><h4><svg class="i"><use href="#i-heart-f"/></svg>Apoyar el proyecto</h4>
        <p>Kuro Player es gratis, sin anuncios y sin cuentas. Si te gusta y quieres apoyar su desarrollo, puedes invitarme un café en Ko-fi.</p>
        <div class="set-actions"><button class="btn kofi" id="about-kofi"><span class="cup">☕</span>Invitar un café en Ko-fi</button></div>
      </div>

      <div class="set-card">
        <h4><svg class="i"><use href="#i-star"/></svg>Historial de versiones</h4>
        <div class="timeline">${CHANGELOG.map((c, i) => `<div class="tl-item ${i === 0 ? 'current' : ''}">
          <div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-head"><b>v${c.v}</b><span>«${esc(c.name)}»</span>${i === 0 ? '<em>actual</em>' : ''}</div>
          <ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>`).join('')}</div>
      </div>

      <div class="set-card about-credits">
        <h4><svg class="i"><use href="#i-globe"/></svg>Créditos</h4>
        <p><b>FFmpeg</b> — decodificación y conversión de formatos (LGPL/GPL) · <b>Electron / Chromium</b> — base de la aplicación</p>
        <p><b>AniList</b>, <b>Kitsu</b> y <b>MyAnimeList (Jikan)</b> — información de series · <b>Google Translate</b> — traducción de descripciones · <b>TVmaze</b> y <b>Wikipedia</b> — series y películas · <b>AniSkip</b> — marcas de opening y ending · <b>Anime4K</b> (bloc97, MIT) — idea de la mejora de imagen</p>
        <p class="muted small">Hecho para uso personal. Todos tus datos se guardan solo en este equipo.</p>
      </div>`;
  }

  function settingsBody(tab) {
    if (tab === 'about') return aboutBody();
    if (tab === 'library') {
      const byRoot = new Map();
      for (const s of A.allSeries) {
        const k = (s.root || '').toLowerCase();
        const v = byRoot.get(k) || { series: 0, eps: 0, size: 0 };
        v.series++; v.eps += s.episodes.length; v.size += s.size;
        byRoot.set(k, v);
      }
      const folderCard = (r) => {
        const st = byRoot.get(r.path.toLowerCase()) || { series: 0, eps: 0, size: 0 };
        const name = r.path.split(/[\\/]/).filter(Boolean).pop() || r.path;
        return `<div class="folder-card ${r.exists ? '' : 'missing'}">
          <div class="folder-ico"><svg class="i"><use href="#i-folder"/></svg></div>
          <div class="folder-info"><b>${esc(name)}</b><span title="${esc(r.path)}">${esc(r.path)}</span>
            <div class="chips">${r.exists ? `<span class="mini-chip accent">${st.series} ${groupNoun(st.series, A.groups.find((g) => g.id === r.groupId) || curGroup())}</span>${(A.groups.find((g) => g.id === r.groupId) || {}).type === 'movies' ? '' : `<span class="mini-chip cyan">${st.eps} capítulos</span>`}<span class="mini-chip">${fmtSize(st.size) || '0 B'}</span>` : '<span class="mini-chip bad">La carpeta no existe o el disco no está conectado</span>'}</div>
          </div>
          ${r.exists ? `<button class="btn glass" data-root-refresh="${esc(r.path)}" title="Buscar series y capítulos nuevos en esta carpeta"><svg class="i"><use href="#i-refresh"/></svg>Actualizar</button>
          <button class="icon-btn" data-root-open="${esc(r.path)}" title="Abrir en el explorador"><svg class="i"><use href="#i-external"/></svg></button>` : ''}
          ${A.groups.length > 1 ? `<button class="icon-btn" data-move-root="${esc(r.path)}" title="Mover a otro grupo"><svg class="i"><use href="#i-grid"/></svg></button>` : ''}
          <button class="btn glass danger" data-rm-root="${esc(r.path)}"><svg class="i"><use href="#i-trash"/></svg>Quitar</button>
        </div>`;
      };
      const groupCards = A.groups.map((g) => {
        const roots = A.rootsInfo.filter((r) => r.groupId === g.id);
        const n = A.allSeries.filter((s) => s.groupId === g.id).length;
        const t = GROUP_TYPES[g.type] || GROUP_TYPES.other;
        return `<div class="set-card group-card" style="--gc:${g.color}">
          <div class="gc-head"><span class="rail-ico"><svg class="i"><use href="#i-g-${esc(g.icon)}"/></svg></span>
            <div><b>${esc(g.name)}</b><span>${t.label} · ${n} ${groupNoun(n, g)} · ${roots.length} carpeta${roots.length === 1 ? '' : 's'} · ${g.web ? 'busca datos en internet' : 'sin búsqueda en internet'}</span></div>
            <button class="btn glass" data-g-add="${g.id}"><svg class="i"><use href="#i-plus"/></svg>Carpeta</button>
            <button class="icon-btn" data-g-edit="${g.id}" title="Editar grupo"><svg class="i"><use href="#i-edit"/></svg></button></div>
          <div class="folder-list">${roots.length ? roots.map(folderCard).join('') : `<div class="folder-empty">Sin carpetas. Pulsa «Carpeta» para agregar tus ${t.many}.</div>`}</div>
        </div>`;
      }).join('');
      return `
        <div class="set-card">
          <h4><svg class="i"><use href="#i-grid"/></svg>Grupos y carpetas <small class="muted" style="font-weight:600">(${A.groups.length} grupos · ${A.rootsInfo.length} carpetas)</small></h4>
          <p>Cada grupo tiene sus propias carpetas y aparece en el menú de la izquierda; lo de un grupo no se mezcla con otro. Los archivos nunca se modifican ni se borran: «Quitar» solo deja de mostrarlos en la app.</p>
          <div class="set-actions" style="margin:0">
            <button class="btn primary" id="set-new-group"><svg class="i"><use href="#i-plus"/></svg>Nuevo grupo</button>
            <button class="btn glass" id="set-rescan"><svg class="i"><use href="#i-refresh"/></svg>Actualizar todas</button>
            ${A.rootsInfo.length ? `<button class="btn glass danger" id="set-clear-roots"><svg class="i"><use href="#i-trash"/></svg>Quitar todas las carpetas</button>` : ''}
          </div>
        </div>
        ${groupCards}
        <div class="set-card">
          <h4><svg class="i"><use href="#i-grid"/></svg>Temporadas en subcarpetas</h4>
          ${rowSwitch('splitSeasons', 'Separar temporadas por defecto', 'Si la carpeta de una serie tiene subcarpetas (ej. «Nombre 1», «Nombre 2»), cada una aparece como una tarjeta propia. Si está apagado se agrupan en una sola serie con pestañas.', false)}
          <div class="set-row"><div class="lbl"><b>Se puede cambiar serie por serie</b><span>En la página de la serie o con clic derecho: «Separar temporadas» / «Unir temporadas».</span></div></div>
        </div>
        <div class="set-card">
          <h4><svg class="i"><use href="#i-refresh"/></svg>Novedades</h4>
          ${rowSwitch('autoWatch', 'Detectar cambios automáticamente', 'Al copiar capítulos o carpetas nuevas se agregan solos a los pocos segundos, sin volver a cargar lo que ya existe.')}
          <div class="set-row"><div class="lbl"><b>Agregar una carpeta que ya está cargada</b><span>No se duplica: solo se buscan las series y capítulos nuevos. Lo nuevo se marca como «NUEVO» durante 7 días.</span></div></div>
        </div>
        <div class="set-card">
          <h4><svg class="i"><use href="#i-image"/></svg>Cómo se detectan portadas y fondos</h4>
          <p style="margin:0">Portada: imagen llamada <b>cover</b>, <b>poster</b>, <b>portada</b> o <b>folder</b> (.jpg/.png/.webp) dentro de la carpeta de la serie; si no hay, la primera imagen que encuentre; si no, la de internet o un cuadro del capítulo 1. Fondo/banner: <b>fondo</b>, <b>fanart</b>, <b>banner</b> o <b>backdrop</b>. Subcarpetas como «Temporada 1» se agrupan dentro de la misma serie.</p>
        </div>
        <div class="set-card reset-card">
          <h4><svg class="i"><use href="#i-refresh"/></svg>Restablecer Kuro Player</h4>
          <p>Deja la aplicación como recién instalada: borra la lista de carpetas, el progreso y «Continuar viendo», los datos de internet, portadas y fondos elegidos, categorías, ajustes, miniaturas y caché. <b>Tus videos no se tocan.</b></p>
          <div class="set-actions"><button class="btn danger-solid" id="set-factory"><svg class="i"><use href="#i-trash"/></svg>Restablecer todo</button></div>
        </div>`;
    }
    if (tab === 'web') {
      const st = webStats();
      return `
        <div class="set-card">
          <h4><svg class="i"><use href="#i-globe"/></svg>Cargar datos de la biblioteca</h4>
          <p>Busca cada serie por el nombre de su carpeta. Si el nombre coincide con un anime real se guarda automáticamente; si hay dudas queda «por confirmar» para que elijas tú. Requiere internet (~2 s por serie).</p>
          <div class="chips" style="margin-bottom:12px"><span class="mini-chip ok">✓ ${st.ok} vinculadas</span><span class="mini-chip warn">? ${st.doubt} por confirmar</span><span class="mini-chip bad">✗ ${st.none} sin coincidencia</span><span class="mini-chip">${st.pending} sin buscar</span></div>
          <div class="set-actions">
            <button class="btn primary" id="web-run" ${webRun ? 'hidden' : ''}><svg class="i"><use href="#i-globe"/></svg>${st.pending + st.none + st.doubt ? `Cargar datos (${st.pending + st.none + st.doubt} series)` : 'Todo está vinculado'}</button>
            <button class="btn glass" id="web-run-all" ${webRun ? 'hidden' : ''}><svg class="i"><use href="#i-refresh"/></svg>Actualizar todas</button>
            <button class="btn glass danger" id="web-stop" ${webRun ? '' : 'hidden'}>Detener</button>
          </div>
          <div class="web-prog" id="web-prog" ${webRun ? '' : 'hidden'}><div class="track"><i style="width:${webRun && webRun.total ? (webRun.done / webRun.total) * 100 : 0}%"></i></div>
            <div class="txt"><span id="web-prog-t">${webRun ? 'Buscando: ' + esc(webRun.title || '') : ''}</span><span id="web-prog-n"></span></div></div>
        </div>
        <div class="set-card">
          <h4><svg class="i"><use href="#i-folder"/></svg>Carpetas con nombre distinto al oficial</h4>
          <p>Nombres incompletos, mal escritos, con guiones bajos o palabras pegadas. Puedes renombrarlas con el título correcto; los prefijos de orden como «1_» o «M_» se conservan.</p>
          <div class="review-list" id="rename-list"></div>
          <div class="set-actions" style="margin-top:12px" id="rename-all-wrap"></div>
        </div>
        ${A.allSeries.some((x) => x.keepName) ? `<div class="set-card">
          <h4><svg class="i"><use href="#i-check"/></svg>Carpetas con nombre conservado</h4>
          <p>No se sugiere renombrarlas aunque el título oficial sea distinto.</p>
          <div class="review-list">${A.allSeries.filter((x) => x.keepName).map((x) => `<div class="review-item">${x.cover ? `<img src="${esc(x.cover)}" alt="">` : ''}
            <div class="ri-t"><b>${esc(x.folderName)}</b><span>${x.web ? 'Oficial: ' + esc(officialName(x)) : ''}</span></div>
            <button class="btn glass" data-unkeep="${x.id}">Volver a sugerir</button></div>`).join('')}</div>
        </div>` : ''}
        <div class="set-card">
          <h4><svg class="i"><use href="#i-search"/></svg>Revisar coincidencias dudosas</h4>
          <p>Nombres de carpeta que no coinciden exactamente con un título oficial.</p>
          <div class="review-list" id="web-review"></div>
        </div>
        <div class="set-card">
          <h4><svg class="i"><use href="#i-gear"/></svg>Opciones</h4>
          ${rowSwitch('translateSynopsis', 'Traducir descripciones al español', 'Las fuentes están en inglés; se traducen automáticamente al guardar.')}
          ${rowSwitch('webCovers', 'Descargar portadas y banners', 'Solo para series que no tienen portada propia en su carpeta.')}
          ${rowSwitch('suggestRename', 'Sugerir renombrar carpetas', 'Avisa cuando el nombre de una carpeta no coincide con el título oficial. Desactívalo para conservar siempre tus nombres.')}
          <div class="set-row"><div class="lbl"><b>Título que se muestra</b><span>Tus títulos editados a mano siempre tienen prioridad.</span></div>
            <select class="sel" id="set-title-src">
              ${[['folder', 'Nombre de la carpeta'], ['romaji', 'Título oficial (romaji)'], ['english', 'Título en inglés'], ['japanese', 'Título japonés']].map(([v, l]) => `<option value="${v}" ${(A.settings.titleSource || 'romaji') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
          <div class="set-row"><div class="lbl"><b>Borrar datos de internet</b><span>Quita descripciones, géneros y portadas descargadas (no toca tus archivos).</span></div>
            <button class="btn glass danger" id="web-clear-all"><svg class="i"><use href="#i-trash"/></svg>Borrar</button></div>
        </div>`;
    }
    if (tab === 'play') {
      return `<div class="set-card"><h4><svg class="i"><use href="#i-keyboard"/></svg>Teclado</h4>
          ${rowNum('seekStep', 'Salto con ← →', 'Adelantar / retroceder', 1, 120, 'seg')}
          ${rowNum('seekStepLong', 'Salto con Shift + ← →', 'Salto largo', 1, 600, 'seg')}
          ${rowNum('volumeStep', 'Volumen con ↑ ↓ y rueda', 'Cuánto sube o baja cada vez', 1, 50, '%')}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-home"/></svg>Inicio e historial</h4>
          <div class="set-row"><div class="lbl"><b>Limpiar «Continuar viendo»</b><span>Vacía la fila del Inicio. No borra tu progreso ni los capítulos vistos; las series vuelven a aparecer cuando sigas viéndolas.</span></div>
            <button class="btn glass" id="set-clear-continue"><svg class="i"><use href="#i-trash"/></svg>Limpiar</button></div>
          <div class="set-row"><div class="lbl"><b>Borrar todo el progreso</b><span>Olvida posiciones guardadas y capítulos vistos de toda la biblioteca.</span></div>
            <button class="btn glass danger" id="set-clear-progress"><svg class="i"><use href="#i-trash"/></svg>Borrar progreso</button></div>
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-folder"/></svg>Copia de seguridad</h4>
          <p>Guarda en un archivo tus grupos, carpetas, progreso de todos los perfiles, datos de internet, categorías, ajustes y portadas. Útil para cambiar de PC o reinstalar.</p>
          <div class="set-actions"><button class="btn primary" id="bk-export"><svg class="i"><use href="#i-folder"/></svg>Exportar copia...</button><button class="btn glass" id="bk-import"><svg class="i"><use href="#i-refresh"/></svg>Restaurar copia...</button></div>
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-color"/></svg>Mejora de imagen</h4>
          <div class="set-row"><div class="lbl"><b>Escalado y líneas nítidas para anime</b><span>Escala el video a la resolución de tu pantalla en la tarjeta gráfica y afina las líneas del dibujo (inspirado en Anime4K). Útil en capítulos de 480p o 720p. También desde el panel de color o con Shift+E. No se usa en modo rendimiento.</span></div>
            <select class="sel" id="set-enhance">${Object.entries(ENHANCE_LEVELS).map(([v, l]) => `<option value="${v}" ${(A.settings.enhance || 'off') === v ? 'selected' : ''}>${l ? l.name : 'Apagada'}</option>`).join('')}</select></div>
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-next"/></svg>Capítulos</h4>
          <div class="set-row"><div class="lbl"><b>Opening y ending</b><span>Usa las marcas de AniSkip (gratis, para anime vinculado a internet) o las que pongas tú con clic derecho sobre el video → «El opening empieza aquí».</span></div>
            <select class="sel" id="set-skip">${[['button', 'Mostrar botón «Saltar»'], ['auto', 'Saltar automáticamente'], ['off', 'Desactivado']].map(([v, l]) => `<option value="${v}" ${(A.settings.skipMode || 'button') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${rowSwitch('aniskip', 'Buscar marcas en AniSkip', 'Descarga desde internet dónde empiezan y terminan el opening y el ending de cada capítulo.')}
          ${rowSwitch('prefetch', 'Precargar el siguiente capítulo', 'En el último minuto se deja listo el siguiente para que empiece sin espera.')}
          ${rowSwitch('askResume', 'Preguntar si continuar o empezar de cero', 'Al abrir un capítulo a medias aparece un aviso con «Continuar» y «Desde el inicio». Si no eliges nada en 5 segundos, continúa donde lo dejaste. Apagado: continúa directamente.')}
          ${rowSwitch('autoNext', 'Reproducir el siguiente automáticamente', 'Al terminar un capítulo se muestra una cuenta atrás.')}
          ${rowNum('autoNextDelay', 'Cuenta atrás', 'Segundos antes de pasar al siguiente', 1, 60, 'seg')}
        </div>`;
    }
    if (tab === 'subs') {
      return `<div class="set-card"><h4><svg class="i"><use href="#i-sub"/></svg>Subtítulos externos</h4>
          ${rowSwitch('subsAuto', 'Cargar automáticamente', 'Si junto al video hay un .srt/.ass/.vtt con el mismo nombre.')}
          <div class="set-row"><div class="lbl"><b>Tamaño y altura</b><span>También se ajustan desde el botón de subtítulos del reproductor (tecla S alterna pistas).</span></div></div>
          <p class="muted small" style="margin:6px 0 0">Nota: los subtítulos incrustados dentro de archivos MKV no se pueden leer en el reproductor integrado; usa «Abrir en PotPlayer» para esos.</p>
        </div>`;
    }
    if (tab === 'look') {
      const cats = allCustomCategories();
      const th = A.settings.theme || 'dark';
      const acc = A.settings.accent || 'violeta';
      const pct = (k, d) => (A.settings[k] == null ? d : A.settings[k]);
      return `<div class="set-card"><h4><svg class="i"><use href="#i-color"/></svg>Tema</h4>
          <div class="theme-pick">${[['dark', 'Oscuro', 'linear-gradient(135deg,#0c1120,#1e1b4b)'], ['oled', 'Negro OLED', '#000'], ['light', 'Claro', 'linear-gradient(135deg,#f5f7fc,#dde3f0)'], ['system', 'Automático', 'linear-gradient(90deg,#0c1120 50%,#eef1f8 50%)']]
            .map(([k, l, bg]) => `<button class="${th === k ? 'on' : ''}" data-theme="${k}"><span class="sw" style="background:${bg}"></span>${l}</button>`).join('')}</div>
          <p class="muted small" style="margin:10px 0 0">«Automático» sigue el modo claro u oscuro de Windows.</p>
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-star"/></svg>Color de acento</h4>
          <div class="accent-row">${Object.entries(ACCENTS).map(([k, a]) => `<button class="${acc === k ? 'on' : ''}" data-accent="${k}" title="${a.name}" style="background:linear-gradient(135deg,rgb(${a.c[0]}),rgb(${a.c[2]}))"></button>`).join('')}
            <input type="color" id="accent-custom" value="${/^#/.test(acc) ? acc : '#a855f7'}" title="Elegir otro color"></div>
          ${rowSwitch('accentFromCover', 'Color según la portada', 'Al abrir una serie o reproducir, el color de acento toma el tono de su portada.', false)}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-image"/></svg>Efecto cristal y fondo</h4>
          <div class="set-row"><div class="lbl"><b>Transparencia de los paneles</b><span>Más bajo = paneles más transparentes; más alto = más sólidos.</span></div>
            <div class="range-row"><input type="range" min="0" max="100" value="${pct('glassLevel', 50)}" data-set-range="glassLevel"><em>${pct('glassLevel', 50)}%</em></div></div>
          <div class="set-row"><div class="lbl"><b>Desenfoque del cristal</b><span>0 = sin efecto de vidrio.</span></div>
            <div class="range-row"><input type="range" min="0" max="100" value="${pct('blurLevel', 50)}" data-set-range="blurLevel"><em>${pct('blurLevel', 50)}%</em></div></div>
          ${rowSwitch('bgAnim', 'Fondo animado', 'Manchas de color que se mueven lentamente detrás de la interfaz.')}
          <div class="set-row"><div class="lbl"><b>Imagen de fondo propia</b><span>Una imagen tuya detrás de toda la app (se ve a través del cristal).</span></div>
            <div class="set-actions" style="margin:0"><button class="btn glass" id="bg-pick"><svg class="i"><use href="#i-image"/></svg>${A.settings.bgImage ? 'Cambiar' : 'Elegir imagen'}</button>${A.settings.bgImage ? '<button class="btn glass danger" id="bg-clear">Quitar</button>' : ''}</div></div>
          ${A.settings.bgImage ? `<div class="set-row"><div class="lbl"><b>Intensidad de la imagen</b></div><div class="range-row"><input type="range" min="10" max="100" value="${pct('bgOpacity', 45)}" data-set-range="bgOpacity"><em>${pct('bgOpacity', 45)}%</em></div></div>` : ''}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-grid"/></svg>Interfaz</h4>
          <div class="set-row"><div class="lbl"><b>Idioma de la interfaz</b><span>La app se recarga al cambiarlo. En inglés las descripciones se muestran en su idioma original.</span></div>
            <select class="sel notr" id="set-lang"><option value="es" ${I18N.lang !== 'en' ? 'selected' : ''}>Español</option><option value="en" ${I18N.lang === 'en' ? 'selected' : ''}>English</option></select></div>
          <div class="set-row"><div class="lbl"><b>Tamaño de la interfaz</b><span>Agranda o achica textos y botones.</span></div>
            <select class="sel" id="set-zoom">${[[0.85, '85%'], [0.9, '90%'], [1, '100% (normal)'], [1.1, '110%'], [1.25, '125%']].map(([v, l]) => `<option value="${v}" ${(A.settings.uiScale || 1) == v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${rowSwitch('showRail', 'Menú lateral de grupos', 'La barra de la izquierda con tus grupos (Anime, Películas...).')}
          <div class="set-row"><div class="lbl"><b>Uso de la tarjeta gráfica</b><span>Automático elige según tu equipo (detectado: ${esc(detectGpu().name)} → ${GPU_LABELS[detectGpu().tier]}). Equilibrado conserva el aspecto pero pausa el fondo animado y el efecto cristal mientras ves un video. Ahorro quita el desenfoque y procesa el color sin WebGL, ideal para equipos sin tarjeta gráfica dedicada.</span></div>
            <select class="sel" id="set-gpu">${[['auto', 'Automático'], ['quality', 'Calidad máxima'], ['balanced', 'Equilibrado'], ['eco', 'Ahorro']].map(([v, l]) => `<option value="${v}" ${(A.settings.gpuMode || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${rowSwitch('perfMode', 'Modo rendimiento', 'Para PCs más lentas: quita el cristal, las animaciones y la luz ambiental.', false)}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-home"/></svg>Secciones del Inicio</h4>
          <p>Activa o desactiva lo que se muestra en la pantalla de Inicio.</p>
          ${rowSwitch('dailyReco', 'Recomendación del día', '5 capítulos al azar (cambian cada día) y el botón «Elegir uno al azar».')}
          ${rowSwitch('homeContinue', 'Continuar viendo', 'Series que dejaste a medias.')}
          ${rowSwitch('homeFav', 'Favoritos', 'Series, películas y videos que marcaste con ♥.')}
          ${rowSwitch('homeNew', 'Capítulos nuevos', 'Capítulos agregados en los últimos 7 días.')}
          ${rowSwitch('homeRecent', 'Agregados recientemente', 'Últimas series agregadas a la biblioteca.')}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-star"/></svg>Categorías propias</h4>
          <p>Se crean desde «Editar» en una serie, o en la Cartelera con el botón «Seleccionar» para varias series a la vez. Aparecen con ★ en el filtro de géneros.</p>
          ${cats.length ? `<div class="review-list">${cats.map(([g, n]) => `<div class="review-item"><div class="ri-t"><b>★ ${esc(g)}</b><span>${n} ${n === 1 ? 'serie' : 'series'}</span></div>
            <button class="btn glass" data-cat-view="${esc(g)}">Ver</button><button class="btn glass" data-cat-rename="${esc(g)}">Renombrar</button><button class="btn glass danger" data-cat-delete="${esc(g)}">Eliminar</button></div>`).join('')}</div>` : '<div class="muted small">Aún no has creado categorías.</div>'}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-grid"/></svg>Cartelera</h4>
          <div class="set-row"><div class="lbl"><b>Vista por defecto</b><span>También se cambia con los botones de la cartelera.</span></div>
            <select class="sel" id="set-lview"><option value="grid" ${(A.settings.libraryView || 'grid') === 'grid' ? 'selected' : ''}>Cuadrícula de portadas</option><option value="list" ${A.settings.libraryView === 'list' ? 'selected' : ''}>Lista con detalles</option></select></div>
          ${rowSwitch('ambient', 'Luz ambiental alrededor del video', 'Brillo de colores del video detrás del reproductor.')}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-image"/></svg>Miniaturas de capítulos</h4>
          ${rowSwitch('thumbnails', 'Generar miniaturas automáticamente', 'Se crea una imagen de cada capítulo al navegar.')}
          <div class="set-row"><div class="lbl"><b>Regenerar miniaturas</b><span>Borra las miniaturas guardadas para crearlas de nuevo.</span></div>
            <button class="btn glass danger" id="set-clear-thumbs"><svg class="i"><use href="#i-refresh"/></svg>Regenerar</button></div>
        </div>`;
    }
    if (tab === 'ext') {
      const list = playersList();
      return `<div class="set-card"><h4><svg class="i"><use href="#i-search"/></svg>Identificar reproductores instalados</h4>
          <p>Busca reproductores de video conocidos en las carpetas de programas y en el registro de Windows (solo lectura, no se modifica nada). Los que actives aparecen en <b>clic derecho → Abrir con</b>.</p>
          <div class="set-actions"><button class="btn primary" id="pl-detect"><svg class="i"><use href="#i-search"/></svg>Identificar reproductores</button>
            <button class="btn glass" id="pl-add"><svg class="i"><use href="#i-plus"/></svg>Agregar otro programa...</button></div>
          ${A.playersLastScan ? `<p class="muted small" style="margin:10px 0 0">Última búsqueda: ${esc(A.playersLastScan)}</p>` : ''}
        </div>
        <div class="set-card"><h4><svg class="i"><use href="#i-external"/></svg>Reproductores disponibles <small class="muted" style="font-weight:600">(${list.length})</small></h4>
          <p>Activa los que quieras ver en «Abrir con». Si el programa lo permite (PotPlayer, VLC, MPC, mpv) continúa en el mismo segundo.</p>
          <div class="folder-list">${list.length ? list.map((p) => `<div class="folder-card ${p.exists === false ? 'missing' : ''}">
              <div class="folder-ico"><svg class="i"><use href="#i-play"/></svg></div>
              <div class="folder-info"><b>${esc(p.name)}</b><span title="${esc(p.path)}">${esc(p.path)}</span>
                <div class="chips">${p.seek ? '<span class="mini-chip ok">continúa en el mismo segundo</span>' : '<span class="mini-chip">abre desde el inicio</span>'}${p.custom ? '<span class="mini-chip accent">agregado a mano</span>' : ''}</div></div>
              <label class="switch" title="Mostrar en «Abrir con»"><input type="checkbox" data-pl-toggle="${esc(p.id)}" ${p.enabled !== false ? 'checked' : ''}><span></span></label>
              <button class="icon-btn" data-pl-remove="${esc(p.id)}" title="Quitar de la lista"><svg class="i"><use href="#i-trash"/></svg></button>
            </div>`).join('') : '<div class="folder-empty">Aún no hay reproductores. Pulsa «Identificar reproductores».</div>'}</div>
        </div>`;
    }
    return '';
  }

  async function openSettings(tab) {
    if (tab) setTab = tab;
    A.rootsInfo = await window.cinema.rootsInfo();
    if (setTab === 'about' && !A.appInfo) { try { A.appInfo = await window.cinema.appInfo(); } catch (e) { A.appInfo = {}; } }
    const st = webStats();
    openModal(`
      <nav class="set-nav">
        <h2><svg class="i"><use href="#i-gear"/></svg>Ajustes</h2>
        ${SET_TABS.map((t) => `<button class="set-tab ${t.id === setTab ? 'active' : ''}" data-set-tab="${t.id}"><svg class="i"><use href="#${t.icon}"/></svg>${t.label}${t.id === 'library' ? `<small>${A.rootsInfo.length}</small>` : t.id === 'web' && st.doubt ? `<small style="color:#fde68a">${st.doubt}</small>` : ''}</button>`).join('')}
        <div class="spacer"></div>
        <div class="nav-ver">Kuro Player v${esc((A.appInfo && A.appInfo.version) || '2.1.3')}</div>
        <button class="btn primary" data-close>Listo</button>
      </nav>
      <section class="set-main">
        <div class="set-head"><div><h3>${SET_TABS.find((t) => t.id === setTab).label}</h3><p>${SET_TABS.find((t) => t.id === setTab).desc}</p></div></div>
        <div class="set-body">${settingsBody(setTab)}</div>
      </section>`);
    $('#modal-card').classList.add('wide');
    bindSettings();
  }
  function refreshSettings() { if (!$('#modal').hidden && $('.set-nav')) openSettings(); }

  let renameArmed = 0;
  function renderRenameList() {
    const box = $('#rename-list');
    if (!box) return;
    const list = A.allSeries.map((s) => ({ s, r: renameSuggestion(s) })).filter((x) => x.r);
    box.innerHTML = list.length ? list.map(({ s, r }) => `<div class="review-item">
        ${s.cover ? `<img src="${esc(s.cover)}" alt="">` : ''}
        <div class="ri-t"><b>${esc(s.folderName)}</b><span>→ ${esc(r.newName)}</span></div>
        <button class="btn glass" data-rename="${s.id}">Renombrar...</button><button class="btn glass" data-keep-name="${s.id}" title="No volver a sugerir para esta serie">Mantener mi nombre</button></div>`).join('')
      : '<div class="muted small">Todas las carpetas vinculadas ya tienen su nombre oficial.</div>';
    const wrap = $('#rename-all-wrap');
    wrap.innerHTML = list.length > 1 ? `<button class="btn glass" id="rename-all">${renameArmed > Date.now() ? `¿Seguro? Clic otra vez para renombrar ${list.length} carpetas` : `Renombrar todas (${list.length})`}</button>` : '';
    const b = $('#rename-all');
    if (b) b.onclick = async () => {
      if (renameArmed < Date.now()) { renameArmed = Date.now() + 4000; renderRenameList(); setTimeout(renderRenameList, 4100); return; }
      renameArmed = 0; b.disabled = true; b.textContent = 'Renombrando...';
      await renameAll(list.map((x) => x.s));
      openSettings();
    };
  }
  function renderReview() {
    renderRenameList();
    const box = $('#web-review');
    if (!box) return;
    const webGroups = new Set(A.groups.filter((g) => g.web).map((g) => g.id));
    const list = A.allSeries.filter((s) => webGroups.has(s.groupId) && !s.web && (s.webStatus === 'doubt' || s.webStatus === 'none'));
    box.innerHTML = list.length ? list.map((s) => `<div class="review-item">
        ${s.webCandidate && s.webCandidate.image ? `<img src="${esc(s.webCandidate.image)}" alt="">` : ''}
        <div class="ri-t"><b>${esc(s.folderName)}</b><span>${s.webStatus === 'doubt' && s.webCandidate ? `¿${esc(s.webCandidate.title)}${s.webCandidate.year ? ' (' + s.webCandidate.year + ')' : ''}? · ${Math.round(s.webCandidate.confidence * 100)}% parecido` : 'Sin coincidencia con este nombre'}</span></div>
        ${s.webStatus === 'doubt' ? `<button class="btn primary" data-web-confirm="${s.id}">Sí, usar</button><button class="btn glass" data-web-reject="${s.id}">No es</button>` : ''}
        <button class="btn glass" data-web-pick="${s.id}">Buscar</button></div>`).join('')
      : '<div class="muted small">No hay nada pendiente de revisar.</div>';
  }

  function bindSettings() {
    $$('[data-set-tab]').forEach((b) => b.onclick = () => openSettings(b.dataset.setTab));
    $$('[data-set-bool]').forEach((i) => i.onchange = () => {
      saveSettings({ [i.dataset.setBool]: i.checked });
      if (i.dataset.setBool === 'ambient') Player.refreshGlow();
      if (['bgAnim', 'perfMode', 'showRail', 'accentFromCover'].includes(i.dataset.setBool)) { applyTheme(); renderRail(); }
      if (i.dataset.setBool === 'perfMode') Player.applyEnhance();
      if (['translateSynopsis', 'dailyReco', 'homeContinue', 'homeFav', 'homeNew', 'homeRecent'].includes(i.dataset.setBool)) renderAll();
      if (i.dataset.setBool === 'suggestRename') { renderAll(); openSettings(); }
      if (i.dataset.setBool === 'splitSeasons') { window.cinema.setSettings(A.settings).then(() => scan(false)).then(() => openSettings()); }
    });
    $$('[data-set-num]').forEach((i) => i.onchange = () => {
      const v = clamp(+i.value || +i.min, +i.min, +i.max);
      i.value = v;
      saveSettings({ [i.dataset.setNum]: v });
    });
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('#set-new-group', () => openGroupEditor(null, () => openSettings('library')));
    $$('[data-g-add]').forEach((b) => b.onclick = async () => { await addFolders(b.dataset.gAdd); openSettings('library'); });
    $$('[data-g-edit]').forEach((b) => b.onclick = () => openGroupEditor(A.groups.find((g) => g.id === b.dataset.gEdit), () => openSettings('library')));
    $$('[data-move-root]').forEach((b) => b.onclick = (ev) => {
      const r = ev.currentTarget.getBoundingClientRect();
      const p = b.dataset.moveRoot;
      ctxMenu(r.left - 150, r.bottom + 6, A.groups.map((g) => ({ icon: 'i-g-' + g.icon, label: 'Mover a «' + g.name + '»', action: async () => {
        const res = await window.cinema.moveRoot(p, g.id); A.groups = res.groups; await scan(true); toast(`Carpeta movida a «${g.name}»`); openSettings('library');
      } })));
    });
    on('#set-rescan', async () => { await scan(); openSettings(); });
    on('#set-clear-roots', async () => {
      const n = A.rootsInfo.length;
      const ok = await confirmBox({ title: 'Quitar todas las carpetas', danger: true, ok: `Quitar ${n} carpeta${n === 1 ? '' : 's'}`,
        html: '<p>Se quitan las carpetas de <b>todos los grupos</b> (los grupos se conservan). <b>Tus videos no se borran</b>, y el progreso y los datos de internet se conservan por si vuelves a agregar las carpetas.</p>' });
      if (!ok) return;
      if (Player.state.ep) Player.close();
      const res = await window.cinema.clearRoots();
      A.groups = res.groups; A.roots = res.roots;
      while (A.scanning) await new Promise((r) => setTimeout(r, 150));
      await scan(true, { quiet: true });
      toast(`Se quitaron ${n} carpeta${n === 1 ? '' : 's'} (tus archivos no se tocaron)`);
      openSettings('library');
    });
    on('#set-factory', async () => {
      const ok = await confirmBox({ title: 'Restablecer Kuro Player', danger: true, ok: 'Sí, restablecer todo',
        html: '<p>Se borrará <b>todo lo guardado en la app</b>, como si la acabaras de instalar:</p>'
          + '<ul><li>Carpetas de la cartelera</li><li>Progreso, «Continuar viendo» y capítulos vistos</li><li>Datos de internet, nombres, portadas y fondos elegidos</li><li>Categorías propias y ajustes (color, subtítulos, reproductores externos…)</li><li>Miniaturas y caché</li></ul>'
          + '<p><b>Tus archivos de video no se tocan.</b> Esto no se puede deshacer.</p>' });
      if (!ok) return;
      if (Player.state.ep) Player.close();
      closeModal();
      await window.cinema.factoryReset();
      location.reload();
    });
    $$('[data-rm-root]').forEach((b) => b.onclick = async () => {
      const res = await window.cinema.removeRoot(b.dataset.rmRoot);
      A.roots = res.roots; A.groups = res.groups;
      await scan(true);
      toast('Carpeta quitada de la cartelera');
      openSettings();
    });
    $$('[data-root-open]').forEach((b) => b.onclick = () => window.cinema.openDir(b.dataset.rootOpen));
    $$('[data-root-refresh]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.innerHTML = '<svg class="i"><use href="#i-refresh"/></svg>Buscando...';
      await scan(false, { root: b.dataset.rootRefresh });
      openSettings();
    });
    on('#web-run', () => { startWebFetch({ onlyMissing: true }); openSettings(); });
    on('#web-run-all', () => { startWebFetch({ onlyMissing: false }); openSettings(); });
    on('#web-stop', async () => { await window.cinema.webCancel(); toast('Deteniendo...'); });
    on('#web-clear-all', async () => { await window.cinema.webClearAll(); await scan(true); toast('Datos de internet borrados'); openSettings(); });
    const ts = $('#set-title-src');
    if (ts) ts.onchange = async () => { saveSettings({ titleSource: ts.value }); await scan(true); };
    $$('[data-theme]').forEach((b) => b.onclick = () => { saveSettings({ theme: b.dataset.theme }); applyTheme(); openSettings('look'); });
    $$('[data-accent]').forEach((b) => b.onclick = () => { saveSettings({ accent: b.dataset.accent }); applyTheme(); openSettings('look'); });
    const ac = $('#accent-custom');
    if (ac) ac.onchange = () => { saveSettings({ accent: ac.value }); applyTheme(); openSettings('look'); };
    $$('[data-set-range]').forEach((r) => {
      setRangeFill(r);
      r.oninput = () => { setRangeFill(r); r.nextElementSibling.textContent = r.value + '%'; saveSettings({ [r.dataset.setRange]: +r.value }); applyTheme(); };
    });
    on('#bg-pick', async () => { const url = await window.cinema.pickBackground(); if (url) { saveSettings({ bgImage: url }); applyTheme(); openSettings('look'); } });
    on('#bg-clear', () => { saveSettings({ bgImage: '' }); applyTheme(); openSettings('look'); });
    const gp = $('#set-gpu');
    if (gp) gp.onchange = () => { saveSettings({ gpuMode: gp.value }); applyTheme(); Player.applyGpuMode(); };
    const lg = $('#set-lang');
    if (lg) lg.onchange = async () => { await window.cinema.setSettings({ ...A.settings, lang: lg.value }); A.settings.lang = lg.value; I18N.setLang(lg.value); };
    const en = $('#set-enhance');
    if (en) en.onchange = () => { saveSettings({ enhance: en.value }); Player.applyEnhance(); };
    const sk = $('#set-skip');
    if (sk) sk.onchange = () => saveSettings({ skipMode: sk.value });
    const zm = $('#set-zoom');
    if (zm) zm.onchange = () => { saveSettings({ uiScale: +zm.value }); applyTheme(); };
    const lv = $('#set-lview');
    if (lv) lv.onchange = () => { saveSettings({ libraryView: lv.value }); renderLibrary(); };
    $$('[data-cat-view]').forEach((b) => b.onclick = () => { closeModal(); A.genre = b.dataset.catView; A.letter = 'all'; go('library'); });
    $$('[data-cat-rename]').forEach((b) => b.onclick = () => openCategoryRename(b.dataset.catRename));
    $$('[data-cat-delete]').forEach((b) => b.onclick = async () => {
      const g = b.dataset.catDelete;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Seguro?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Eliminar'; }, 3500); return; }
      await saveCategories(A.series.filter((x) => (x.customGenres || []).includes(g)), (arr) => arr.filter((x) => x !== g));
      if (A.genre === g) A.genre = null;
      toast(`Categoría «${g}» eliminada`);
      openSettings('look');
    });
    on('#set-clear-continue', () => {
      saveSettings({ [pk('continueClearedAt')]: Date.now(), [pk('continueHidden')]: {} });
      renderHome();
      toast('«Continuar viendo» limpiado');
    });
    on('#set-clear-progress', async () => {
      if (!await confirmBox({ title: 'Borrar progreso', danger: true, ok: 'Borrar progreso', html: '<p>Se borra el punto donde te quedaste y las marcas de «visto» de todos los capítulos.</p>' })) return;
      const batch = {};
      for (const k of Object.keys(A.progress)) batch[k] = null;
      A.progress = {};
      await window.cinema.setProgress(batch);
      markNew();
      renderAll();
      toast('Se borró todo el progreso');
      openSettings();
    });
    on('#about-data', () => window.cinema.openDataDir());
    on('#about-update', () => checkUpdates(true));
    on('#about-github', () => window.cinema.openUrl('https://github.com/G-726az/KuroPlayer'));
    on('#about-kofi', () => window.cinema.openUrl('https://ko-fi.com/gls726'));
    on('#bk-export', async () => {
      const r = await window.cinema.backupExport();
      if (r) toast(`Copia guardada: ${r.series} títulos y ${r.covers} portadas`, 4500);
    });
    on('#bk-import', async () => {
      let info;
      try { info = await window.cinema.backupPick(); } catch (e) { toast(esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 4500); return; }
      if (!info) return;
      const ok = await confirmBox({ title: 'Restaurar copia de seguridad', danger: true, ok: 'Restaurar',
        html: `<p>Copia del <b>${esc(new Date(info.date).toLocaleString('es'))}</b> (versión ${esc(info.version)}): ${info.groups} grupos, ${info.roots} carpetas, ${info.profiles} perfiles y ${info.series} títulos con datos.</p><p>Se <b>reemplaza</b> lo que tienes ahora en la app. Tus videos no se tocan.</p>` });
      if (!ok) return;
      if (Player.state.ep) Player.close();
      await window.cinema.backupRestore();
      location.reload();
    });
    on('#pl-detect', () => confirmDetectPlayers());
    on('#pl-add', async () => {
      const p = await window.cinema.playersPick();
      if (!p) return;
      const list = playersList().filter((x) => x.path.toLowerCase() !== p.path.toLowerCase());
      savePlayers([...list, { ...p, enabled: true, seek: false }]);
      toast(`«${p.name}» agregado`);
      openSettings('ext');
    });
    $$('[data-pl-toggle]').forEach((i) => i.onchange = () => {
      savePlayers(playersList().map((x) => (x.id === i.dataset.plToggle ? { ...x, enabled: i.checked } : x)));
    });
    $$('[data-pl-remove]').forEach((b) => b.onclick = () => {
      savePlayers(playersList().filter((x) => x.id !== b.dataset.plRemove));
      openSettings('ext');
    });
    on('#set-clear-thumbs', async () => {
      await window.cinema.clearThumbs();
      A.allSeries.forEach((x) => x.episodes.forEach((e) => { e.thumb = null; }));
      toast('Miniaturas borradas; se regenerarán al navegar');
      renderAll();
    });
    renderReview();
  }

  // ------------------------------------------------------------ miniaturas automáticas
  const Thumbs = (() => {
    const v = $('#thumb-video');
    const c = $('#thumb-canvas');
    const ctx = c.getContext('2d');
    const queue = [];
    const queued = new Set();
    let busy = false, lastThumb = 0;
    function request(s, ep, priority) {
      if (A.settings.thumbnails === false || ep.thumb || queued.has(ep.id)) return;
      queued.add(ep.id);
      const item = { s, ep };
      if (priority) queue.unshift(item); else queue.push(item);
      pump();
    }
    function pump() {
      if (!busy && !queue.length) Busy.clear('thumbs');
      else Busy.set('thumbs', `Generando miniaturas (${queue.length + (busy ? 1 : 0)} pendientes)`);
      if (busy || !queue.length) return;
      if (Player.state.ep && !Player.video.paused && Date.now() - lastThumb < 1500) { setTimeout(pump, 1500); return; }
      lastThumb = Date.now();
      // no competir con el reproductor mientras carga
      busy = true;
      const item = queue.shift();
      const { ep } = item;
      // primero FFmpeg (rápido y compatible con cualquier formato); si falla, se intenta con el <video>
      if (!item.viaVideo) {
        window.cinema.mediaThumb(ep.path, ep.id).then((url) => url, () => null).then((url) => {
          if (url) { ep.thumb = url; applyThumb(ep); }
          else queue.unshift({ ...item, viaVideo: true });
          busy = false;
          setTimeout(pump, 30);
        });
        return;
      }
      let done = false;
      const finish = async (ok) => {
        if (done) return; done = true;
        clearTimeout(timer);
        v.onloadedmetadata = v.onseeked = v.onerror = null;
        if (ok) {
          try {
            const vw = v.videoWidth, vh = v.videoHeight;
            const scale = Math.max(320 / vw, 180 / vh);
            const w = vw * scale, h = vh * scale;
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 180);
            ctx.drawImage(v, (320 - w) / 2, (180 - h) / 2, w, h);
            const url = await window.cinema.saveThumb(ep.id, c.toDataURL('image/jpeg', 0.82));
            if (url) { ep.thumb = url; applyThumb(ep); }
          } catch (e) { /* */ }
        }
        v.removeAttribute('src'); v.load();
        busy = false;
        setTimeout(pump, 60);
      };
      const timer = setTimeout(() => finish(false), 10000);
      v.onerror = () => finish(false);
      v.onloadedmetadata = () => {
        if (!v.videoWidth) return finish(false);
        const d = v.duration || 60;
        v.currentTime = Math.min(d * 0.28, d > 600 ? 420 : d * 0.28);
      };
      v.onseeked = () => finish(true);
      v.src = ep.url;
    }
    function applyThumb(ep) {
      $$(`[data-thumb="${ep.id}"]`).forEach((el) => { el.style.backgroundImage = cssUrl(ep.thumb); });
      // si la serie no tiene portada, las tarjetas usan la miniatura del primer capítulo
      const s = A.allSeries.find((x) => x.episodes[0] && x.episodes[0].id === ep.id);
      if (s && !s.cover) $$(`.poster[data-series="${s.id}"] .art`).forEach((art) => {
        const na = art.querySelector('.no-art');
        if (na) na.outerHTML = `<img src="${esc(ep.thumb)}" draggable="false" alt="">`;
      });
    }
    return { request };
  })();
  function queueMissingCoverThumbs() {
    for (const s of A.series) if (!s.cover && s.episodes[0] && !s.episodes[0].thumb) Thumbs.request(s, s.episodes[0]);
  }

  // ------------------------------------------------------------ eventos globales
  document.addEventListener('click', async (e) => {
    const rg = e.target.closest('[data-rail-group]');
    if (rg) { setGroup(rg.dataset.railGroup); return; }
    if (e.target.closest('[data-rail-new]')) { openGroupEditor(null); return; }
    const fvs = e.target.closest('[data-fav-s]');
    if (fvs) { e.stopPropagation(); const s = A.byId.get(fvs.dataset.favS); if (s) toggleFavSeries(s); return; }
    const fve = e.target.closest('[data-fav-e]');
    if (fve) {
      e.stopPropagation();
      const s = A.byId.get(fve.dataset.sid);
      const ep = s && s.episodes.find((x) => x.id === fve.dataset.favE);
      if (ep) toggleFavEp(s, ep);
      return;
    }
    if (e.target.closest('[data-fav-only]')) { A.favOnly = !A.favOnly; renderLibrary(); return; }
    if (e.target.closest('[data-fav-library]')) { A.favOnly = true; A.letter = 'all'; go('library'); return; }
    if (e.target.closest('[data-sfav]')) { A.serFav = !A.serFav; renderSeries(); return; }
    if (e.target.closest('[data-pg-toggle]')) {
      const groups = (Player.state.series && Player.state.series.groups) || [];
      const open = A.settings.panelGroupsOpen != null ? A.settings.panelGroupsOpen : groups.length <= 6;
      saveSettings({ panelGroupsOpen: !open }); renderPanel(false); return;
    }
    const sdur = e.target.closest('[data-sdur]');
    if (sdur) { A.serDur = sdur.dataset.sdur || null; renderSeries(); return; }
    const dur = e.target.closest('[data-dur]');
    if (dur) { A.durFilter = dur.dataset.dur || null; renderLibrary(); return; }
    const eye = e.target.closest('[data-eye]');
    if (eye) {
      e.stopPropagation();
      const s = A.byId.get(eye.dataset.sid);
      const ep = s && s.episodes.find((x) => x.id === eye.dataset.eye);
      if (ep) { const w = !!(A.progress[ep.path] || {}).w; markEpisode(s, ep, !w); toast(w ? `${epLabel(ep)} marcado como no visto` : `${epLabel(ep)} marcado como visto`); }
      return;
    }
    const hc = e.target.closest('[data-hide-continue]');
    if (hc) {
      e.stopPropagation();
      saveSettings({ [pk('continueHidden')]: { ...(A.settings[pk('continueHidden')] || {}), [hc.dataset.hideContinue]: Date.now() } });
      renderHome();
      toast('Quitado de «Continuar viendo» (vuelve si sigues viéndolo)');
      return;
    }
    if (e.target.closest('#btn-random')) { playRandomSeries(); return; }
    if (e.target.closest('#btn-reco-shuffle')) { recoShift++; renderHome(); return; }
    const rm = e.target.closest('[data-read-more]');
    if (rm) { e.stopPropagation(); const syn = rm.previousElementSibling; syn.classList.toggle('open'); rm.textContent = syn.classList.contains('open') ? 'Leer menos' : 'Leer más'; return; }
    const wc = e.target.closest('[data-web-confirm]');
    if (wc) { e.stopPropagation(); const s = A.byId.get(wc.dataset.webConfirm); if (s) webConfirm(s); return; }
    const kn = e.target.closest('[data-keep-name]');
    if (kn) { e.stopPropagation(); keepName(kn.dataset.keepName, true); return; }
    const uk = e.target.closest('[data-unkeep]');
    if (uk) { e.stopPropagation(); keepName(uk.dataset.unkeep, false); return; }
    const sp = e.target.closest('[data-split]');
    if (sp) { e.stopPropagation(); setSplit(sp.dataset.split, true); return; }
    const us = e.target.closest('[data-unsplit]');
    if (us) { e.stopPropagation(); setSplit(us.dataset.unsplit, false); return; }
    const rn = e.target.closest('[data-rename]');
    if (rn) { e.stopPropagation(); const s = A.byId.get(rn.dataset.rename); if (s) openRename(s); return; }
    const wrj = e.target.closest('[data-web-reject]');
    if (wrj) {
      e.stopPropagation();
      const s = A.byId.get(wrj.dataset.webReject);
      if (s) { await window.cinema.setMeta(s.id, { webStatus: 'none', webCandidate: null }); s.webStatus = 'none'; s.webCandidate = null; renderAll(); if (!$('#modal').hidden && $('.set-nav')) openSettings(); }
      return;
    }
    const wpk = e.target.closest('[data-web-pick]');
    if (wpk) { e.stopPropagation(); const s = A.byId.get(wpk.dataset.webPick); if (s) webPick(s); return; }
    const ow = e.target.closest('[data-open-web]');
    if (ow) { e.stopPropagation(); window.cinema.openWeb(ow.dataset.openWeb); return; }
    const lv = e.target.closest('[data-lview]');
    if (lv) { saveSettings({ libraryView: lv.dataset.lview }); renderLibrary(); return; }
    const gtag = e.target.closest('[data-genre]');
    if (gtag) { e.stopPropagation(); const g = gtag.dataset.genre; A.genre = A.genre === g && A.view === 'library' ? null : g; A.letter = 'all'; if (A.view !== 'library') go('library'); else renderLibrary(); return; }
    if (e.target.closest('[data-genre-clear]')) { A.genre = null; renderLibrary(); return; }
    if (e.target.closest('[data-genre-expand]')) { A.genreExpand = !A.genreExpand; renderLibrary(); return; }
    if (e.target.closest('#btn-select')) { setSelecting(!A.selecting); return; }
    if (e.target.closest('[data-sel-cancel]')) { setSelecting(false); return; }
    if (e.target.closest('[data-sel-all]')) { (A.visibleIds || []).forEach((id) => A.selected.add(id)); renderLibrary(); return; }
    if (e.target.closest('[data-cat-add]')) { openCategoryModal([...A.selected].map((id) => A.byId.get(id)).filter(Boolean), 'add'); return; }
    if (e.target.closest('[data-cat-remove]')) { openCategoryModal([...A.selected].map((id) => A.byId.get(id)).filter(Boolean), 'remove'); return; }
    if (e.target.closest('[data-hide-reco]')) { saveSettings({ dailyReco: false }); renderHome(); toast('Recomendación oculta · reactívala en Ajustes → Apariencia'); return; }
    if (A.selecting) {
      const card = e.target.closest('#poster-grid [data-series]');
      if (card) {
        const id = card.dataset.series;
        if (A.selected.has(id)) A.selected.delete(id); else A.selected.add(id);
        card.classList.toggle('selected', A.selected.has(id));
        renderSelBar();
        return;
      }
    }
    const lcard = e.target.closest('.lcard[data-series]');
    if (lcard) {
      const s = A.byId.get(lcard.dataset.series);
      if (e.target.closest('.play-o')) playSeries(s); else { A.groupFilter = null; go('series', { id: s.id }); }
      return;
    }
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) { go(goBtn.dataset.go); return; }
    const ps = e.target.closest('[data-play-series]');
    if (ps) { const s = A.byId.get(ps.dataset.playSeries); if (s) playSeries(s); return; }
    const os = e.target.closest('[data-open-series]');
    if (os) { go('series', { id: os.dataset.openSeries }); return; }
    const pe = e.target.closest('[data-play-ep]');
    if (pe) {
      const s = A.byId.get(pe.dataset.sid);
      const ep = s && s.episodes.find((x) => x.id === pe.dataset.playEp);
      if (ep) {
        if (Player.state.ep && Player.state.ep.id === ep.id) { go('player'); return; }
        const pl = pe.dataset.pl === 'fav' ? favPlaylist() : pe.dataset.pl === 'cur' ? Player.state.playlist : null;
        playEpisode(s, ep, pl ? { playlist: pl } : undefined);
      }
      return;
    }
    const poster = e.target.closest('.poster[data-series]');
    if (poster) {
      const s = A.byId.get(poster.dataset.series);
      if (e.target.closest('.play-o')) playSeries(s); else { A.groupFilter = null; go('series', { id: s.id }); }
      return;
    }
    const letter = e.target.closest('[data-letter]');
    if (letter) { A.letter = letter.dataset.letter; renderLibrary(); return; }
    const sortB = e.target.closest('[data-sort]');
    if (sortB) { saveSettings({ sort: sortB.dataset.sort }); renderLibrary(); return; }
    const sizeB = e.target.closest('[data-size]');
    if (sizeB) { saveSettings({ cardSize: sizeB.dataset.size }); renderLibrary(); return; }
    const grp = e.target.closest('[data-group]');
    if (grp) { A.groupFilter = grp.dataset.group === '__all__' ? null : grp.dataset.group; renderSeries(); return; }
    const pg = e.target.closest('[data-pgroup]');
    if (pg) { A.panelGroup = pg.dataset.pgroup === '__all__' ? null : pg.dataset.pgroup; renderPanel(false); return; }
  });

  document.addEventListener('contextmenu', (e) => {
    const rgm = e.target.closest('[data-rail-group]');
    if (rgm) { e.preventDefault(); groupMenu(A.groups.find((g) => g.id === rgm.dataset.railGroup), e.clientX, e.clientY); return; }
    const poster = e.target.closest('.poster[data-series], .lcard[data-series]');
    const epEl = e.target.closest('[data-play-ep]');
    if (poster) {
      e.preventDefault();
      const s = A.byId.get(poster.dataset.series);
      const st = seriesStats(s);
      ctxMenu(e.clientX, e.clientY, [
        { icon: 'i-play', label: st.lastTs ? 'Continuar' : 'Reproducir', action: () => playSeries(s) },
        { icon: 'i-list', label: 'Ver capítulos', action: () => go('series', { id: s.id }) },
        '-',
        { icon: 'i-image', label: 'Cambiar portada...', action: () => changeImage(s, 'cover') },
        { icon: 'i-image', label: 'Cambiar fondo...', action: () => changeImage(s, 'backdrop') },
        { icon: 'i-edit', label: 'Editar título / sinopsis', action: () => editSeries(s) },
        { icon: 'i-globe', label: s.web ? 'Cambiar datos de internet...' : 'Buscar en internet...', action: () => webPick(s) },
        { icon: s.fav ? 'i-heart-f' : 'i-heart', label: s.fav ? 'Quitar de favoritos' : 'Agregar a favoritos', action: () => toggleFavSeries(s) },
        { icon: 'i-star', label: 'Agregar a una categoría...', action: () => openCategoryModal([s], 'add') },
        ...(s.hasSubfolders && !s.splitFrom ? [{ icon: 'i-grid', label: 'Separar temporadas en series propias', action: () => setSplit(s.id, true) }] : []),
        ...(s.splitFrom ? [{ icon: 'i-list', label: `Unir temporadas de «${s.splitFrom.name}»`, action: () => setSplit(s.splitFrom.id, false) }] : []),
        ...(s.root !== s.dir ? [{ icon: 'i-folder', label: renameSuggestion(s) ? 'Renombrar carpeta al nombre oficial...' : 'Renombrar carpeta...', action: () => openRename(s) }] : []),
        '-',
        { icon: 'i-check', label: 'Marcar todo como visto', action: () => markSeries(s, true) },
        { icon: 'i-refresh', label: 'Borrar progreso', action: () => markSeries(s, false) },
        { icon: 'i-folder', label: 'Abrir carpeta', action: () => window.cinema.openDir(s.dir) },
      ]);
    } else if (epEl && !e.target.closest('#stage')) {
      e.preventDefault();
      const s = A.byId.get(epEl.dataset.sid);
      const ep = s && s.episodes.find((x) => x.id === epEl.dataset.playEp);
      if (!ep) return;
      const p = A.progress[ep.path];
      ctxMenu(e.clientX, e.clientY, [
        { icon: 'i-play', label: 'Reproducir', action: () => playEpisode(s, ep) },
        { icon: 'i-refresh', label: 'Reproducir desde el inicio', action: () => playEpisode(s, ep, { startAt: 0 }) },
        p && p.w ? { icon: 'i-refresh', label: 'Marcar como no visto', action: () => markEpisode(s, ep, false) }
          : { icon: 'i-check', label: 'Marcar como visto', action: () => markEpisode(s, ep, true) },
        { icon: ep.fav ? 'i-heart-f' : 'i-heart', label: ep.fav ? 'Quitar de favoritos' : 'Agregar a favoritos', action: () => toggleFavEp(s, ep) },
        '-',
        ...openWithItems(ep.path, p && !p.w ? p.t : 0),
        { icon: 'i-folder', label: 'Mostrar en el explorador', action: () => window.cinema.showInFolder(ep.path) },
      ]);
    }
  });

  $('#search').addEventListener('input', debounce(() => {
    if (A.view !== 'library') go('library', { scrollTop: false });
    renderLibrary();
  }, 150));
  $('#ep-filter').addEventListener('input', debounce(() => renderPanel(false), 120));
  $('#btn-add-folder').onclick = addFolders;
  $('#btn-add-folder').onclick = () => addFolders();
  $('#btn-add-folder-empty').onclick = () => addFolders();
  $('#btn-rescan').onclick = () => scan();
  $('#btn-settings').onclick = () => openSettings();
  $('#btn-profile').onclick = (ev) => profileMenu(ev);
  $('#ep-panel-close').onclick = () => toggleList(false);
  $('#pl-toggle-list').onclick = () => toggleList();
  $('#now-open-series').onclick = () => { if (Player.state.series) { A.groupFilter = null; go('series', { id: Player.state.series.id }); } };
  $('#now-folder').onclick = () => Player.state.ep && window.cinema.showInFolder(Player.state.ep.path);
  $('#now-potplayer').onclick = (ev) => {
    const { ep: cur } = Player.state; if (!cur) return;
    const items = openWithItems(cur.path, Player.currentTime());
    if (items.length === 1) { items[0].action(); return; }
    const r = ev.currentTarget.getBoundingClientRect();
    ctxMenu(r.left, r.bottom + 6, items);
    return;
    const { ep } = Player.state; if (!ep) return;
    Player.video.pause();
    window.cinema.openPotPlayer(ep.path, Player.currentTime());
  };

  function reportRoots(res) {
    const name = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;
    const msgs = [];
    if (res.already.length) msgs.push(`«${res.already.map(name).join('», «')}» ya estaba cargada${res.alreadyGroup ? ` en el grupo «${res.alreadyGroup}»` : ''}`);
    if (res.inside.length) msgs.push(`«${res.inside.map((x) => name(x.dir)).join('», «')}» ya está incluida dentro de «${name(res.inside[0].parent)}»${res.inside[0].group ? ` (grupo «${res.inside[0].group}»)` : ''}`);
    if (msgs.length) toast(msgs.join(' · ') + '; se buscaron solo las novedades', 5000);
  }
  async function addFolders(groupId) {
    const res = await window.cinema.pickRoots(groupId || A.group);
    if (res.canceled) return;
    A.roots = res.roots; A.groups = res.groups;
    reportRoots(res);
    await scan(false);
  }

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' && !['range', 'checkbox'].includes(e.target.type) || tag === 'textarea';
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (tag === 'input' && e.target.type === 'range' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.target.blur();
    if (Player.handleKey(e)) { e.preventDefault(); return; }
    if (e.key === 'Escape' && A.view === 'series') go('library');
    if (e.key === 'Backspace' && A.view === 'series') go('library');
  });

  // arrastrar y soltar carpetas / videos
  let dragDepth = 0;
  addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('#drop-overlay').hidden = false; } });
  addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-overlay').hidden = true; });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0; $('#drop-overlay').hidden = true;
    const files = [...e.dataTransfer.files];
    const paths = files.map((f) => window.cinema.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    const subFile = paths.find((p) => /\.(srt|ass|ssa|vtt)$/i.test(p));
    if (subFile && Player.state.ep && paths.length === 1) { toast('Para subtítulos externos usa el menú de subtítulos del reproductor'); return; }
    const addRes = await window.cinema.addRoots(paths, A.group);
    A.roots = addRes.roots; A.groups = addRes.groups;
    reportRoots(addRes);
    await scan(true);
    const vid = paths.find((p) => /\.(mp4|mkv|webm|m4v|mov|avi|wmv|ts|m2ts|ogv)$/i.test(p));
    if (vid) {
      for (const s of A.series) {
        const ep = s.episodes.find((x) => x.path.toLowerCase() === vid.toLowerCase());
        if (ep) { playEpisode(s, ep); return; }
      }
    }
    if (addRes.added.length) toast(`Carpeta agregada a «${esc(curGroup().name)}»`);
    if (!$('#modal').hidden && $('.set-nav')) { openSettings('library'); return; }
    go('library');
  });

  window.cinema.onFullscreen(() => {});
  window.cinema.onLibChanged(() => { if (A.settings.autoWatch !== false) scan(true); });

  addEventListener('blur', () => document.body.classList.add('win-inactive'));
  addEventListener('focus', () => document.body.classList.remove('win-inactive'));

  async function init() {
    const lib = await window.cinema.getLibrary();
    A.settings = lib.settings; A.progress = lib.progress || {}; A.roots = lib.roots || []; A.potplayer = lib.potplayer;
    A.groups = lib.groups || [];
    A.profiles = lib.profiles || []; A.profile = lib.activeProfile;
    if ((A.settings.lang || 'es') !== I18N.lang) { I18N.setLang(A.settings.lang || 'es'); return; }
    I18N.start();
    renderAvatar();
    applyTheme();
    A.group = A.groups.some((g) => g.id === A.settings.activeGroup) ? A.settings.activeGroup : (A.groups[0] && A.groups[0].id);
    renderRail(); updateGroupChrome();
    Player.init();
    if (A.settings.listOpen === false) toggleList(false); else toggleList(true);
    if (A.settings.theater) toggleTheater(true);
    renderHome();
    await scan(true);
    go('home');
    if (A.settings.updateCheck !== false) setTimeout(() => checkUpdates(false), 8000);
  }

  return {
    init, go, openSettings, getProgress, setProgress, saveSettings, onEpisodeChange, onPlayState, onClosed, toggleList, toggleTheater, coverFromFrame,
    get settings() { return A.settings; }, get gpuMode() { return gpuMode(); }, get gpuName() { return detectGpu().name; }, get potplayer() { return A.potplayer; }, openWithItems, enabledPlayers, get lastBrowseView() { return A.lastBrowseView === 'player' ? 'home' : A.lastBrowseView; },
  };
})();

App.init();
