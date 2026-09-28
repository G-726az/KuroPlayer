/* Aplicación: biblioteca, vistas (inicio, cartelera, serie, reproductor), miniaturas y ajustes. */
const App = (() => {
  const A = {
    series: [], byId: new Map(), progress: {}, settings: {}, roots: [], potplayer: '',
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
    for (const s of A.series) {
      s.customTitle = s.title !== s.folderName && s.title !== s.displayFolder;
      if (!s.customTitle && s.web && src !== 'folder') {
        s.title = src === 'english' ? (s.web.titleEn || s.web.title) : src === 'japanese' ? (s.web.titleJp || s.web.title) : (s.web.title || s.folderName);
      }
    }
  }
  function synopsisOf(s) {
    if (s.synopsis) return s.synopsis;
    if (!s.web) return '';
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
    for (const g of s.web ? (s.web.genresEs || s.web.genres || []) : []) if (!out.includes(g)) out.push(g);
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
    for (const s of A.series) {
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
    if (ns.length) parts.push(ns.length === 1 ? `serie nueva: «${ns[0].title}» (${ns[0].count} cap.)` : `${ns.length} series nuevas`);
    const epCount = ne.reduce((a, x) => a + x.count, 0);
    if (epCount) parts.push(ne.length === 1 ? `${epCount} capítulo${epCount > 1 ? 's' : ''} nuevo${epCount > 1 ? 's' : ''} en «${ne[0].title}»` : `${epCount} capítulos nuevos en ${ne.length} series`);
    if (rs.length) parts.push(`${rs.length} serie${rs.length > 1 ? 's' : ''} ya no está${rs.length > 1 ? 'n' : ''}`);
    if (!root && diff.removedEpisodes) parts.push(`${diff.removedEpisodes} capítulo${diff.removedEpisodes > 1 ? 's' : ''} quitado${diff.removedEpisodes > 1 ? 's' : ''}`);
    return { text: parts.join(' · '), changed: parts.length > 0 };
  }

  async function scan(silent, opts = {}) {
    if (A.scanning) { A.rescanPending = true; return null; }
    A.scanning = true;
    $('#btn-rescan').classList.add('spin');
    try {
      const { series: list, diff } = await window.cinema.scan();
      A.lastDiff = diff;
      A.series = list;
      A.byId = new Map(list.map((s) => [s.id, s]));
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
      else if (!silent) toast(opts.root ? 'Sin cambios en esa carpeta' : `Sin cambios · ${list.length} series · ${list.reduce((a, s) => a + s.episodes.length, 0)} capítulos`);
      return diff;
    } catch (e) {
      console.error(e); toast('Error al escanear la biblioteca');
    } finally {
      A.scanning = false;
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
        <span class="count">${st.total} EP</span>${seen}
        ${s.web && s.web.score ? `<span class="score"><svg class="i"><use href="#i-star"/></svg>${s.web.score}</span>` : ''}
        <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
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
          <div class="hero-meta"><span>${st.total} capítulos</span>${st.watched ? `<span>${st.watched} vistos</span>` : ''}${s.groups.filter(Boolean).length ? `<span>${s.groups.filter(Boolean).length} temporadas</span>` : ''}<span>${fmtSize(s.size)}</span></div>
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
      if (sst.lastTs <= (A.settings.continueClearedAt || 0)) continue;
      if (sst.lastTs <= ((A.settings.continueHidden || {})[ser.id] || 0)) continue;
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
    renderGenreBar();
    grid.classList.toggle('selecting', A.selecting);
    $('#btn-select').classList.toggle('active', A.selecting);
    let list = A.series.filter((s) => (A.letter === 'all' || firstLetter(s.title) === A.letter));
    if (A.genre) list = list.filter((s) => genresOf(s).includes(A.genre));
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.folderName.toLowerCase().includes(q)
      || altTitles(s).some((t) => t.toLowerCase().includes(q)) || genresOf(s).some((g) => g.toLowerCase().includes(q))
      || s.episodes.some((e) => e.name.toLowerCase().includes(q)));
    const col = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    if (sort === 'az') list.sort((a, b) => col.compare(a.title, b.title));
    if (sort === 'recent') list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    if (sort === 'watched') list.sort((a, b) => seriesStats(b).lastTs - seriesStats(a).lastTs);
    if (sort === 'count') list.sort((a, b) => b.episodes.length - a.episodes.length);
    if (sort === 'score') list.sort((a, b) => ((b.web && b.web.score) || 0) - ((a.web && a.web.score) || 0));
    if (sort === 'year') list.sort((a, b) => ((b.web && b.web.year) || 0) - ((a.web && a.web.year) || 0));
    $('#lib-count').innerHTML = `${list.length} ${list.length === 1 ? 'serie' : 'series'}${q ? ` · búsqueda «${esc($('#search').value.trim())}»` : ''}${A.genre ? ` · género <b>«${esc(A.genre)}»</b> <button class="link-btn" data-genre-clear>quitar filtro</button>` : ''}`;
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
          <div class="hero-meta">${s.web && s.web.score ? `<span>★ ${s.web.score}</span>` : ''}${s.web && s.web.year ? `<span>${s.web.year}</span>` : ''}${s.web && s.web.studios && s.web.studios.length ? `<span>${esc(s.web.studios.join(', '))}</span>` : ''}<span>${st.total}${s.web && s.web.episodes ? '/' + s.web.episodes : ''} capítulos</span><span>${st.watched} vistos</span>${s.groups.filter(Boolean).length ? `<span>${s.groups.filter(Boolean).length} temporadas / carpetas</span>` : ''}<span>${fmtSize(s.size)}</span></div>
          ${genresOf(s).length ? `<div class="series-tags">${genresOf(s).map((g) => tagHtml(s, g)).join('')}</div>` : ''}
          ${!s.web && s.webStatus === 'doubt' && s.webCandidate ? `<div class="doubt-bar">¿Es <b>${esc(s.webCandidate.title)}</b>${s.webCandidate.year ? ' (' + s.webCandidate.year + ')' : ''}? <button class="btn primary" data-web-confirm="${s.id}">Sí, usar</button><button class="btn glass" data-web-pick="${s.id}">Elegir otro</button><button class="btn glass" data-web-reject="${s.id}">No es</button></div>` : ''}
          ${renameBar(s)}
          <p class="synopsis ${synopsisOf(s) ? '' : 'empty'}" id="series-synopsis" title="Clic para expandir">${synopsisOf(s) ? esc(synopsisOf(s)) : 'Sin sinopsis · clic en «Editar» para escribir una o buscarla en internet'}</p>
          <div class="series-actions">
            <button class="btn primary big" data-play-series="${s.id}"><svg class="i"><use href="#i-play"/></svg>${st.lastTs && !tgt.fresh ? 'Continuar ' + esc(epLabel(tgt.ep)) : 'Reproducir'}</button>
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
    const eps = s.episodes.filter((e) => A.groupFilter == null || e.group === A.groupFilter);
    $('#series-episodes').innerHTML = eps.map((e, i) => {
      const p = A.progress[e.path];
      return `<div class="ep-card ${p && p.w ? 'watched' : ''}" data-play-ep="${e.id}" data-sid="${s.id}" style="animation-delay:${Math.min(i, 20) * 25}ms">
        <div class="thumb" data-thumb="${e.id}" ${epThumbStyle(e, s)}>
          <span class="ep-badge">${e.num != null ? 'EP ' + e.num : 'EP ' + (i + 1)}</span>${e.isNew ? '<span class="ep-new">NUEVO</span>' : ''}
          ${p && p.w ? '<span class="watched-mark"><svg class="i"><use href="#i-check"/></svg></span>' : ''}
          ${p && p.d ? `<span class="dur-badge">${fmtTime(p.d)}</span>` : ''}
          <div class="play-o"><span><svg class="i"><use href="#i-play"/></svg></span></div>
          ${eyeBtn(e, s)}
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
    const { series: s, ep: cur } = Player.state;
    if (!s) return;
    $('#ep-panel-title').textContent = s.title;
    const st = seriesStats(s);
    const idx = s.episodes.findIndex((e) => e.id === (cur && cur.id));
    $('#ep-panel-sub').textContent = `Capítulo ${idx + 1} de ${s.episodes.length} · ${st.watched} vistos`;
    const groups = s.groups;
    if (A.panelGroup && !groups.includes(A.panelGroup)) A.panelGroup = null;
    $('#ep-panel-groups').innerHTML = groups.length > 1
      ? `<button class="chip ${A.panelGroup == null ? 'active' : ''}" data-pgroup="__all__">Todos</button>` + groups.map((g) => `<button class="chip ${A.panelGroup === g ? 'active' : ''}" data-pgroup="${esc(g)}">${esc(g || 'Principal')}</button>`).join('')
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
      html += `<div class="ep-item ${isCur ? 'current' : ''}" data-play-ep="${e.id}" data-sid="${s.id}">
        <div class="thumb" data-thumb="${e.id}" ${epThumbStyle(e, s)}>
          <span class="ep-no">${e.num != null ? 'EP ' + e.num : i + 1}</span>${e.isNew ? '<span class="ep-new">NUEVO</span>' : ''}
          <div class="eq"><div class="eq-bars"><i></i><i></i><i></i><i></i></div></div>
          ${eyeBtn(e, s)}
          ${progressBar(e)}
        </div>
        <div class="info">
          <div class="t">${esc(epLabel(e))}</div>
          <div class="s">${e.num != null ? `<span>${esc(e.title)}</span>` : ''}</div>
          <div class="s">${p && p.w ? '<span class="ok"><svg class="i"><use href="#i-check"/></svg>Visto</span>' : p && p.d ? `<span>${fmtTime(p.t)} / ${fmtTime(p.d)}</span>` : `<span>${fmtSize(e.size)}</span>`}</div>
        </div>
      </div>`;
      if (!e.thumb) Thumbs.request(s, e);
    });
    $('#ep-list').innerHTML = html || '<div class="muted" style="padding:20px;text-align:center">Sin resultados</div>';
    if (scrollToCurrent) {
      requestAnimationFrame(() => {
        const c = $('#ep-list .current');
        if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
    chips.push(`<span class="mini-chip ok">✓ ${st.watched} vistos</span>`);
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
    if (Player.state.series) renderNowExtra(A.byId.get(Player.state.series.id) || Player.state.series);
    if (A.view !== 'home') renderHome();
  }

  function playEpisode(s, ep, opts) {
    Player.load(s, ep, opts || {});
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
    openModal(`
      <h2>Buscar «${esc(s.searchName || s.folderName)}» en internet</h2>
      <p class="sub">Elige el anime correcto. Se guardan título oficial, descripción, géneros, estudio, año, puntuación y portada (fuente: AniList / MyAnimeList).</p>
      <div class="search-row field" style="margin:0"><input type="text" id="wp-q" value="${esc(s.searchName || s.folderName)}" spellcheck="false"><button class="btn primary" id="wp-go"><svg class="i"><use href="#i-search"/></svg>Buscar</button></div>
      <label class="switch" style="margin-top:12px"><input type="checkbox" id="wp-cover" ${s.hasFolderCover || (s.hasCustomCover && !s.coverFromWeb) ? '' : 'checked'}><span></span>Usar también la portada de internet${s.hasFolderCover ? ' (reemplaza la de la carpeta solo en la app)' : ''}</label>
      <div class="web-results" id="wp-res"><div class="muted small">Buscando...</div></div>
      <div class="modal-actions"><button class="btn glass" data-close>Cerrar</button></div>`);
    const run = async () => {
      const q = $('#wp-q').value.trim();
      if (!q) return;
      $('#wp-res').innerHTML = '<div class="muted small">Buscando...</div>';
      try {
        const res = await window.cinema.webSearch(q);
        if (!$('#wp-res')) return;
        $('#wp-res').innerHTML = res.length ? res.map((c, i) => `<div class="web-res">
          <img src="${esc(c.image)}" alt="" loading="lazy">
          <div class="wr-body">
            <div class="wr-t">${esc(c.title)} <span class="conf ${confClass(c.confidence)}">${Math.round(c.confidence * 100)}%</span></div>
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
    for (const s of A.series) {
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
    for (const s of A.series) {
      eps += s.episodes.length; size += s.size; if (s.web) withWeb++;
      for (const e of s.episodes) {
        const p = A.progress[e.path];
        if (!p) continue;
        secs += p.w ? (p.d || p.t || 0) : (p.t || 0);
        if (p.w) watched++;
      }
    }
    return { series: A.series.length, eps, size, hours: secs / 3600, watched, withWeb };
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
          <div class="about-ver"><span class="ver-pill">v${esc(info.version || '1.7.1')}</span><span class="ver-name">«${esc(CHANGELOG[0].name)}»</span><span class="muted small">${esc(CHANGELOG[0].date)}</span></div>
          <p>Videoteca local para tu anime: cartelera con portadas, reproductor moderno con efectos de cristal, color por GPU y compatibilidad universal de formatos.</p>
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
        </div>
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
        <p><b>AniList</b>, <b>Kitsu</b> y <b>MyAnimeList (Jikan)</b> — información de series · <b>Google Translate</b> — traducción de descripciones</p>
        <p class="muted small">Hecho para uso personal. Todos tus datos se guardan solo en este equipo.</p>
      </div>`;
  }

  function settingsBody(tab) {
    if (tab === 'about') return aboutBody();
    if (tab === 'library') {
      const byRoot = new Map();
      for (const s of A.series) {
        const k = (s.root || '').toLowerCase();
        const v = byRoot.get(k) || { series: 0, eps: 0, size: 0 };
        v.series++; v.eps += s.episodes.length; v.size += s.size;
        byRoot.set(k, v);
      }
      const cards = A.rootsInfo.length ? A.rootsInfo.map((r) => {
        const st = byRoot.get(r.path.toLowerCase()) || { series: 0, eps: 0, size: 0 };
        const name = r.path.split(/[\\/]/).filter(Boolean).pop() || r.path;
        return `<div class="folder-card ${r.exists ? '' : 'missing'}">
          <div class="folder-ico"><svg class="i"><use href="#i-folder"/></svg></div>
          <div class="folder-info"><b>${esc(name)}</b><span title="${esc(r.path)}">${esc(r.path)}</span>
            <div class="chips">${r.exists ? `<span class="mini-chip accent">${st.series} series</span><span class="mini-chip cyan">${st.eps} capítulos</span><span class="mini-chip">${fmtSize(st.size) || '0 B'}</span>` : '<span class="mini-chip bad">La carpeta no existe o el disco no está conectado</span>'}</div>
          </div>
          ${r.exists ? `<button class="btn glass" data-root-refresh="${esc(r.path)}" title="Buscar series y capítulos nuevos en esta carpeta"><svg class="i"><use href="#i-refresh"/></svg>Actualizar</button>
          <button class="icon-btn" data-root-open="${esc(r.path)}" title="Abrir en el explorador"><svg class="i"><use href="#i-external"/></svg></button>` : ''}
          <button class="btn glass danger" data-rm-root="${esc(r.path)}"><svg class="i"><use href="#i-trash"/></svg>Quitar</button>
        </div>`;
      }).join('') : '<div class="folder-empty">No hay carpetas. Agrega la carpeta donde guardas tu anime.</div>';
      return `
        <div class="folder-drop" id="set-drop"><svg class="i"><use href="#i-plus"/></svg><b>Agregar carpeta</b><br>Haz clic aquí o arrastra carpetas a esta ventana</div>
        <div class="set-card">
          <h4><svg class="i"><use href="#i-folder"/></svg>Carpetas que lee la cartelera <small class="muted" style="font-weight:600">(${A.rootsInfo.length})</small></h4>
          <p>Los archivos nunca se modifican ni se borran; «Quitar» solo deja de mostrarlos en la app.</p>
          <div class="set-actions" style="margin:0 0 14px">
            <button class="btn glass" id="set-rescan"><svg class="i"><use href="#i-refresh"/></svg>Actualizar todas</button>
            ${A.rootsInfo.length ? `<button class="btn glass danger" id="set-clear-roots"><svg class="i"><use href="#i-trash"/></svg>Quitar todas las carpetas</button>` : ''}
          </div>
          <div class="folder-list">${cards}</div>
        </div>
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
        ${A.series.some((x) => x.keepName) ? `<div class="set-card">
          <h4><svg class="i"><use href="#i-check"/></svg>Carpetas con nombre conservado</h4>
          <p>No se sugiere renombrarlas aunque el título oficial sea distinto.</p>
          <div class="review-list">${A.series.filter((x) => x.keepName).map((x) => `<div class="review-item">${x.cover ? `<img src="${esc(x.cover)}" alt="">` : ''}
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
        <div class="set-card"><h4><svg class="i"><use href="#i-next"/></svg>Capítulos</h4>
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
      return `<div class="set-card"><h4><svg class="i"><use href="#i-home"/></svg>Secciones del Inicio</h4>
          <p>Activa o desactiva lo que se muestra en la pantalla de Inicio.</p>
          ${rowSwitch('dailyReco', 'Recomendación del día', '5 capítulos al azar (cambian cada día) y el botón «Elegir uno al azar».')}
          ${rowSwitch('homeContinue', 'Continuar viendo', 'Series que dejaste a medias.')}
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
        <div class="nav-ver">Kuro Player v${esc((A.appInfo && A.appInfo.version) || '1.7.1')}</div>
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
    const list = A.series.map((s) => ({ s, r: renameSuggestion(s) })).filter((x) => x.r);
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
    const list = A.series.filter((s) => !s.web && (s.webStatus === 'doubt' || s.webStatus === 'none'));
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
      if (['translateSynopsis', 'dailyReco', 'homeContinue', 'homeNew', 'homeRecent'].includes(i.dataset.setBool)) renderAll();
      if (i.dataset.setBool === 'suggestRename') { renderAll(); openSettings(); }
      if (i.dataset.setBool === 'splitSeasons') { window.cinema.setSettings(A.settings).then(() => scan(false)).then(() => openSettings()); }
    });
    $$('[data-set-num]').forEach((i) => i.onchange = () => {
      const v = clamp(+i.value || +i.min, +i.min, +i.max);
      i.value = v;
      saveSettings({ [i.dataset.setNum]: v });
    });
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('#set-drop', async () => { await addFolders(); openSettings(); });
    on('#set-rescan', async () => { await scan(); openSettings(); });
    on('#set-clear-roots', async () => {
      const n = A.rootsInfo.length;
      const ok = await confirmBox({ title: 'Quitar todas las carpetas', danger: true, ok: `Quitar ${n} carpeta${n === 1 ? '' : 's'}`,
        html: '<p>La cartelera quedará vacía. <b>Tus videos no se borran</b>, y el progreso y los datos de internet se conservan por si vuelves a agregar las carpetas.</p>' });
      if (!ok) return;
      if (Player.state.ep) Player.close();
      A.roots = await window.cinema.clearRoots();
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
      A.roots = await window.cinema.removeRoot(b.dataset.rmRoot);
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
      saveSettings({ continueClearedAt: Date.now(), continueHidden: {} });
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
      A.series.forEach((x) => x.episodes.forEach((e) => { e.thumb = null; }));
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
    let busy = false;
    function request(s, ep, priority) {
      if (A.settings.thumbnails === false || ep.thumb || queued.has(ep.id)) return;
      queued.add(ep.id);
      const item = { s, ep };
      if (priority) queue.unshift(item); else queue.push(item);
      pump();
    }
    function pump() {
      if (busy || !queue.length) return;
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
      const s = A.series.find((x) => x.episodes[0] && x.episodes[0].id === ep.id);
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
      saveSettings({ continueHidden: { ...(A.settings.continueHidden || {}), [hc.dataset.hideContinue]: Date.now() } });
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
        playEpisode(s, ep);
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
  $('#btn-add-folder-empty').onclick = addFolders;
  $('#btn-rescan').onclick = () => scan();
  $('#btn-settings').onclick = () => openSettings();
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
    if (res.already.length) msgs.push(`«${res.already.map(name).join('», «')}» ya estaba cargada`);
    if (res.inside.length) msgs.push(`«${res.inside.map((x) => name(x.dir)).join('», «')}» ya está incluida dentro de «${name(res.inside[0].parent)}»`);
    if (msgs.length) toast(msgs.join(' · ') + '; se buscaron solo las novedades', 5000);
  }
  async function addFolders() {
    const res = await window.cinema.pickRoots();
    if (res.canceled) return;
    A.roots = res.roots;
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
    const addRes = await window.cinema.addRoots(paths);
    A.roots = addRes.roots;
    reportRoots(addRes);
    await scan(true);
    const vid = paths.find((p) => /\.(mp4|mkv|webm|m4v|mov|avi|wmv|ts|m2ts|ogv)$/i.test(p));
    if (vid) {
      for (const s of A.series) {
        const ep = s.episodes.find((x) => x.path.toLowerCase() === vid.toLowerCase());
        if (ep) { playEpisode(s, ep); return; }
      }
    }
    if (addRes.added.length) toast('Carpeta agregada a la cartelera');
    if (!$('#modal').hidden && $('.set-nav')) { openSettings('library'); return; }
    go('library');
  });

  window.cinema.onFullscreen(() => {});
  window.cinema.onLibChanged(() => { if (A.settings.autoWatch !== false) scan(true); });

  async function init() {
    const lib = await window.cinema.getLibrary();
    A.settings = lib.settings; A.progress = lib.progress || {}; A.roots = lib.roots || []; A.potplayer = lib.potplayer;
    Player.init();
    if (A.settings.listOpen === false) toggleList(false); else toggleList(true);
    if (A.settings.theater) toggleTheater(true);
    renderHome();
    await scan(true);
    go('home');
  }

  return {
    init, go, getProgress, setProgress, saveSettings, onEpisodeChange, onPlayState, onClosed, toggleList, toggleTheater, coverFromFrame,
    get settings() { return A.settings; }, get potplayer() { return A.potplayer; }, openWithItems, enabledPlayers, get lastBrowseView() { return A.lastBrowseView === 'player' ? 'home' : A.lastBrowseView; },
  };
})();

App.init();
