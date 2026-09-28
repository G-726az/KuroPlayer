/* Procesado de color en GPU: cada cuadro del video pasa por un shader con los ajustes. */
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

class ColorGL {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.params = { ...COLOR_DEFAULTS };
    this.split = -1;
    this.ok = false;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) return;
    this.gl = gl;
    const vs = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
    const fs = `
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 texel;
uniform float bright, contrast, sat, vib, hue, gamma, temp, tint, sharp, vign, split;
vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca);
}
void main(){
  vec3 orig = texture2D(tex, uv).rgb;
  if (uv.x < split) { gl_FragColor = vec4(orig, 1.0); return; }
  vec3 c = orig;
  if (sharp != 0.0) {
    vec3 n = texture2D(tex, uv + vec2(texel.x, 0.)).rgb + texture2D(tex, uv - vec2(texel.x, 0.)).rgb
           + texture2D(tex, uv + vec2(0., texel.y)).rgb + texture2D(tex, uv - vec2(0., texel.y)).rgb;
    vec3 d = texture2D(tex, uv + texel).rgb + texture2D(tex, uv - texel).rgb
           + texture2D(tex, uv + vec2(texel.x, -texel.y)).rgb + texture2D(tex, uv + vec2(-texel.x, texel.y)).rgb;
    vec3 blur = (c*4.0 + n*2.0 + d) / 16.0;
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
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return; }
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.u = {};
    for (const n of ['texel', 'bright', 'contrast', 'sat', 'vib', 'hue', 'gamma', 'temp', 'tint', 'sharp', 'vign', 'split']) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(gl.getUniformLocation(prog, 'tex'), 0);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.ok = true;
  }

  isNeutral() {
    return Object.keys(COLOR_DEFAULTS).every((k) => Math.abs(this.params[k] - COLOR_DEFAULTS[k]) < 1e-4) && this.split < 0;
  }

  render() {
    if (!this.ok) return false;
    const v = this.video, gl = this.gl;
    if (v.readyState < 2 || !v.videoWidth) return false;
    if (this.canvas.width !== v.videoWidth || this.canvas.height !== v.videoHeight) {
      this.canvas.width = v.videoWidth;
      this.canvas.height = v.videoHeight;
      gl.viewport(0, 0, v.videoWidth, v.videoHeight);
    }
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
    } catch (e) { console.warn('texImage2D', e); this.ok = false; return false; }
    const p = this.params;
    gl.uniform2f(this.u.texel, 1 / v.videoWidth, 1 / v.videoHeight);
    gl.uniform1f(this.u.bright, p.brightness);
    gl.uniform1f(this.u.contrast, p.contrast);
    gl.uniform1f(this.u.sat, p.saturation);
    gl.uniform1f(this.u.vib, p.vibrance);
    gl.uniform1f(this.u.hue, (p.hue * Math.PI) / 180);
    gl.uniform1f(this.u.gamma, p.gamma);
    gl.uniform1f(this.u.temp, p.temperature);
    gl.uniform1f(this.u.tint, p.tint);
    gl.uniform1f(this.u.sharp, p.sharpness);
    gl.uniform1f(this.u.vign, p.vignette);
    gl.uniform1f(this.u.split, this.split);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}
