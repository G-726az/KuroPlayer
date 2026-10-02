/* Procesado en GPU: cada cuadro del video pasa por un shader con los ajustes de color y,
   opcionalmente, por la mejora de imagen para anime (escalado + líneas nítidas, basada en Anime4K v0.9, licencia MIT). */
const COLOR_DEFAULTS = {
  brightness: 0, contrast: 1, saturation: 1, vibrance: 0, hue: 0, gamma: 1,
  temperature: 0, tint: 0, sharpness: 0, vignette: 0,
};

const COLOR_SLIDERS = [
  { sep: 'Imagen' },
  { key: 'brightness', label: 'Brillo', min: -0.3, max: 0.3, step: 0.005, fmt: (v) => Math.round(v * 333) },
  { key: 'contrast', label: 'Contraste', min: 0.5, max: 1.8, step: 0.01, fmt: (v) => Math.round((v - 1) * 100) },
  { key: 'gamma', label: 'Gamma', min: 0.5, max: 2, step: 0.01, fmt: (v) => v.toFixed(2) },
  { sep: 'Color' },
  { key: 'saturation', label: 'Saturación', min: 0, max: 2.5, step: 0.01, fmt: (v) => Math.round((v - 1) * 100) },
  { key: 'vibrance', label: 'Intensidad (vibrance)', min: -1, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { key: 'hue', label: 'Tono', min: -180, max: 180, step: 1, fmt: (v) => Math.round(v) + '°' },
  { key: 'temperature', label: 'Temperatura', min: -1, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { key: 'tint', label: 'Matiz verde/magenta', min: -1, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { sep: 'Efectos' },
  { key: 'sharpness', label: 'Nitidez / Suavizado', min: -1, max: 1.5, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { key: 'vignette', label: 'Viñeta', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
];

const COLOR_PRESETS = [
  { name: 'Normal', v: {} },
  { name: 'Anime vívido', v: { saturation: 1.3, vibrance: 0.35, contrast: 1.06, sharpness: 0.3, gamma: 1.02 } },
  { name: 'Anime suave', v: { saturation: 1.12, vibrance: 0.2, contrast: 1.02, sharpness: -0.15, brightness: 0.01 } },
  { name: 'Colores intensos', v: { saturation: 1.55, vibrance: 0.4, contrast: 1.12, sharpness: 0.2 } },
  { name: 'Cine', v: { contrast: 1.12, saturation: 0.95, temperature: 0.12, vignette: 0.35, gamma: 0.97 } },
  { name: 'Nítido', v: { sharpness: 0.7, contrast: 1.04 } },
  { name: 'Brillante', v: { brightness: 0.04, gamma: 1.15, saturation: 1.1 } },
  { name: 'Noche (cálido)', v: { temperature: 0.45, brightness: -0.02, saturation: 0.95 } },
  { name: 'Blanco y negro', v: { saturation: 0, contrast: 1.15 } },
];

// niveles de la mejora de imagen: cuánto se adelgazan las líneas y cuánto se afilan los bordes
const ENHANCE_LEVELS = {
  off: null,
  soft: { name: 'Suave', thin: 0.12, grad: 0.5 },
  medium: { name: 'Media', thin: 0.22, grad: 0.75 },
  strong: { name: 'Fuerte', thin: 0.33, grad: 1.0 },
};

class ColorGL {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.params = { ...COLOR_DEFAULTS };
    this.split = -1;
    this.enhance = null;
    this.ok = false;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return;
    this.gl = gl;
    const vs = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
    // 1) color (+ escalado bicúbico Catmull-Rom cuando hay mejora de imagen)
    const fsColor = `
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 texel, texSize;
uniform float bright, contrast, sat, vib, hue, gamma, temp, tint, sharp, vign, split, cubic;
vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca);
}
vec3 sampleCubic(vec2 p){
  vec2 sp = p * texSize - 0.5;
  vec2 t1 = floor(sp) + 0.5;
  vec2 f = sp - t1 + 0.5;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 p0 = (t1 - 1.0) * texel, p3 = (t1 + 2.0) * texel, p12 = (t1 + o12) * texel;
  vec3 c = texture2D(tex, vec2(p0.x, p0.y)).rgb * w0.x * w0.y + texture2D(tex, vec2(p12.x, p0.y)).rgb * w12.x * w0.y + texture2D(tex, vec2(p3.x, p0.y)).rgb * w3.x * w0.y
         + texture2D(tex, vec2(p0.x, p12.y)).rgb * w0.x * w12.y + texture2D(tex, vec2(p12.x, p12.y)).rgb * w12.x * w12.y + texture2D(tex, vec2(p3.x, p12.y)).rgb * w3.x * w12.y
         + texture2D(tex, vec2(p0.x, p3.y)).rgb * w0.x * w3.y + texture2D(tex, vec2(p12.x, p3.y)).rgb * w12.x * w3.y + texture2D(tex, vec2(p3.x, p3.y)).rgb * w3.x * w3.y;
  return clamp(c, 0.0, 1.0);
}
vec3 src(vec2 p){ return cubic > 0.5 ? sampleCubic(p) : texture2D(tex, p).rgb; }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 st = vec2(uv.x, 1.0 - uv.y); // el cuadro se sube sin voltear (más rápido): se voltea aquí
  vec3 orig = src(st);
  if (uv.x < split) { gl_FragColor = vec4(orig, luma(orig)); return; }
  vec3 c = orig;
  if (sharp != 0.0) {
    vec3 n = texture2D(tex, st + vec2(texel.x, 0.)).rgb + texture2D(tex, st - vec2(texel.x, 0.)).rgb
           + texture2D(tex, st + vec2(0., texel.y)).rgb + texture2D(tex, st - vec2(0., texel.y)).rgb;
    vec3 d = texture2D(tex, st + texel).rgb + texture2D(tex, st - texel).rgb
           + texture2D(tex, st + vec2(texel.x, -texel.y)).rgb + texture2D(tex, st + vec2(-texel.x, texel.y)).rgb;
    vec3 blur = (texture2D(tex, st).rgb*4.0 + n*2.0 + d) / 16.0;
    c = sharp > 0.0 ? c + (c - blur) * sharp * 1.6 : mix(c, blur, -sharp);
  }
  c += bright;
  c = (c - 0.5) * contrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, sat);
  if (vib != 0.0) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float s = mx - mn;
    float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l2), c, 1.0 + vib * (1.0 - s) * 1.2);
  }
  if (hue != 0.0) c = hueRotate(c, hue);
  c.r += temp * 0.08; c.b -= temp * 0.08; c.g += tint * 0.06;
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / gamma));
  if (vign > 0.0) {
    vec2 q = uv - 0.5;
    c *= 1.0 - vign * smoothstep(0.25, 0.85, length(q * vec2(1.15, 1.0)) * 1.25);
  }
  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(c, luma(c));
}`;
    // 2 y 4) «push»: empuja los colores claros sobre las líneas (las adelgaza) o a lo largo del gradiente (bordes nítidos)
    const fsPush = `
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 px;
uniform float strength, split, final;
vec4 pick(vec4 cc, vec4 best, vec4 a, vec4 b, vec4 c){
  vec4 n = cc * (1.0 - strength) + ((a + b + c) / 3.0) * strength;
  return n.a > best.a ? n : best;
}
float mx3(float a, float b, float c){ return max(a, max(b, c)); }
float mn3(float a, float b, float c){ return min(a, min(b, c)); }
void main(){
  vec4 cc = texture2D(tex, uv);
  if (uv.x < split) { gl_FragColor = final > 0.5 ? vec4(cc.rgb, 1.0) : cc; return; }
  vec4 t = texture2D(tex, uv + vec2(0.0, px.y)), b = texture2D(tex, uv - vec2(0.0, px.y));
  vec4 l = texture2D(tex, uv - vec2(px.x, 0.0)), r = texture2D(tex, uv + vec2(px.x, 0.0));
  vec4 tl = texture2D(tex, uv + vec2(-px.x, px.y)), tr = texture2D(tex, uv + px);
  vec4 bl = texture2D(tex, uv - px), br = texture2D(tex, uv + vec2(px.x, -px.y));
  vec4 best = cc;
  float d = mx3(br.a, b.a, bl.a), g = mn3(tl.a, t.a, tr.a);
  if (g > cc.a && g > d) best = pick(cc, best, tl, t, tr);
  else { d = mx3(tl.a, t.a, tr.a); g = mn3(br.a, b.a, bl.a); if (g > cc.a && g > d) best = pick(cc, best, br, b, bl); }
  d = mx3(cc.a, l.a, b.a); g = mn3(r.a, t.a, tr.a);
  if (g > d) best = pick(cc, best, r, t, tr);
  else { d = mx3(cc.a, r.a, t.a); g = mn3(bl.a, l.a, b.a); if (g > d) best = pick(cc, best, bl, l, b); }
  d = mx3(l.a, tl.a, bl.a); g = mn3(r.a, br.a, tr.a);
  if (g > cc.a && g > d) best = pick(cc, best, r, br, tr);
  else { d = mx3(r.a, br.a, tr.a); g = mn3(l.a, tl.a, bl.a); if (g > cc.a && g > d) best = pick(cc, best, l, tl, bl); }
  d = mx3(cc.a, l.a, t.a); g = mn3(r.a, br.a, b.a);
  if (g > d) best = pick(cc, best, r, br, b);
  else { d = mx3(cc.a, r.a, b.a); g = mn3(t.a, l.a, tl.a); if (g > d) best = pick(cc, best, t, l, tl); }
  gl_FragColor = final > 0.5 ? vec4(best.rgb, 1.0) : vec4(best.rgb, dot(best.rgb, vec3(0.299, 0.587, 0.114)));
}`;
    // 3) gradiente (Sobel sobre la luminancia) invertido en el canal alfa
    const fsGrad = `
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 px;
float L(vec2 o){ return texture2D(tex, uv + o * px).a; }
void main(){
  vec4 cc = texture2D(tex, uv);
  float tl = L(vec2(-1., 1.)), t = L(vec2(0., 1.)), tr = L(vec2(1., 1.)), l = L(vec2(-1., 0.)), r = L(vec2(1., 0.)), bl = L(vec2(-1., -1.)), b = L(vec2(0., -1.)), br = L(vec2(1., -1.));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  gl_FragColor = vec4(cc.rgb, 1.0 - clamp(sqrt(gx * gx + gy * gy), 0.0, 1.0));
}`;
    const mk = (fs, names) => {
      const prog = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null; }
        gl.attachShader(prog, sh);
      }
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return null; }
      const u = {};
      for (const n of ['tex', ...names]) u[n] = gl.getUniformLocation(prog, n);
      return { prog, u };
    };
    this.pColor = mk(fsColor, ['texel', 'texSize', 'bright', 'contrast', 'sat', 'vib', 'hue', 'gamma', 'temp', 'tint', 'sharp', 'vign', 'split', 'cubic']);
    this.pPush = mk(fsPush, ['px', 'strength', 'split', 'final']);
    this.pGrad = mk(fsGrad, ['px']);
    if (!this.pColor) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = this.newTex();
    this.fbos = [];
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.ok = true;
  }

  newTex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  // dos búferes intermedios del tamaño de salida
  ensureFbos(w, h) {
    const gl = this.gl;
    if (this.fbos.length && this.fbos[0].w === w && this.fbos[0].h === h) return;
    for (const f of this.fbos) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fb); }
    this.fbos = [0, 1].map(() => {
      const tex = this.newTex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fb, w, h };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  isNeutral() {
    return Object.keys(COLOR_DEFAULTS).every((k) => Math.abs(this.params[k] - COLOR_DEFAULTS[k]) < 1e-4) && this.split < 0 && !this.enhance;
  }

  render() {
    if (!this.ok) return false;
    const v = this.video, gl = this.gl;
    if (v.readyState < 2 || !v.videoWidth) return false;
    const vw = v.videoWidth, vh = v.videoHeight;
    const enh = this.enhance;
    // tamaño de salida: el del video, o el de la pantalla si se mejora la imagen (máx. 4K)
    let ow = vw, oh = vh;
    if (enh) {
      const dpr = window.devicePixelRatio || 1;
      const cw = (this.canvas.clientWidth || vw) * dpr, ch = (this.canvas.clientHeight || vh) * dpr;
      const fit = Math.min(cw / vw, ch / vh);
      const scale = Math.min(Math.max(1, fit), 3840 / vw, 2160 / vh);
      ow = Math.round(vw * scale); oh = Math.round(vh * scale);
    }
    if (this.canvas.width !== ow || this.canvas.height !== oh) { this.canvas.width = ow; this.canvas.height = oh; }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // texImage2D con RGBA y sin voltear es lo más liviano medido en una Intel UHD (texSubImage2D resultó ~50 % más caro)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch (e) { console.warn('texImage2D', e); this.ok = false; return false; }
    // pase 1: color (+ escalado)
    const pc = this.pColor, p = this.params;
    gl.useProgram(pc.prog);
    gl.uniform1i(pc.u.tex, 0);
    gl.uniform2f(pc.u.texel, 1 / vw, 1 / vh);
    gl.uniform2f(pc.u.texSize, vw, vh);
    gl.uniform1f(pc.u.bright, p.brightness);
    gl.uniform1f(pc.u.contrast, p.contrast);
    gl.uniform1f(pc.u.sat, p.saturation);
    gl.uniform1f(pc.u.vib, p.vibrance);
    gl.uniform1f(pc.u.hue, (p.hue * Math.PI) / 180);
    gl.uniform1f(pc.u.gamma, p.gamma);
    gl.uniform1f(pc.u.temp, p.temperature);
    gl.uniform1f(pc.u.tint, p.tint);
    gl.uniform1f(pc.u.sharp, p.sharpness);
    gl.uniform1f(pc.u.vign, p.vignette);
    gl.uniform1f(pc.u.split, this.split);
    gl.uniform1f(pc.u.cubic, enh && (ow !== vw) ? 1 : 0);
    if (!enh || !this.pPush || !this.pGrad) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, ow, oh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    }
    this.ensureFbos(ow, oh);
    const [A, B] = this.fbos;
    const draw = (target, srcTex) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, ow, oh);
      if (srcTex) gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    draw(A, null);
    // pase 2: adelgazar líneas
    const pp = this.pPush;
    gl.useProgram(pp.prog);
    gl.uniform1i(pp.u.tex, 0);
    gl.uniform2f(pp.u.px, 1 / ow, 1 / oh);
    gl.uniform1f(pp.u.split, this.split);
    // a poco aumento las líneas ya son finas: se adelgazan menos (como en Anime4K, fuerza ∝ escala)
    gl.uniform1f(pp.u.strength, enh.thin * Math.min(1, Math.max(0.5, ow / vw / 2)));
    gl.uniform1f(pp.u.final, 0);
    draw(B, A.tex);
    // pase 3: gradiente
    const pg = this.pGrad;
    gl.useProgram(pg.prog);
    gl.uniform1i(pg.u.tex, 0);
    gl.uniform2f(pg.u.px, 1 / ow, 1 / oh);
    draw(A, B.tex);
    // pase 4: afilar a lo largo del gradiente → pantalla
    gl.useProgram(pp.prog);
    gl.uniform1f(pp.u.strength, enh.grad);
    gl.uniform1f(pp.u.final, 1);
    draw(null, A.tex);
    return true;
  }
}
