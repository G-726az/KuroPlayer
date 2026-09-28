/* Lectura de subtítulos externos: SRT, VTT, ASS/SSA → lista de cues {start, end, text, top} */
const Subs = (() => {
  function ts(str) {
    const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/.exec(str.trim());
    if (!m) return NaN;
    const ms = m[4].padEnd(3, '0');
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+ms) / 1000;
  }
  function cleanTags(t) {
    return t.replace(/<\/?(?!i>|b>|u>|\/i>|\/b>|\/u>)[^>]+>/gi, '').replace(/\{[^}]*\}/g, '');
  }
  function parseSrtVtt(text) {
    const cues = [];
    const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
    for (const b of blocks) {
      const lines = b.split('\n').filter((l) => l.length);
      const idx = lines.findIndex((l) => l.includes('-->'));
      if (idx < 0) continue;
      const [a, rest] = lines[idx].split('-->');
      const start = ts(a), end = ts(rest.trim().split(/\s+/)[0]);
      if (isNaN(start) || isNaN(end)) continue;
      const body = lines.slice(idx + 1).join('\n');
      cues.push({ start, end, text: cleanTags(body), top: false });
    }
    return cues;
  }
  function parseAss(text) {
    const cues = [];
    let format = null;
    for (const raw of text.replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      if (/^Format:/i.test(line) && format === null && /Start/i.test(line) && /Text/i.test(line)) {
        format = line.slice(7).split(',').map((s) => s.trim().toLowerCase());
        continue;
      }
      if (!/^Dialogue:/i.test(line)) continue;
      const fmt = format || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
      const parts = line.slice(9).split(',');
      const head = parts.slice(0, fmt.length - 1).map((s) => s.trim());
      const textPart = parts.slice(fmt.length - 1).join(',');
      const get = (k) => head[fmt.indexOf(k)];
      const start = ts(get('start') + '0'), end = ts(get('end') + '0');
      if (isNaN(start) || isNaN(end)) continue;
      const top = /\\an[789]/.test(textPart);
      // omite dibujos vectoriales
      if (/\\p[1-9]/.test(textPart)) continue;
      let t = textPart
        .replace(/\{[^}]*\\i1[^}]*\}/g, '<i>').replace(/\{[^}]*\\i0[^}]*\}/g, '</i>')
        .replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ');
      t = cleanTags(t).trim();
      if (t) cues.push({ start, end, text: t, top });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }
  function parse(text, name) {
    if (/\.(ass|ssa)$/i.test(name) || /^\s*\[Script Info\]/i.test(text)) return parseAss(text);
    return parseSrtVtt(text);
  }
  function safeHtml(t) {
    return esc(t).replace(/&lt;(\/?)(i|b|u)&gt;/gi, '<$1$2>');
  }
  return { parse, safeHtml };
})();
