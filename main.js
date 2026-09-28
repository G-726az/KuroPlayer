// Kuro Player — proceso principal: ventana, biblioteca local, streaming de video y persistencia.
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, screen, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { Readable } = require('stream');
const { spawn } = require('child_process');

// Pistas de audio múltiples (anime con audio dual) y decodificación HEVC por hardware.
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

protocol.registerSchemesAsPrivileged([{
  scheme: 'cinema',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.m4v', '.mov', '.avi', '.wmv', '.ts', '.m2ts', '.mts', '.ogv', '.ogm', '.3gp', '.flv', '.f4v',
  '.mpg', '.mpeg', '.m2v', '.vob', '.divx', '.xvid', '.rm', '.rmvb', '.asf', '.dv', '.mxf', '.y4m']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const COVER_NAMES = ['cover', 'poster', 'portada', 'caratula', 'carátula', 'folder', 'front', 'cartel'];
const BACKDROP_NAMES = ['backdrop', 'fanart', 'banner', 'fondo', 'background'];
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.ogv': 'video/ogg',
  '.3gp': 'video/3gpp', '.flv': 'video/x-flv',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
};

const RENDERER_DIR = path.join(__dirname, 'renderer');
let DATA_DIR, THUMB_DIR, COVER_DIR, STORE_FILE;
let store = null;
let saveTimer = null;
let win = null;
let lastScan = [];
let scanNew = null;
let lastDiff = null;        // capítulos vistos por primera vez en el escaneo actual
let watchers = [];
let watchTimer = null;
const extraAllowed = new Set(); // carpetas abiertas por arrastrar (sesión actual)

const DEFAULT_STORE = () => ({
  version: 1,
  roots: [],
  meta: {},        // seriesId -> { title, cover, backdrop, synopsis, color, addedAt }
  seen: {},        // ruta de capítulo -> fecha en que apareció por primera vez
  seenInit: false,
  progress: {},    // ruta de archivo -> { t, d, w, ts }
  settings: {
    seekStep: 5, seekStepLong: 30, volumeStep: 5, autoNext: true, autoNextDelay: 8,
    thumbnails: true, potplayer: '', volume: 0.9, muted: false, subSize: 1, subOffset: 0,
    listOpen: true, ambient: true, color: null, sort: 'az',
  },
});

function hash(s) { return crypto.createHash('sha1').update(String(s).toLowerCase()).digest('hex').slice(0, 16); }
function norm(p) { return path.resolve(p).toLowerCase(); }

async function loadStore() {
  try {
    const raw = JSON.parse(await fsp.readFile(STORE_FILE, 'utf8'));
    const def = DEFAULT_STORE();
    store = { ...def, ...raw, settings: { ...def.settings, ...(raw.settings || {}) } };
    if (!store.seen) store.seen = {};
  } catch (e) { store = DEFAULT_STORE(); }
}
function saveStoreSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStoreNow, 600);
}
function saveStoreNow() {
  clearTimeout(saveTimer);
  if (!store) return;
  const tmp = STORE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, STORE_FILE);
  } catch (e) { console.error('No se pudo guardar la biblioteca', e); }
}

function isAllowed(p) {
  const n = norm(p);
  if (n.startsWith(norm(DATA_DIR) + path.sep)) return true;
  for (const r of store.roots) { const rn = norm(r); if (n === rn || n.startsWith(rn + path.sep)) return true; }
  for (const r of extraAllowed) { if (n === r || n.startsWith(r + path.sep)) return true; }
  return false;
}

function mediaUrl(p, v) { return 'cinema://local/media?p=' + encodeURIComponent(p) + (v ? '&v=' + v : ''); }

// ---------------------------------------------------------------- protocolo cinema://
async function serveFile(filePath, request) {
  let stat;
  try { stat = await fsp.stat(filePath); } catch (e) { return new Response('No encontrado', { status: 404 }); }
  if (!stat.isFile()) return new Response('No encontrado', { status: 404 });
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const size = stat.size;
  const range = request.headers.get('range');
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  return new Response(Readable.toWeb(stream), { status: 200, headers: { ...base, 'Content-Length': String(size) } });
}

function registerProtocol() {
  protocol.handle('cinema', async (request) => {
    const u = new URL(request.url);
    if (u.pathname === '/media') {
      const p = u.searchParams.get('p') || '';
      if (!p || !isAllowed(p)) return new Response('Prohibido', { status: 403 });
      return serveFile(p, request);
    }
    if (u.pathname === '/stream') return MediaEngine.serve(u.searchParams.get('k') || '');
    if (u.pathname.startsWith('/thumb/')) {
      const name = path.basename(u.pathname);
      if (!/^[a-f0-9]{16}\.jpg$/.test(name)) return new Response('No encontrado', { status: 404 });
      return serveFile(path.join(THUMB_DIR, name), request);
    }
    if (u.pathname.startsWith('/app/')) {
      const rel = decodeURIComponent(u.pathname.slice(5)) || 'index.html';
      const full = path.normalize(path.join(RENDERER_DIR, rel));
      if (!full.startsWith(RENDERER_DIR)) return new Response('Prohibido', { status: 403 });
      return serveFile(full, request);
    }
    return new Response('No encontrado', { status: 404 });
  });
}

// ---------------------------------------------------------------- escaneo de biblioteca
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function parseEpisodeNumber(name) {
  const base = name.replace(/\.[^.]+$/, '');
  let clean = base.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // quita [Grupo] (1080p)
    .replace(/\b(1080|720|480|2160|360)p?\b/gi, ' ').replace(/\b(x|h)\.?26[45]\b/gi, ' ').replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d\.\d\b/g, ' ')          // 5.1 / 2.0 (canales de audio)
    .replace(/@\S+/g, ' ')                // @usuario de quien lo subió
    .replace(/[._]+/g, ' ');              // Serie_01.Grupo → Serie 01 Grupo
  let m = /(?:\b|_)(?:ep|episodio|episode|cap|capitulo|capítulo|e)[\s._-]*(\d{1,4})\b/i.exec(clean)
    || /\bS\d{1,2}E(\d{1,4})/i.exec(clean)
    || /(?<![A-Za-z\d])\d{1,2}x(\d{1,4})(?!\d)/i.exec(clean)       // 1x01 = temporada 1, capítulo 1
    || /[\s-]-[\s-]*(\d{1,4})(?![\dA-Za-z])/.exec(clean)
    || /[A-Za-z]{3,}(\d{2,3})(?=\s|$)/.exec(clean);                // Hielo03 (número pegado al final de una palabra)
  if (m) return parseInt(m[1], 10);
  // números sueltos (se ignoran los pegados a letras: AC3, Hi10P, x264...)
  const all = clean.match(/(?<![A-Za-z\d])\d{1,4}(?![A-Za-z\d])/g);
  return all ? parseInt(all[all.length - 1], 10) : null;
}

async function readDirSafe(dir) {
  try { return await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return []; }
}

async function collectVideos(dir, rel, out, subsIndex, depth) {
  const entries = await readDirSafe(dir);
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (depth < 4 && !ent.name.startsWith('.')) await collectVideos(full, rel ? rel + ' / ' + ent.name : ent.name, out, subsIndex, depth + 1);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (VIDEO_EXT.has(ext)) out.push({ full, name: ent.name, group: rel });
    else if (SUB_EXT.has(ext)) {
      const list = subsIndex.get(dir) || [];
      list.push(full);
      subsIndex.set(dir, list);
    }
  }
}

async function findImage(dir, names) {
  const entries = await readDirSafe(dir);
  const imgs = entries.filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()));
  for (const n of names) {
    const hit = imgs.find((e) => path.basename(e.name, path.extname(e.name)).toLowerCase() === n);
    if (hit) return path.join(dir, hit.name);
  }
  return null;
}
async function anyImage(dir) {
  const entries = await readDirSafe(dir);
  const img = entries.find((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())
    && !BACKDROP_NAMES.includes(path.basename(e.name, path.extname(e.name)).toLowerCase()));
  return img ? path.join(dir, img.name) : null;
}

async function buildSeries(dir, title, videos, root, inherit) {
  const id = hash(dir);
  const subsIndex = new Map();
  if (!videos) { videos = []; await collectVideos(dir, '', videos, subsIndex, 0); }
  if (!videos.length) return null;
  const episodes = [];
  for (const v of videos) {
    let st = null;
    try { st = await fsp.stat(v.full); } catch (e) { continue; }
    const epId = hash(v.full);
    if (store.seen[v.full] == null) {
      store.seen[v.full] = store.seenInit ? Date.now() : 0;
      if (store.seenInit && scanNew) scanNew.push({ seriesDir: dir, path: v.full });
    }
    const thumbFile = path.join(THUMB_DIR, epId + '.jpg');
    const hasThumb = fs.existsSync(thumbFile);
    const vdir = path.dirname(v.full);
    const baseNoExt = path.basename(v.name, path.extname(v.name)).toLowerCase();
    const subs = (subsIndex.get(vdir) || []).filter((s) => path.basename(s).toLowerCase().startsWith(baseNoExt))
      .map((s) => ({ path: s, label: path.basename(s).slice(baseNoExt.length).replace(/^[._\s-]+/, '') || path.extname(s).slice(1).toUpperCase() }));
    episodes.push({
      id: epId, path: v.full, url: mediaUrl(v.full), name: v.name, title: v.name.replace(/\.[^.]+$/, ''),
      group: v.group, size: st.size, mtime: st.mtimeMs, num: parseEpisodeNumber(v.name),
      thumb: hasThumb ? `cinema://local/thumb/${epId}.jpg?v=${Math.round(fs.statSync(thumbFile).mtimeMs)}` : null,
      subs, ext: path.extname(v.name).slice(1).toLowerCase(), addedAt: store.seen[v.full] || 0,
    });
  }
  episodes.sort((a, b) => collator.compare(a.group, b.group) || collator.compare(a.name, b.name));
  const meta = store.meta[id] || {};
  const autoCover = await findImage(dir, COVER_NAMES) || await anyImage(dir);
  const autoBackdrop = await findImage(dir, BACKDROP_NAMES);
  const coverPath = meta.cover && fs.existsSync(meta.cover) ? meta.cover : autoCover;
  const backdropPath = meta.backdrop && fs.existsSync(meta.backdrop) ? meta.backdrop : autoBackdrop;
  let st = null; try { st = await fsp.stat(dir); } catch (e) { /* */ }
  const isNewSeries = !store.meta[id] && !inherit;
  if (!store.meta[id]) { store.meta[id] = { addedAt: inherit ? inherit.addedAt : store.seenInit ? Date.now() : 1 }; saveStoreSoon(); }
  return {
    id, dir, root: root || dir, folderName: title, title: meta.title || title, synopsis: meta.synopsis || '',
    web: meta.web || null, webStatus: meta.webStatus || null, webCandidate: meta.webCandidate || null,
    webLocked: !!meta.webLocked, hasFolderCover: !!autoCover, isNewSeries: isNewSeries && store.seenInit,
    keepName: !!meta.keepName, customGenres: Array.isArray(meta.customGenres) ? meta.customGenres : [], splitFrom: inherit ? { id: inherit.id, name: inherit.name } : null,
    hasSubfolders: false, split: false, coverFromWeb: !!(meta.coverFromWeb && meta.cover && fs.existsSync(meta.cover)),
    cover: coverPath ? mediaUrl(coverPath, Math.round(safeMtime(coverPath))) : null,
    backdrop: backdropPath ? mediaUrl(backdropPath, Math.round(safeMtime(backdropPath))) : null,
    hasCustomCover: !!(meta.cover && fs.existsSync(meta.cover)),
    color: meta.color || null,
    addedAt: store.meta[id].addedAt || (st ? st.birthtimeMs : 0),
    episodes,
    groups: [...new Set(episodes.map((e) => e.group))],
    size: episodes.reduce((a, e) => a + e.size, 0),
  };
}
function safeMtime(p) { try { return fs.statSync(p).mtimeMs; } catch (e) { return 0; } }

// cada subcarpeta con videos pasa a ser una serie propia; los videos sueltos de la carpeta madre quedan en otra
async function splitSeries(dir, name, root, pid, pm) {
  const entries = await readDirSafe(dir);
  const inherit = { id: pid, name, addedAt: pm.addedAt || Date.now() };
  const out = [];
  const loose = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && !ent.name.startsWith('.')) {
      const s = await buildSeries(full, ent.name, null, root, inherit);
      if (s) {
        // subcarpetas genéricas ("Temporada 1", "Season 2", "S2", "Parte 1") llevan el nombre de la serie madre
        if (/^(temporada|season|parte|part|cour|s|t)\s*[-_.]?\s*\d{1,2}$/i.test(ent.name.trim())) {
          s.searchName = `${name} ${ent.name.replace(/^(temporada|t)\s*[-_.]?\s*/i, 'Season ')}`;
          if (!(store.meta[s.id] && store.meta[s.id].title)) { s.title = `${name} - ${ent.name}`; s.displayFolder = s.title; }
        }
        out.push(s);
      }
    } else if (ent.isFile() && VIDEO_EXT.has(path.extname(ent.name).toLowerCase())) {
      loose.push({ full, name: ent.name, group: '' });
    }
  }
  if (!out.length) return [];
  if (loose.length) {
    const s = await buildSeries(dir, name, loose, root, inherit);
    if (s) out.push(s);
  }
  out.forEach((s) => { s.split = true; });
  return out;
}

async function scanLibrary() {
  scanNew = [];
  const result = [];
  const seen = new Set();
  const roots = [...store.roots, ...[...extraAllowed].filter((r) => !store.roots.some((x) => norm(x) === r))];
  for (const root of roots) {
    const entries = await readDirSafe(root);
    const loose = [];
    for (const ent of entries) {
      const full = path.join(root, ent.name);
      if (ent.isDirectory() && !ent.name.startsWith('.') && !ent.name.startsWith('$')) {
        if (seen.has(norm(full))) continue;
        seen.add(norm(full));
        const pid = hash(full);
        const pm = store.meta[pid] || {};
        const split = pm.split != null ? !!pm.split : !!store.settings.splitSeasons;
        if (split) {
          const kids = await splitSeries(full, ent.name, root, pid, pm);
          if (kids.length) { result.push(...kids); continue; }
        }
        const s = await buildSeries(full, ent.name, null, root);
        if (s) { s.hasSubfolders = s.groups.filter(Boolean).length > 0 && s.groups.length > 1; result.push(s); }
      } else if (ent.isFile() && VIDEO_EXT.has(path.extname(ent.name).toLowerCase())) {
        loose.push({ full, name: ent.name, group: '' });
      }
    }
    if (loose.length && !seen.has(norm(root))) {
      seen.add(norm(root));
      const s = await buildSeries(root, path.basename(root) || root, loose, root);
      if (s) result.push(s);
    }
  }
  result.sort((a, b) => collator.compare(a.title, b.title));
  // resumen de cambios respecto al escaneo anterior
  const prev = lastScan;
  const diff = { newSeries: [], newEpisodes: [], removedSeries: [], removedEpisodes: 0 };
  const bySeries = new Map();
  for (const n of scanNew || []) bySeries.set(n.seriesDir, (bySeries.get(n.seriesDir) || 0) + 1);
  for (const x of result) {
    const count = bySeries.get(x.dir) || 0;
    if (x.isNewSeries) diff.newSeries.push({ id: x.id, title: x.title, root: x.root, count: x.episodes.length });
    else if (count) diff.newEpisodes.push({ id: x.id, title: x.title, root: x.root, count });
  }
  if (prev.length) {
    const ids = new Set(result.map((x) => x.id));
    for (const p of prev) if (!ids.has(p.id)) diff.removedSeries.push({ title: p.title, root: p.root });
    const now = new Set(result.flatMap((x) => x.episodes.map((e) => e.id)));
    for (const p of prev) if (ids.has(p.id)) diff.removedEpisodes += p.episodes.filter((e) => !now.has(e.id)).length;
  }
  if (!store.seenInit) store.seenInit = true;
  scanNew = null;
  saveStoreSoon();
  lastScan = result;
  lastDiff = diff;
  return result;
}

// ---------------------------------------------------------------- datos desde internet (MyAnimeList vía Jikan)
const GENRES_ES = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama', Fantasy: 'Fantasía', Horror: 'Terror',
  Mystery: 'Misterio', Romance: 'Romance', 'Sci-Fi': 'Ciencia ficción', 'Slice of Life': 'Recuentos de la vida', Sports: 'Deportes',
  Supernatural: 'Sobrenatural', Suspense: 'Suspenso', Ecchi: 'Ecchi', Hentai: 'Hentai', Erotica: 'Erótico', 'Boys Love': 'Boys Love',
  'Girls Love': 'Girls Love', Gourmet: 'Gastronomía', 'Award Winning': 'Premiado', 'Avant Garde': 'Vanguardista',
  School: 'Escolar', Music: 'Música', Mecha: 'Mecha', Military: 'Militar', Historical: 'Histórico', Isekai: 'Isekai',
  Harem: 'Harem', 'Reverse Harem': 'Harem inverso', Psychological: 'Psicológico', 'Martial Arts': 'Artes marciales',
  Space: 'Espacio', Vampire: 'Vampiros', 'Super Power': 'Superpoderes', Samurai: 'Samuráis', Parody: 'Parodia',
  Mythology: 'Mitología', 'Time Travel': 'Viajes en el tiempo', Detective: 'Detectives', Gore: 'Gore', Survival: 'Supervivencia',
  'Love Polygon': 'Triángulo amoroso', 'Adult Cast': 'Elenco adulto', Anthropomorphic: 'Antropomórfico', CGDCT: 'Chicas lindas',
  Childcare: 'Crianza', 'Combat Sports': 'Deportes de combate', Crossdressing: 'Crossdressing', Delinquents: 'Delincuentes',
  Educational: 'Educativo', 'Gag Humor': 'Humor absurdo', 'High Stakes Game': 'Juegos de alto riesgo', 'Idols (Female)': 'Idols',
  'Idols (Male)': 'Idols masculinos', Iyashikei: 'Iyashikei', 'Magical Sex Shift': 'Cambio de sexo', 'Mahou Shoujo': 'Chicas mágicas',
  Medical: 'Médico', 'Organized Crime': 'Crimen organizado', 'Otaku Culture': 'Cultura otaku', 'Performing Arts': 'Artes escénicas',
  Pets: 'Mascotas', Racing: 'Carreras', Reincarnation: 'Reencarnación', 'Romantic Subtext': 'Subtexto romántico',
  Showbiz: 'Farándula', 'Strategy Game': 'Estrategia', 'Team Sports': 'Deportes en equipo', 'Video Game': 'Videojuegos',
  'Visual Arts': 'Artes visuales', Workplace: 'Trabajo', 'Urban Fantasy': 'Fantasía urbana', Villainess: 'Villana',
  Shounen: 'Shōnen', Shoujo: 'Shōjo', Seinen: 'Seinen', Josei: 'Josei', Kids: 'Infantil',
};
const TYPE_ES = { TV: 'Serie TV', Movie: 'Película', OVA: 'OVA', ONA: 'ONA', Special: 'Especial', Music: 'Musical', 'TV Special': 'Especial TV', CM: 'Comercial', PV: 'Promocional' };

const Meta = {
  cancel: false,
  running: false,
  lastCall: 0,

  slots: {},
  async throttle(key, ms) {
    const wait = (this.slots[key] || 0) + ms - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.slots[key] = Date.now();
  },
  async getJson(url, tries = 3, init) {
    const anilist = url.includes('anilist');
    for (let i = 0; i < tries; i++) {
      const kitsu = url.includes('kitsu');
      await this.throttle(anilist ? 'anilist' : kitsu ? 'kitsu' : 'jikan', anilist ? 2100 : kitsu ? 500 : 1100);
      let res;
      try { res = await net.fetch(url, { ...(init || {}), headers: { 'User-Agent': 'KuroPlayer/1.7', Accept: url.includes('kitsu') ? 'application/vnd.api+json' : 'application/json', ...((init && init.headers) || {}) } }); }
      catch (e) { if (i === tries - 1) throw new Error('Sin conexión a internet'); await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2500 * (i + 1))); continue; }
      if (!res.ok) throw new Error('El servicio respondió HTTP ' + res.status);
      return res.json();
    }
    throw new Error('El servicio está ocupado, inténtalo más tarde');
  },
  fromJikan(a) {
    const genres = [...(a.genres || []), ...(a.explicit_genres || []), ...(a.themes || []), ...(a.demographics || [])].map((g) => g.name);
    const synopsis = String(a.synopsis || '').replace(/\n*\[Written by MAL Rewrite\]\s*$/i, '').replace(/\n*\(Source:[^)]*\)\s*$/i, '').trim();
    return {
      source: 'MyAnimeList', id: a.mal_id, url: a.url,
      title: a.title || '', titleEn: a.title_english || '', titleJp: a.title_japanese || '',
      synonyms: (a.title_synonyms || []).slice(0, 6),
      type: a.type || '', typeEs: TYPE_ES[a.type] || a.type || '',
      episodes: a.episodes || null, status: a.status || '',
      year: a.year || (a.aired && a.aired.prop && a.aired.prop.from && a.aired.prop.from.year) || null,
      score: a.score || null, rating: a.rating || '',
      synopsis, genres, genresEs: genres.map((g) => GENRES_ES[g] || g),
      studios: (a.studios || []).map((s) => s.name),
      image: (a.images && ((a.images.webp && a.images.webp.large_image_url) || (a.images.jpg && a.images.jpg.large_image_url))) || '',
    };
  },
  fromAniList(m) {
    const strip = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').replace(/\n*\(Source:[^)]*\)\s*$/i, '').trim();
    const tags = (m.tags || []).filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler && t.rank >= 70).slice(0, 8).map((t) => t.name);
    const genres = [...(m.genres || []), ...tags];
    const fmt = { TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' }[m.format] || m.format || '';
    return {
      source: 'AniList', id: m.id, url: m.siteUrl, malId: m.idMal || null,
      title: (m.title && (m.title.romaji || m.title.english)) || '', titleEn: (m.title && m.title.english) || '', titleJp: (m.title && m.title.native) || '',
      synonyms: (m.synonyms || []).slice(0, 6),
      type: fmt, typeEs: TYPE_ES[fmt] || fmt,
      episodes: m.episodes || null, status: m.status || '',
      year: m.seasonYear || (m.startDate && m.startDate.year) || null,
      score: m.averageScore ? Math.round(m.averageScore) / 10 : null, rating: m.isAdult ? '18+' : '',
      synopsis: strip(m.description), genres, genresEs: genres.map((g) => GENRES_ES[g] || g),
      studios: ((m.studios && m.studios.nodes) || []).map((n) => n.name),
      image: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || '',
      banner: m.bannerImage || '',
      adult: !!m.isAdult,
    };
  },
  // separa el nombre de la carpeta en prefijo de orden (1_, M_, 02 - ...) y nombre real
  parseFolder(name) {
    let raw = String(name).trim();
    let prefix = '';
    const m = /^((?:[A-Za-z]|\d{1,3})\s*[_\-.)]\s*|\d{1,3}\s+-\s+)(?=\S)/.exec(raw);
    if (m && raw.length - m[0].length >= 3) { prefix = m[0]; raw = raw.slice(m[0].length); }
    return { prefix, core: raw, query: this.cleanName(raw) || raw };
  },
  cleanName(name) {
    return String(name)
      .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')            // CamelCase pegado → palabras
      .replace(/([A-Za-z])(\d{2,})\b/g, '$1 $2')
      .replace(/[._+]+/g, ' ')
      .replace(/(^|[\s-])(1080p|720p|480p|2160p|4k|x26[45]|h\.?26[45]|hevc|avc|10bit|8bit|bd|bdrip|blu-?ray|web-?dl|webrip|dvd|dvdrip|batch|complete|completo|sub(bed|s|esp)?|dub(bed)?|espa[nñ]ol|latino|castellano|jap|raw|multi|dual|audio|uncensored|sin censura|flac|aac)(?=$|[\s-])/gi, ' ')
      .replace(/\b(temporada|season)\s*\d+\b/gi, ' ')
      .replace(/\s+-\s*$/g, ' ')
      .replace(/\s{2,}/g, ' ').trim();
  },
  norm(s) {
    return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ').trim();
  },
  // normalización "fonética" de romaji: ignora vocales largas y confusiones típicas al escribir
  romaji(s) {
    return this.norm(s).replace(/ /g, '')
      .replace(/ou|oo|oh(?![aeiou])/g, 'o').replace(/uu/g, 'u').replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/ee|ei/g, 'e')
      .replace(/wo/g, 'o').replace(/tsu/g, 'tu').replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/fu/g, 'hu')
      .replace(/ji/g, 'zi').replace(/sh(?=[aou])/g, 'sy').replace(/ch(?=[aou])/g, 'ty').replace(/j(?=[aou])/g, 'zy')
      .replace(/([a-z])\1+/g, '$1');
  },
  dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const grams = new Map();
    for (let i = 0; i < a.length - 1; i++) { const g = a.slice(i, i + 2); grams.set(g, (grams.get(g) || 0) + 1); }
    let hit = 0;
    for (let i = 0; i < b.length - 1; i++) { const g = b.slice(i, i + 2); const n = grams.get(g); if (n) { hit++; grams.set(g, n - 1); } }
    return (2 * hit) / (a.length + b.length - 2);
  },
  // parecido entre el nombre buscado y los títulos del candidato (0..1)
  confidence(query, cand) {
    const names = [cand.title, cand.titleEn, cand.titleJp, ...(cand.synonyms || [])].filter(Boolean);
    const qa = this.norm(query).replace(/ /g, ''), qr = this.romaji(query);
    let best = 0;
    for (const n of names) {
      const na = this.norm(n).replace(/ /g, ''), nr = this.romaji(n);
      let d = Math.max(this.dice(qa, na), this.dice(qr, nr) * 0.97);
      if (qr && nr && qr.length >= 4) {
        // título incompleto: la carpeta es el inicio del título oficial (o al revés)
        if (nr.startsWith(qr) || qr.startsWith(nr)) d = Math.max(d, 0.6 + 0.35 * Math.min(qr.length, nr.length) / Math.max(qr.length, nr.length));
      }
      best = Math.max(best, d);
    }
    return Math.round(Math.min(1, best) * 100) / 100;
  },
  fromKitsu(a) {
    const t = a.attributes || {};
    const titles = t.titles || {};
    const sub = { TV: 'TV', movie: 'Movie', OVA: 'OVA', ONA: 'ONA', special: 'Special', music: 'Music' }[t.subtype] || t.subtype || '';
    return {
      source: 'Kitsu', id: a.id, url: 'https://kitsu.app/anime/' + (t.slug || a.id),
      title: titles.en_jp || t.canonicalTitle || '', titleEn: titles.en || titles.en_us || '', titleJp: titles.ja_jp || '',
      synonyms: [t.canonicalTitle, ...(t.abbreviatedTitles || [])].filter(Boolean).slice(0, 6),
      type: sub, typeEs: TYPE_ES[sub] || sub, episodes: t.episodeCount || null, status: t.status || '',
      year: t.startDate ? +String(t.startDate).slice(0, 4) : null,
      score: t.averageRating ? Math.round(parseFloat(t.averageRating)) / 10 : null, rating: t.ageRating || '',
      synopsis: String(t.synopsis || '').replace(/\n*\(Source:[^)]*\)\s*$/i, '').trim(), genres: [], genresEs: [], studios: [],
      image: (t.posterImage && (t.posterImage.large || t.posterImage.original)) || '',
      banner: (t.coverImage && (t.coverImage.large || t.coverImage.original)) || '',
    };
  },
  async searchKitsu(q) {
    const data = await this.getJson('https://kitsu.io/api/edge/anime?page[limit]=6&filter[text]=' + encodeURIComponent(q.slice(0, 100)));
    return (data.data || []).map((a) => this.fromKitsu(a));
  },
  async searchAniList(q) {
    const query = `query($s:String){Page(perPage:10){media(search:$s,type:ANIME){id idMal title{romaji english native} synonyms
      startDate{year} seasonYear episodes format status averageScore genres tags{name rank isMediaSpoiler isGeneralSpoiler}
      studios(isMain:true){nodes{name}} coverImage{extraLarge large} bannerImage siteUrl isAdult description(asHtml:false)}}}`;
    const data = await this.getJson('https://graphql.anilist.co', 3, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { s: q.slice(0, 100) } }),
    });
    return (((data.data || {}).Page || {}).media || []).map((m) => this.fromAniList(m));
  },
  async searchJikan(q) {
    const data = await this.getJson('https://api.jikan.moe/v4/anime?limit=10&q=' + encodeURIComponent(q.slice(0, 100)));
    return (data.data || []).map((a) => this.fromJikan(a));
  },
  // búsqueda en varias etapas; se detiene en cuanto hay una coincidencia clara
  async search(folderName, opts = {}) {
    const { query } = this.parseFolder(folderName);
    const q = query || String(folderName);
    const pool = new Map();
    const add = (list) => {
      for (const c of list) {
        const k = c.source + ':' + c.id;
        if (pool.has(k)) continue;
        c.confidence = this.confidence(q, c);
        // hallado solo por una palabra suelta: exige más parecido para no dar falsos positivos
        if (c.penalty && c.confidence < 0.95) c.confidence = Math.round(c.confidence * c.penalty * 100) / 100;
        delete c.penalty;
        pool.set(k, c);
      }
    };
    const best = () => Math.max(0, ...[...pool.values()].filter((c) => c.source !== 'Kitsu').map((c) => c.confidence));
    const tried = new Set();
    const anilist = async (term, penalty) => {
      term = term.trim();
      if (!term || tried.has(term.toLowerCase())) return;
      tried.add(term.toLowerCase());
      try {
        const list = await this.searchAniList(term);
        if (penalty) list.forEach((c) => { c.penalty = penalty; });
        add(list);
      }
      catch (e) {
        if (/conexión/i.test(e.message)) throw e;
        try { add(await this.searchJikan(term)); } catch (e2) { /* sin respaldo */ }
      }
    };
    const GOOD = 0.86;
    // 1) nombre limpio
    await anilist(q);
    // 2) Kitsu como corrector ortográfico (tolera errores, palabras pegadas o incompletas)
    if (best() < GOOD && !opts.quick) {
      let kit = [];
      try { kit = await this.searchKitsu(q); } catch (e) { if (/conexión/i.test(e.message)) throw e; }
      kit.forEach((c) => { c.confidence = this.confidence(q, c); });
      kit.sort((a, b) => b.confidence - a.confidence);
      for (const k of kit.slice(0, 2)) {
        if (k.confidence < 0.45 || best() >= GOOD) break;
        await anilist(k.title || k.synonyms[0] || '');
        if (best() < GOOD && k.titleEn) await anilist(k.titleEn);
      }
      // si AniList no lo tiene, se usa el dato de Kitsu
      if (best() < 0.6) add(kit);
    }
    // 3) nombre pegado sin espacios: cortar en partículas romaji (shingekinokyojin → shingeki no kyojin)
    if (best() < GOOD && !opts.quick && !/\s/.test(q) && q.length >= 9) {
      const low = q.toLowerCase();
      const cuts = [];
      const re = /(no|wa|ni|to|ga|de|wo|na)/g; let m;
      while ((m = re.exec(low))) {
        const i = m.index, L = low.slice(0, i), R = low.slice(i + 2);
        if (L.length >= 3 && R.length >= 3) cuts.push(`${L} ${m[1]} ${R}`);
      }
      cuts.sort((a, b) => Math.abs(a.indexOf(' ') - low.length / 2) - Math.abs(b.indexOf(' ') - low.length / 2));
      for (const c of cuts.slice(0, 3)) { if (best() >= GOOD) break; await anilist(c); }
    }
    // 4) palabras sueltas más distintivas (títulos mal escritos que Kitsu no conoce)
    if (best() < GOOD && !opts.quick) {
      const words = q.split(/\s+/).filter((w) => w.length >= 4 && !/^(the|and|with|season|temporada|anime|movie)$/i.test(w));
      const tries = [];
      if (words.length >= 3) tries.push(words.slice(0, 2).join(' '));
      words.slice().sort((a, b) => b.length - a.length).slice(0, 2).forEach((w) => tries.push(w));
      for (const t of tries) { if (best() >= GOOD) break; await anilist(t, 0.88); }
    }
    return [...pool.values()].sort((a, b) => b.confidence - a.confidence || (a.source === 'Kitsu') - (b.source === 'Kitsu')).slice(0, 12);
  },
  async translate(text) {
    if (!text) return text;
    const parts = []; let cur = '';
    for (const para of text.split(/\n/)) {
      if ((cur + '\n' + para).length > 1500 && cur) { parts.push(cur); cur = para; } else cur = cur ? cur + '\n' + para : para;
    }
    if (cur) parts.push(cur);
    const out = [];
    for (const p of parts) {
      const res = await net.fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=' + encodeURIComponent(p));
      if (!res.ok) throw new Error('traducción ' + res.status);
      const j = await res.json();
      out.push((j[0] || []).map((x) => x[0]).join(''));
    }
    return out.join('\n');
  },
  async downloadCover(seriesId, url) {
    const res = await net.fetch(url);
    if (!res.ok) throw new Error('portada ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = /\.webp(\?|$)/i.test(url) ? '.webp' : /\.png(\?|$)/i.test(url) ? '.png' : '.jpg';
    const dest = path.join(COVER_DIR, `${seriesId}-cover-web-${Date.now()}${ext}`);
    await fsp.writeFile(dest, buf);
    return dest;
  },
  async applyToSeries(seriesId, cand, opts) {
    const m = store.meta[seriesId] || {};
    const web = { ...cand, fetchedAt: Date.now() };
    if (opts.translate !== false && web.synopsis) {
      try { web.synopsisEs = await this.translate(web.synopsis); } catch (e) { /* se queda en inglés */ }
    }
    const unknown = (web.genres || []).filter((g) => !GENRES_ES[g]);
    if (opts.translate !== false && unknown.length) {
      try {
        const tr = (await this.translate(unknown.join('\n'))).split('\n').map((x) => x.trim());
        if (tr.length === unknown.length) {
          const map = new Map(unknown.map((g, i) => [g, tr[i].charAt(0).toUpperCase() + tr[i].slice(1)]));
          web.genresEs = web.genres.map((g) => GENRES_ES[g] || map.get(g) || g);
        }
      } catch (e) { /* etiquetas en inglés */ }
    }
    m.web = web;
    m.webStatus = 'ok';
    delete m.webCandidate;
    if (opts.manual) m.webLocked = true;
    const s = lastScan.find((x) => x.id === seriesId);
    const hasOwn = (m.cover && !m.coverFromWeb && fs.existsSync(m.cover)) || (s && s.hasFolderCover);
    if (web.image && opts.cover !== false && (!hasOwn || opts.overwriteCover)) {
      try {
        const newCover = await this.downloadCover(seriesId, web.image);
        if (m.cover && m.coverFromWeb && m.cover.startsWith(COVER_DIR)) await fsp.unlink(m.cover).catch(() => {});
        m.cover = newCover;
        m.coverFromWeb = true;
      } catch (e) { /* sin portada */ }
    }
    const hasOwnBackdrop = m.backdrop && !m.backdropFromWeb && fs.existsSync(m.backdrop);
    if (web.banner && opts.cover !== false && !hasOwnBackdrop) {
      try {
        const res = await net.fetch(web.banner);
        if (res.ok) {
          const dest = path.join(COVER_DIR, `${seriesId}-backdrop-web-${Date.now()}.jpg`);
          await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()));
          if (m.backdrop && m.backdropFromWeb && m.backdrop.startsWith(COVER_DIR)) await fsp.unlink(m.backdrop).catch(() => {});
          m.backdrop = dest; m.backdropFromWeb = true;
        }
      } catch (e) { /* sin fondo */ }
    }
    store.meta[seriesId] = m;
    saveStoreSoon();
    return m;
  },
  async fetchAll(opts) {
    if (this.running) return { busy: true };
    this.running = true; this.cancel = false;
    const all = lastScan.length ? lastScan : await scanLibrary();
    const list = all.filter((s) => {
      const m = store.meta[s.id] || {};
      if (m.webLocked) return false; // las elecciones manuales no se pisan
      return opts.onlyMissing === false ? true : !m.web;
    });
    const send = (d) => { if (win && !win.isDestroyed()) win.webContents.send('web:progress', d); };
    const res = { total: list.length, ok: 0, doubt: 0, none: 0, errors: 0 };
    for (let i = 0; i < list.length; i++) {
      if (this.cancel) { res.cancelled = true; break; }
      const s = list[i];
      send({ done: i, title: s.folderName, ...res });
      try {
        const cands = await this.search(s.searchName || s.folderName);
        const best = cands[0];
        const m = store.meta[s.id] || {};
        if (best && best.confidence >= (opts.threshold || 0.8)) {
          await this.applyToSeries(s.id, best, opts);
          res.ok++;
        } else if (best && best.confidence >= 0.55) {
          m.webStatus = 'doubt'; m.webCandidate = { ...best }; store.meta[s.id] = m; res.doubt++;
        } else {
          m.webStatus = 'none'; delete m.webCandidate; store.meta[s.id] = m; res.none++;
        }
        saveStoreSoon();
      } catch (e) {
        res.errors++;
        res.lastError = e.message;
        if (/conexión/i.test(e.message)) { res.offline = true; break; }
      }
    }
    this.running = false;
    send({ done: list.length, finished: true, ...res });
    return res;
  },
};


function sanitizeFolderName(n) {
  return String(n).replace(/[:]/g, ' -').replace(/[\\/*?"<>|]/g, '').replace(/\s{2,}/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 150);
}
async function renameSeriesFolder(id, newName) {
  const s = lastScan.find((x) => x.id === id);
  if (!s) throw new Error('Serie no encontrada, vuelve a escanear');
  if (store.roots.some((r) => norm(r) === norm(s.dir))) throw new Error('Esta serie es una carpeta raíz de la biblioteca; renómbrala desde el explorador');
  const clean = sanitizeFolderName(newName);
  if (!clean) throw new Error('Nombre no válido');
  const newDir = path.join(path.dirname(s.dir), clean);
  if (newDir === s.dir) return { id };
  const caseOnly = norm(newDir) === norm(s.dir);
  if (!caseOnly && fs.existsSync(newDir)) throw new Error('Ya existe una carpeta con ese nombre');
  try {
    if (caseOnly) { const tmp = s.dir + '.__cg_tmp'; await fsp.rename(s.dir, tmp); await fsp.rename(tmp, newDir); }
    else await fsp.rename(s.dir, newDir);
  } catch (e) {
    if (/EPERM|EBUSY|EACCES/.test(e.code || '')) throw new Error('Windows no permite renombrarla: algún archivo está abierto (cierra el video o el explorador en esa carpeta)');
    throw new Error('No se pudo renombrar: ' + e.message);
  }
  const newId = hash(newDir);
  if (store.meta[id]) { store.meta[newId] = { ...store.meta[id] }; delete store.meta[id]; }
  const oldPrefix = norm(s.dir) + path.sep;
  for (const k of Object.keys(store.progress)) {
    if (norm(k).startsWith(oldPrefix)) {
      const nk = newDir + k.slice(s.dir.length);
      store.progress[nk] = { ...store.progress[k], s: newId };
      delete store.progress[k];
    }
  }
  for (const k of Object.keys(store.seen || {})) {
    if (norm(k).startsWith(oldPrefix)) { store.seen[newDir + k.slice(s.dir.length)] = store.seen[k]; delete store.seen[k]; }
  }
  for (const ep of s.episodes) {
    const np = newDir + ep.path.slice(s.dir.length);
    const of = path.join(THUMB_DIR, ep.id + '.jpg'), nf = path.join(THUMB_DIR, hash(np) + '.jpg');
    if (fs.existsSync(of)) await fsp.rename(of, nf).catch(() => {});
  }
  saveStoreNow();
  return { id: newId, dir: newDir };
}

// ---------------------------------------------------------------- vigilancia de carpetas (detecta capítulos nuevos)
function setupWatchers() {
  for (const w of watchers) { try { w.close(); } catch (e) { /* */ } }
  watchers = [];
  if (store.settings.autoWatch === false) return;
  for (const root of store.roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const w = fs.watch(root, { recursive: true }, (ev, file) => {
        if (!file) return;
        const ext = path.extname(String(file)).toLowerCase();
        // solo interesan videos y carpetas (sin extensión); se ignoran temporales de descargas
        if (ext && !VIDEO_EXT.has(ext)) return;
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          if (win && !win.isDestroyed()) win.webContents.send('lib:changed');
        }, 4000);
      });
      w.on('error', () => {});
      watchers.push(w);
    } catch (e) { /* unidad sin soporte de vigilancia */ }
  }
}

// ---------------------------------------------------------------- FFmpeg: análisis y conversión al vuelo de formatos no compatibles
const MediaEngine = (() => {
  const unpacked = (p) => String(p || '').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  let FFMPEG = '', FFPROBE = '';
  try { FFMPEG = unpacked(require('ffmpeg-static')); } catch (e) { /* sin ffmpeg */ }
  try { FFPROBE = unpacked(require('ffprobe-static').path); } catch (e) { /* sin ffprobe */ }
  const available = () => !!(FFMPEG && FFPROBE && fs.existsSync(FFMPEG) && fs.existsSync(FFPROBE));

  const NATIVE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'hevc']);
  const NATIVE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
  const TEXT_SUBS = new Set(['ass', 'ssa', 'subrip', 'srt', 'webvtt', 'mov_text', 'text']);
  const LANGS = { jpn: 'Japonés', ja: 'Japonés', spa: 'Español', es: 'Español', eng: 'Inglés', en: 'Inglés', por: 'Portugués', pt: 'Portugués',
    fre: 'Francés', fra: 'Francés', fr: 'Francés', ger: 'Alemán', deu: 'Alemán', de: 'Alemán', ita: 'Italiano', it: 'Italiano', chi: 'Chino', zho: 'Chino', kor: 'Coreano', rus: 'Ruso', und: '' };
  const cache = new Map();
  let encoder = null;           // códec H.264 elegido (GPU si hay)
  const streams = new Map();    // token -> parámetros
  let active = null;            // proceso ffmpeg actual del reproductor

  function run(bin, args, timeout = 30000) {
    return new Promise((resolve) => {
      const p = spawn(bin, args, { windowsHide: true });
      const out = []; let err = '';
      const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) { /* */ } }, timeout);
      p.stdout.on('data', (d) => out.push(d));
      p.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
      p.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout: Buffer.alloc(0), stderr: 'no se pudo ejecutar' }); });
      p.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(out), stderr: err }); });
    });
  }

  function langName(tags) {
    const l = String((tags && tags.language) || '').toLowerCase();
    return LANGS[l] != null ? LANGS[l] : l.toUpperCase();
  }

  async function probe(file) {
    let st; try { st = fs.statSync(file); } catch (e) { return null; }
    const key = file + '|' + st.mtimeMs;
    if (cache.has(key)) return cache.get(key);
    if (!available()) return null;
    const r = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], 20000);
    if (r.code !== 0) return null;
    let j; try { j = JSON.parse(r.stdout.toString('utf8')); } catch (e) { return null; }
    const streamsList = j.streams || [];
    const v = streamsList.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
    const audios = streamsList.filter((s) => s.codec_type === 'audio').map((s, i) => ({
      index: s.index, n: i, codec: s.codec_name, channels: s.channels || 2, lang: langName(s.tags), title: (s.tags && s.tags.title) || '',
      def: !!(s.disposition && s.disposition.default),
    }));
    const subs = streamsList.filter((s) => s.codec_type === 'subtitle').map((s, i) => ({
      index: s.index, n: i, codec: s.codec_name, lang: langName(s.tags), title: (s.tags && s.tags.title) || '',
      def: !!(s.disposition && s.disposition.default), forced: !!(s.disposition && s.disposition.forced), text: TEXT_SUBS.has(s.codec_name),
    }));
    const fmt = (j.format && j.format.format_name) || '';
    const info = {
      duration: parseFloat((j.format && j.format.duration) || (v && v.duration) || 0) || 0,
      container: fmt,
      video: v ? { codec: v.codec_name, pix: v.pix_fmt || '', profile: v.profile || '', width: v.width, height: v.height } : null,
      audios, subs, videoIndex: v ? v.index : null,
    };
    info.plan = plan(info, file);
    cache.set(key, info);
    return info;
  }

  function videoNative(info) {
    const v = info.video;
    if (!v) return true;
    if (!NATIVE_VIDEO.has(v.codec)) return false;
    // H.264 de 10/12 bits (Hi10P, muy común en anime) y 4:2:2/4:4:4 no los decodifica Chromium
    if (v.codec === 'h264' && !/^(yuv420p|yuvj420p|nv12)$/.test(v.pix)) return false;
    return true;
  }
  function containerNative(info, file) {
    const f = info.container;
    const ext = path.extname(file).toLowerCase();
    if (/mov|mp4/.test(f) && ['.mp4', '.m4v', '.mov'].includes(ext)) return true;
    if (/matroska|webm/.test(f)) return true;
    if (/ogg/.test(f)) return true;
    return false;
  }
  function defaultAudio(info) {
    return info.audios.find((a) => a.def) || info.audios[0] || null;
  }
  function plan(info, file) {
    const reasons = [];
    const a = defaultAudio(info);
    if (!containerNative(info, file)) reasons.push('contenedor ' + info.container.split(',')[0].toUpperCase());
    if (!videoNative(info)) reasons.push('video ' + info.video.codec.toUpperCase() + (/10|12/.test(info.video.pix) ? ' 10 bits' : ''));
    if (a && !NATIVE_AUDIO.has(a.codec)) reasons.push('audio ' + a.codec.toUpperCase());
    return { mode: reasons.length ? 'stream' : 'direct', reasons, audio: a ? a.index : null };
  }

  async function pickEncoder() {
    if (encoder) return encoder;
    const candidates = [
      { name: 'h264_nvenc', args: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '21', '-pix_fmt', 'yuv420p'] },
      { name: 'h264_qsv', args: ['-c:v', 'h264_qsv', '-global_quality', '22', '-pix_fmt', 'nv12'] },
      { name: 'h264_amf', args: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22', '-pix_fmt', 'yuv420p'] },
    ];
    for (const c of candidates) {
      const r = await run(FFMPEG, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=0.3', ...c.args, '-f', 'null', '-'], 15000);
      if (r.code === 0) { encoder = c; return c; }
    }
    encoder = { name: 'libx264', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-crf', '20', '-pix_fmt', 'yuv420p'] };
    return encoder;
  }

  // posición del fotograma clave anterior (para copiar el video sin recodificar y que el tiempo cuadre)
  async function keyframeBefore(file, t) {
    if (t <= 0.5) return 0;
    const from = Math.max(0, t - 12);
    const r = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time,best_effort_timestamp_time',
      '-of', 'csv=p=0', '-read_intervals', `${from.toFixed(3)}%${(t + 0.5).toFixed(3)}`, file], 15000);
    let best = null;
    for (const line of r.stdout.toString().split(/\r?\n/)) {
      for (const part of line.split(',')) {
        const x = parseFloat(part);
        if (isFinite(x) && x <= t + 0.05 && (best == null || x > best)) best = x;
      }
    }
    return best == null ? from : best;
  }

  async function prepareStream(file, opts) {
    const info = await probe(file);
    if (!info) throw new Error('No se pudo analizar el archivo');
    const t = Math.max(0, Math.min(+opts.t || 0, Math.max(0, info.duration - 1)));
    const copyVideo = !opts.forceVideo && videoNative(info) && !(info.video && info.video.codec === 'hevc' && opts.hevcFailed);
    const audio = info.audios.find((x) => x.index === opts.audio) || defaultAudio(info);
    const copyAudio = audio && NATIVE_AUDIO.has(audio.codec) && audio.codec !== 'vorbis';
    const offset = copyVideo && info.video ? await keyframeBefore(file, t) : t;
    const enc = copyVideo ? null : await pickEncoder();
    const token = crypto.randomBytes(8).toString('hex');
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (offset > 0) args.push('-ss', offset.toFixed(3));
    args.push('-i', file);
    if (info.video) args.push('-map', `0:${info.videoIndex}`);
    if (audio) args.push('-map', `0:${audio.index}`);
    if (info.video) {
      if (copyVideo) { args.push('-c:v', 'copy'); if (info.video.codec === 'hevc') args.push('-tag:v', 'hvc1'); }
      else args.push(...enc.args, '-g', '48', '-bf', '0');
    }
    if (audio) {
      if (copyAudio) args.push('-c:a', 'copy');
      else args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
    }
    args.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-max_muxing_queue_size', '2048',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
    streams.set(token, { file, args, created: Date.now() });
    for (const [k, v] of streams) if (Date.now() - v.created > 6 * 3600 * 1000) streams.delete(k);
    return {
      url: 'cinema://local/stream?k=' + token, offset, duration: info.duration,
      copyVideo, copyAudio: !!copyAudio, encoder: enc ? enc.name : null,
      label: [copyVideo ? null : `video → H.264 (${enc.name.replace('h264_', '').replace('lib', '').toUpperCase()})`, audio && !copyAudio ? `audio ${audio.codec.toUpperCase()} → AAC` : null].filter(Boolean).join(' · ') || 'reempaquetado',
    };
  }

  function serve(token) {
    const s = streams.get(token);
    if (!s) return new Response('No encontrado', { status: 404 });
    if (active) { try { active.kill('SIGKILL'); } catch (e) { /* */ } active = null; }
    const proc = spawn(FFMPEG, s.args, { windowsHide: true });
    active = proc;
    proc.stderr.on('data', (d) => { const m = String(d).trim(); if (m) console.warn('[ffmpeg]', m.slice(0, 300)); });
    proc.on('close', () => { if (active === proc) active = null; });
    const body = Readable.toWeb(proc.stdout);
    const wrapped = new ReadableStream({
      async start(ctrl) {
        const reader = body.getReader();
        try {
          for (;;) { const { value, done } = await reader.read(); if (done) break; ctrl.enqueue(value); }
          ctrl.close();
        } catch (e) { try { ctrl.error(e); } catch (e2) { /* */ } }
      },
      cancel() { try { proc.kill('SIGKILL'); } catch (e) { /* */ } },
    });
    return new Response(wrapped, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'none', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  }
  function stop() { if (active) { try { active.kill('SIGKILL'); } catch (e) { /* */ } active = null; } }

  async function subtitle(file, index, codec) {
    const f = /ass|ssa/.test(codec) ? 'ass' : 'srt';
    const r = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', `0:${index}`, '-f', f, 'pipe:1'], 60000);
    if (r.code !== 0) throw new Error('No se pudo extraer el subtítulo');
    return { text: r.stdout.toString('utf8'), format: f };
  }

  async function thumb(file, id) {
    const info = await probe(file);
    const d = (info && info.duration) || 60;
    const t = Math.min(d * 0.28, d > 600 ? 420 : d * 0.28);
    const out = path.join(THUMB_DIR, id + '.jpg');
    const r = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1',
      '-vf', 'scale=320:180:force_original_aspect_ratio=increase,crop=320:180', '-q:v', '4', '-y', out], 30000);
    return r.code === 0 && fs.existsSync(out) ? `cinema://local/thumb/${id}.jpg?v=${Date.now()}` : null;
  }

  let versionCache = null;
  async function version() {
    if (versionCache) return versionCache;
    if (!available()) return null;
    const r = await run(FFMPEG, ['-version'], 10000);
    const m = /ffmpeg version (\S+)/.exec(r.stdout.toString());
    versionCache = m ? m[1].replace(/-essentials_build.*$/, '') : '?';
    return versionCache;
  }
  async function encoderName() { return available() ? (await pickEncoder()).name : null; }
  return { available, probe, prepareStream, serve, stop, subtitle, thumb, version, encoderName };
})();

// ---------------------------------------------------------------- IPC
// ---------------------------------------------------------------- reproductores externos («Abrir con»)
// Cada definición: ejecutables conocidos, carpetas típicas y cómo pedir que empiece en un segundo concreto.
const PLAYER_DEFS = [
  { id: 'potplayer', name: 'PotPlayer', exes: ['PotPlayerMini64.exe', 'PotPlayerMini.exe', 'PotPlayer64.exe', 'PotPlayer.exe'], dirs: ['DAUM\\PotPlayer', 'PotPlayer'], args: (f, s) => (s > 1 ? [f, '/seek=' + s] : [f]) },
  { id: 'vlc', name: 'VLC media player', exes: ['vlc.exe'], dirs: ['VideoLAN\\VLC'], args: (f, s) => (s > 1 ? ['--start-time=' + s, f] : [f]) },
  { id: 'mpc-hc', name: 'MPC-HC', exes: ['mpc-hc64.exe', 'mpc-hc.exe'], dirs: ['MPC-HC', 'MPC-HC x64', 'K-Lite Codec Pack\\MPC-HC64', 'K-Lite Codec Pack\\MPC-HC'], args: (f, s) => (s > 1 ? [f, '/start', String(s * 1000)] : [f]) },
  { id: 'mpc-be', name: 'MPC-BE', exes: ['mpc-be64.exe', 'mpc-be.exe'], dirs: ['MPC-BE x64', 'MPC-BE'], args: (f, s) => (s > 1 ? [f, '/start', String(s * 1000)] : [f]) },
  { id: 'mpv', name: 'mpv', exes: ['mpv.exe'], dirs: ['mpv', 'mpv-x86_64'], args: (f, s) => (s > 1 ? ['--start=' + s, f] : [f]) },
  { id: 'mpvnet', name: 'mpv.net', exes: ['mpvnet.exe'], dirs: ['mpv.net'], args: (f, s) => (s > 1 ? ['--start=' + s, f] : [f]) },
  { id: 'smplayer', name: 'SMPlayer', exes: ['smplayer.exe'], dirs: ['SMPlayer'], args: (f) => [f] },
  { id: 'kmplayer', name: 'KMPlayer', exes: ['KMPlayer64.exe', 'KMPlayer.exe'], dirs: ['KMPlayer 64X', 'KMPlayer', 'The KMPlayer'], args: (f) => [f] },
  { id: 'gom', name: 'GOM Player', exes: ['GOM64.exe', 'GOM.exe'], dirs: ['GRETECH\\GomPlayer', 'GOM\\GOMPlayer', 'GOMPlayer'], args: (f) => [f] },
  { id: 'kodi', name: 'Kodi', exes: ['kodi.exe'], dirs: ['Kodi'], args: (f) => [f] },
  { id: 'daum', name: 'Daum PotPlayer (instancia completa)', exes: [], dirs: [], args: (f) => [f] },
  { id: 'wmp', name: 'Reproductor de Windows Media', exes: ['wmplayer.exe'], dirs: ['Windows Media Player'], args: (f) => [f] },
].filter((d) => d.exes.length);

function regAppPath(exe) {
  // lee (solo lectura) HKLM/HKCU\...\App Paths\<exe> del registro de Windows
  return new Promise((resolve) => {
    const keys = [`HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`];
    let pending = keys.length, found = null;
    for (const k of keys) {
      const p = spawn('reg', ['query', k, '/ve'], { windowsHide: true });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('error', () => { if (--pending === 0) resolve(found); });
      p.on('close', () => {
        const m = /REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(out);
        if (m && !found) {
          const v = m[1].trim().replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (x, n) => process.env[n] || x);
          if (fs.existsSync(v)) found = v;
        }
        if (--pending === 0) resolve(found);
      });
    }
  });
}

async function detectPlayers() {
  const bases = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['ProgramW6432'],
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), 'C:\\Program Files', 'C:\\Program Files (x86)']
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const scoop = process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'scoop', 'apps');
  const found = [];
  for (const d of PLAYER_DEFS) {
    let hit = null;
    for (const b of bases) {
      for (const dir of d.dirs) for (const exe of d.exes) {
        const p = path.join(b, dir, exe);
        if (!hit && fs.existsSync(p)) hit = p;
      }
    }
    if (!hit && scoop) {
      for (const dir of [d.id, d.name.toLowerCase().replace(/\s+/g, '-')]) for (const exe of d.exes) {
        const p = path.join(scoop, dir, 'current', exe);
        if (!hit && fs.existsSync(p)) hit = p;
      }
    }
    if (!hit) for (const exe of d.exes) { if (!hit) hit = await regAppPath(exe); }
    if (hit) found.push({ id: d.id, name: d.name, path: hit, seek: d.args('x', 5).length > 1 });
  }
  return found;
}

function openWithPlayer(playerId, file, seconds) {
  const list = store.settings.players || [];
  let pl = list.find((x) => x.id === playerId);
  if (!pl && playerId === 'potplayer') { const pp = findPotPlayer(); if (pp) pl = { id: 'potplayer', path: pp }; }
  if (!pl || !fs.existsSync(pl.path) || !isAllowed(file)) return false;
  const def = PLAYER_DEFS.find((d) => d.id === pl.id);
  const s = Math.floor(seconds || 0);
  const args = def ? def.args(file, s) : [file];
  spawn(pl.path, args, { detached: true, stdio: 'ignore' }).unref();
  return true;
}

function findPotPlayer() {
  if (store.settings.potplayer && fs.existsSync(store.settings.potplayer)) return store.settings.potplayer;
  const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean);
  for (const base of pf) {
    for (const exe of ['DAUM\\PotPlayer\\PotPlayerMini64.exe', 'DAUM\\PotPlayer\\PotPlayerMini.exe', 'PotPlayer\\PotPlayerMini64.exe', 'PotPlayer\\PotPlayerMini.exe']) {
      const p = path.join(base, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  return '';
}

function setupIpc() {
  ipcMain.handle('media:probe', async (e, p) => (isAllowed(p) ? MediaEngine.probe(p) : null));
  ipcMain.handle('media:stream', async (e, p, opts) => { if (!isAllowed(p)) throw new Error('Sin acceso'); return MediaEngine.prepareStream(p, opts || {}); });
  ipcMain.handle('media:stop', () => { MediaEngine.stop(); return true; });
  ipcMain.handle('media:sub', async (e, p, index, codec) => { if (!isAllowed(p)) throw new Error('Sin acceso'); return MediaEngine.subtitle(p, index, codec); });
  ipcMain.handle('media:thumb', async (e, p, id) => (isAllowed(p) && /^[a-f0-9]{16}$/.test(id) ? MediaEngine.thumb(p, id) : null));
  ipcMain.handle('media:available', () => MediaEngine.available());
  ipcMain.handle('players:detect', () => detectPlayers());
  ipcMain.handle('players:open', (e, id, file, seconds) => openWithPlayer(id, file, seconds));
  ipcMain.handle('players:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Elegir un reproductor de video', properties: ['openFile'], filters: [{ name: 'Programa', extensions: ['exe'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    return { id: 'custom-' + hash(p).slice(0, 8), name: path.basename(p, path.extname(p)), path: p, custom: true };
  });
  ipcMain.handle('app:info', async () => ({
    name: 'Kuro Player', version: require('./package.json').version,
    electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, v8: process.versions.v8,
    os: `${process.getSystemVersion ? 'Windows ' + process.getSystemVersion() : process.platform} (${process.arch})`,
    ffmpeg: await MediaEngine.version(), encoder: await MediaEngine.encoderName(),
    dataDir: DATA_DIR, exeDir: path.dirname(process.execPath), packaged: app.isPackaged,
  }));
  ipcMain.handle('app:openDataDir', () => shell.openPath(DATA_DIR));
  ipcMain.handle('lib:get', () => ({
    roots: store.roots, settings: store.settings, progress: store.progress,
    potplayer: findPotPlayer(), dataDir: DATA_DIR,
  }));
  ipcMain.handle('lib:scan', async () => { const series = await scanLibrary(); setupWatchers(); return { series, diff: lastDiff }; });

  // clasifica una carpeta: nueva, ya cargada, o dentro de una ya cargada
  function addRootPath(dir, result) {
    const n = norm(dir);
    const same = store.roots.find((x) => norm(x) === n);
    if (same) { result.already.push(dir); return; }
    const parent = store.roots.find((x) => n.startsWith(norm(x) + path.sep));
    if (parent) { result.inside.push({ dir, parent }); return; }
    store.roots.push(dir);
    result.added.push(dir);
  }
  ipcMain.handle('roots:pick', async () => {
    const res = { roots: store.roots, added: [], already: [], inside: [], canceled: false };
    const r = await dialog.showOpenDialog(win, { title: 'Elegir carpeta de videos / anime', properties: ['openDirectory', 'multiSelections'] });
    if (r.canceled) { res.canceled = true; return res; }
    for (const p of r.filePaths) addRootPath(p, res);
    saveStoreSoon();
    res.roots = store.roots;
    return res;
  });
  ipcMain.handle('roots:add', (e, paths) => {
    const res = { roots: store.roots, added: [], already: [], inside: [] };
    for (const p of paths || []) {
      try {
        const st = fs.statSync(p);
        addRootPath(st.isDirectory() ? p : path.dirname(p), res);
      } catch (err) { /* */ }
    }
    saveStoreSoon();
    res.roots = store.roots;
    return res;
  });
  ipcMain.handle('roots:clear', () => {
    store.roots = [];
    extraAllowed.clear();          // también las carpetas abiertas arrastrándolas
    saveStoreNow();
    setupWatchers();
    return store.roots;
  });
  // deja la app como recién instalada: biblioteca, progreso, ajustes, portadas, miniaturas y caché
  ipcMain.handle('app:factoryReset', async () => {
    try { MediaEngine.stop(); } catch (e) { /* nada sonando */ }
    extraAllowed.clear();
    lastScan = []; lastDiff = null; scanNew = null;
    for (const dir of [THUMB_DIR, COVER_DIR]) {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(dir, { recursive: true });
    }
    store = DEFAULT_STORE();
    saveStoreNow();
    setupWatchers();
    if (win) {
      await win.webContents.session.clearCache().catch(() => {});
      await win.webContents.session.clearStorageData({ storages: ['localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'shadercache'] }).catch(() => {});
    }
    return true;
  });
  ipcMain.handle('roots:info', () => store.roots.map((r) => ({ path: r, exists: fs.existsSync(r) })));
  ipcMain.handle('shell:openWeb', (e, url) => {
    if (/^https:\/\/(myanimelist\.net|anilist\.co)\//.test(String(url))) shell.openExternal(url);
  });
  const clearWeb = (m) => {
    if (m.cover && m.coverFromWeb && m.cover.startsWith(COVER_DIR)) { fsp.unlink(m.cover).catch(() => {}); delete m.cover; }
    if (m.backdrop && m.backdropFromWeb && m.backdrop.startsWith(COVER_DIR)) { fsp.unlink(m.backdrop).catch(() => {}); delete m.backdrop; }
    delete m.backdropFromWeb;
    delete m.web; delete m.webStatus; delete m.webCandidate; delete m.webLocked; delete m.coverFromWeb;
  };
  ipcMain.handle('web:search', (e, query) => Meta.search(query));
  ipcMain.handle('web:parseFolder', (e, name) => Meta.parseFolder(name));
  ipcMain.handle('series:rename', (e, id, name) => renameSeriesFolder(id, name));
  ipcMain.handle('series:setSplit', (e, parentId, split) => {
    store.meta[parentId] = { ...(store.meta[parentId] || { addedAt: Date.now() }), split: !!split };
    saveStoreSoon();
    return true;
  });
  ipcMain.handle('web:apply', (e, seriesId, cand, opts) => Meta.applyToSeries(seriesId, cand, { ...(opts || {}), manual: true }));
  ipcMain.handle('web:clear', (e, seriesId) => { const m = store.meta[seriesId] || {}; clearWeb(m); store.meta[seriesId] = m; saveStoreSoon(); return true; });
  ipcMain.handle('web:clearAll', () => { for (const m of Object.values(store.meta)) clearWeb(m); saveStoreSoon(); return true; });
  ipcMain.handle('web:fetchAll', (e, opts) => Meta.fetchAll(opts || {}));
  ipcMain.handle('web:cancel', () => { Meta.cancel = true; return true; });
  ipcMain.handle('roots:remove', (e, p) => {
    store.roots = store.roots.filter((x) => norm(x) !== norm(p));
    saveStoreSoon();
    return store.roots;
  });

  ipcMain.handle('meta:set', (e, id, patch) => {
    store.meta[id] = { ...(store.meta[id] || {}), ...patch };
    saveStoreSoon();
    return store.meta[id];
  });
  ipcMain.handle('image:pick', async (e, seriesId, kind) => {
    const r = await dialog.showOpenDialog(win, {
      title: kind === 'backdrop' ? 'Elegir imagen de fondo' : 'Elegir portada',
      properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: [...IMAGE_EXT].map((x) => x.slice(1)) }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const dest = path.join(COVER_DIR, `${seriesId}-${kind}-${Date.now()}${path.extname(src).toLowerCase()}`);
    await fsp.copyFile(src, dest);
    const prev = (store.meta[seriesId] || {})[kind];
    if (prev && prev.startsWith(COVER_DIR)) fsp.unlink(prev).catch(() => {});
    store.meta[seriesId] = { ...(store.meta[seriesId] || {}), [kind]: dest };
    if (kind === 'cover') delete store.meta[seriesId].coverFromWeb;
    if (kind === 'backdrop') delete store.meta[seriesId].backdropFromWeb;
    saveStoreSoon();
    return mediaUrl(dest, Date.now());
  });
  ipcMain.handle('image:reset', (e, seriesId, kind) => {
    const prev = (store.meta[seriesId] || {})[kind];
    if (prev && prev.startsWith(COVER_DIR)) fsp.unlink(prev).catch(() => {});
    if (store.meta[seriesId]) delete store.meta[seriesId][kind];
    saveStoreSoon();
    return true;
  });
  ipcMain.handle('image:fromThumb', async (e, seriesId, dataUrl) => {
    const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    if (!buf.length) return null;
    const dest = path.join(COVER_DIR, `${seriesId}-cover-${Date.now()}.jpg`);
    await fsp.writeFile(dest, buf);
    const prev = (store.meta[seriesId] || {}).cover;
    if (prev && prev.startsWith(COVER_DIR)) fsp.unlink(prev).catch(() => {});
    store.meta[seriesId] = { ...(store.meta[seriesId] || {}), cover: dest };
    saveStoreSoon();
    return mediaUrl(dest, Date.now());
  });

  ipcMain.handle('progress:set', (e, batch) => {
    for (const [k, v] of Object.entries(batch || {})) {
      if (v === null) delete store.progress[k]; else store.progress[k] = v;
    }
    saveStoreSoon();
    return true;
  });
  ipcMain.handle('settings:set', (e, patch) => {
    const watchChanged = patch && 'autoWatch' in patch && patch.autoWatch !== store.settings.autoWatch;
    store.settings = { ...store.settings, ...patch };
    if (watchChanged) setupWatchers();
    saveStoreSoon();
    return store.settings;
  });

  ipcMain.handle('thumb:save', async (e, id, dataUrl) => {
    if (!/^[a-f0-9]{16}$/.test(id)) return null;
    const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    if (!buf.length) return null;
    const f = path.join(THUMB_DIR, id + '.jpg');
    await fsp.writeFile(f, buf);
    return `cinema://local/thumb/${id}.jpg?v=${Date.now()}`;
  });
  ipcMain.handle('thumbs:clear', async () => {
    for (const f of await fsp.readdir(THUMB_DIR)) await fsp.unlink(path.join(THUMB_DIR, f)).catch(() => {});
    return true;
  });

  ipcMain.handle('sub:read', async (e, p) => {
    if (!isAllowed(p)) return null;
    const buf = await fsp.readFile(p);
    if (buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
    if (buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.slice(2)); b.swap16(); return b.toString('utf16le'); }
    let txt = buf.toString('utf8');
    if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf);
    return txt.replace(/^\uFEFF/, '');
  });
  ipcMain.handle('sub:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Cargar subtítulos', properties: ['openFile'], filters: [{ name: 'Subtítulos', extensions: ['srt', 'vtt', 'ass', 'ssa'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    extraAllowed.add(norm(path.dirname(r.filePaths[0])));
    return r.filePaths[0];
  });

  ipcMain.handle('shell:show', (e, p) => { if (isAllowed(p)) shell.showItemInFolder(p); });
  ipcMain.handle('shell:openDir', (e, p) => { if (isAllowed(p)) shell.openPath(p); });
  ipcMain.handle('potplayer:open', (e, p, seconds) => {
    const exe = findPotPlayer();
    if (!exe || !isAllowed(p)) return false;
    const args = [p];
    if (seconds > 1) args.push('/seek=' + Math.floor(seconds));
    spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  });
  ipcMain.handle('potplayer:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Ubicar PotPlayer', properties: ['openFile'], filters: [{ name: 'Programa', extensions: ['exe'] }] });
    if (r.canceled || !r.filePaths[0]) return findPotPlayer();
    store.settings.potplayer = r.filePaths[0];
    saveStoreSoon();
    return r.filePaths[0];
  });

  ipcMain.handle('screenshot:save', async (e, dataUrl, baseName) => {
    const dir = path.join(app.getPath('pictures'), 'Kuro Player');
    await fsp.mkdir(dir, { recursive: true });
    const safe = String(baseName || 'captura').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
    const f = path.join(dir, `${safe}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    await fsp.writeFile(f, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
    return f;
  });

  ipcMain.handle('win:fullscreen', (e, on) => { if (win) win.setFullScreen(!!on); return win ? win.isFullScreen() : false; });
  ipcMain.handle('win:alwaysOnTop', (e, on) => { if (win) win.setAlwaysOnTop(!!on); return !!on; });
}

// ---------------------------------------------------------------- ventana
// recupera tamaño/posición/maximizado de la última sesión (si el monitor sigue conectado)
function savedBounds() {
  const ws = store.windowState;
  if (!ws || !ws.bounds) return null;
  const b = ws.bounds;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 20 && b.y < a.y + a.height - 80;
  });
  return visible ? b : null;
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const fullscreen = win.isFullScreen();
  store.windowState = {
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized() || (fullscreen && store.windowState && store.windowState.maximized) || false,
  };
  saveStoreSoon();
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const sb = savedBounds();
  win = new BrowserWindow({
    ...(sb ? { x: sb.x, y: sb.y } : {}),
    width: sb ? sb.width : Math.min(1600, Math.round(width * 0.9)),
    height: sb ? sb.height : Math.min(980, Math.round(height * 0.9)),
    minWidth: 960, minHeight: 600,
    backgroundColor: '#070a12',
    title: 'Kuro Player',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#dfe6ff', height: 44 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => {
    if (store.windowState && store.windowState.maximized) win.maximize();
    win.show();
  });
  let wsTimer = null;
  const wsSoon = () => { clearTimeout(wsTimer); wsTimer = setTimeout(saveWindowState, 800); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, wsSoon);
  win.on('close', () => { clearTimeout(wsTimer); saveWindowState(); saveStoreNow(); });
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('cinema://')) e.preventDefault(); });
  win.loadURL('cinema://local/app/index.html');
}

// Migra biblioteca, progreso, portadas y miniaturas del nombre anterior (Cinema Glass) la primera vez
function migrateOldData() {
  const newDir = app.getPath('userData');
  if (fs.existsSync(path.join(newDir, 'library.json'))) return;
  for (const old of ['Cinema Glass', 'cinema-glass']) {
    const oldDir = path.join(app.getPath('appData'), old);
    if (!fs.existsSync(path.join(oldDir, 'library.json')) || path.resolve(oldDir) === path.resolve(newDir)) continue;
    try {
      fs.mkdirSync(newDir, { recursive: true });
      fs.copyFileSync(path.join(oldDir, 'library.json'), path.join(newDir, 'library.json'));
      for (const sub of ['thumbs', 'covers']) {
        if (fs.existsSync(path.join(oldDir, sub))) fs.cpSync(path.join(oldDir, sub), path.join(newDir, sub), { recursive: true, force: false });
      }
      // las portadas personalizadas guardaban la ruta completa: se apuntan a la carpeta nueva
      const f = path.join(newDir, 'library.json');
      const txt = fs.readFileSync(f, 'utf8');
      const esc = (x) => JSON.stringify(x).slice(1, -1);
      fs.writeFileSync(f, txt.split(esc(oldDir)).join(esc(newDir)));
      console.log('Datos migrados desde', oldDir);
    } catch (e) { console.error('No se pudieron migrar los datos anteriores', e); }
    return;
  }
}

app.whenReady().then(async () => {
  migrateOldData();
  DATA_DIR = app.getPath('userData');
  THUMB_DIR = path.join(DATA_DIR, 'thumbs');
  COVER_DIR = path.join(DATA_DIR, 'covers');
  STORE_FILE = path.join(DATA_DIR, 'library.json');
  await fsp.mkdir(THUMB_DIR, { recursive: true });
  await fsp.mkdir(COVER_DIR, { recursive: true });
  await loadStore();
  registerProtocol();
  setupIpc();
  createWindow();
});
app.on('before-quit', () => { MediaEngine.stop(); saveStoreNow(); });
app.on('window-all-closed', () => { saveStoreNow(); app.quit(); });
