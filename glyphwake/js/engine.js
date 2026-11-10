// Glyphwake: renderer + ASCII post-processing pipeline.
// The 3D scene renders into an offscreen target whose alpha channel carries a
// "glyph set" id per material. A full-screen pass splits the screen into
// character cells, picks a glyph from that set's brightness ramp, then adds bloom.
(function () {
  'use strict';
  const E = window.GW = window.GW || {};
  const MAXL = 12;

  // ---- glyph sets (index = id written by materials) ----
  // mode: 0 ascii, 1 raw (pass the rendered pixels), 2 void
  // gain: brightness multiplier before choosing glyph; under: raw colour underlay
  // edge: draw outline glyphs where the set borders another; bright/white: glyph colour shaping
  const SETS = [
    /* 0 void   */ { ramp: ' ', mode: 2, gain: 1, under: 0.0, edge: 0, bright: 1, white: 0, flick: 0 },
    /* 1 ground */ { ramp: "   ..,,'`-:;~", mode: 0, gain: 1.6, under: 0.16, edge: 0, bright: 0.9, white: 0.05, flick: 0 },
    /* 2 grass  */ { ramp: " .,'/|\\;:!lI", mode: 1, gain: 1.95, under: 0.0, edge: 0, bright: 1.0, white: 0.0, flick: 0 },
    /* 3 stone  */ { ramp: " .:;coO0Q8B@", mode: 0, gain: 1.9, under: 0.18, edge: 1, bright: 1.1, white: 0.25, flick: 0 },
    /* 4 water  */ { ramp: " .,-~~=+*o@", mode: 0, gain: 2.2, under: 0.25, edge: 0, bright: 1.2, white: 0.35, flick: 5 },
    /* 5 leaf   */ { ramp: " .,:;*%&#@", mode: 0, gain: 2.0, under: 0.2, edge: 1, bright: 1.0, white: 0.1, flick: 0 },
    /* 6 body   */ { ramp: " .:-=+*#%@", mode: 0, gain: 2.0, under: 0.25, edge: 1, bright: 1.15, white: 0.35, flick: 0 },
    /* 7 metal  */ { ramp: " .:/|=#$%@", mode: 0, gain: 1.9, under: 0.2, edge: 1, bright: 1.3, white: 0.45, flick: 0 },
    /* 8 fire   */ { ramp: " .'^*+#%@", mode: 0, gain: 0.9, under: 0.45, edge: 0, bright: 1.5, white: 0.2, flick: 9 },
    /* 9 flower */ { ramp: " .o*o*O@", mode: 0, gain: 1.6, under: 0.1, edge: 0, bright: 1.4, white: 0.6, flick: 0 },
    /* 10 wood  */ { ramp: " .-=|[#H", mode: 0, gain: 1.9, under: 0.25, edge: 1, bright: 1.0, white: 0.1, flick: 0 },
    /* 11 cloth */ { ramp: " .:;ox%#&", mode: 0, gain: 2.1, under: 0.35, edge: 1, bright: 1.15, white: 0.0, flick: 0 },
    /* 12 bone  */ { ramp: " .,:;xX$&@", mode: 0, gain: 1.9, under: 0.2, edge: 1, bright: 1.2, white: 0.45, flick: 0 },
    /* 13 ruin  */ { ramp: " .rnuzcsaeqpbdwm", mode: 0, gain: 1.9, under: 0.12, edge: 0, bright: 1.15, white: 0.3, flick: 0 },
    /* 14 moss  */ { ramp: " .oo08QQB", mode: 0, gain: 2.3, under: 0.1, edge: 0, bright: 1.1, white: 0.3, flick: 0 },
    /* 15 rune  */ { ramp: " .*+xzk#@", mode: 0, gain: 0.9, under: 0.4, edge: 0, bright: 1.6, white: 0.35, flick: 6 },
    // ---- armour glyph patterns (actors) ----
    /* 16 mail    */ { ramp: " .:oo0O8@", mode: 0, gain: 2.0, under: 0.12, edge: 0, bright: 1.25, white: 0.4, flick: 0, actor: 1, jit: 0.3, pat: 1 },
    /* 17 plate   */ { ramp: " .-=:=#H#@", mode: 0, gain: 2.0, under: 0.12, edge: 0, bright: 1.35, white: 0.5, flick: 0, actor: 1, jit: 0.06, pat: 2 },
    /* 18 leather */ { ramp: " .,:;x%&%", mode: 0, gain: 2.2, under: 0.15, edge: 0, bright: 1.15, white: 0.15, flick: 0, actor: 1, jit: 0.18, pat: 0 },
    /* 19 scale   */ { ramp: " .vvVwWWM", mode: 0, gain: 2.1, under: 0.12, edge: 0, bright: 1.2, white: 0.3, flick: 0, actor: 1, jit: 0.08, pat: 3 },
    /* 20 silk    */ { ramp: " .'~^*\"&", mode: 0, gain: 2.2, under: 0.18, edge: 0, bright: 1.2, white: 0.1, flick: 0, actor: 1, jit: 0.12, pat: 0 },
    /* 21 boneplt */ { ramp: " .,!|IXX$", mode: 0, gain: 2.0, under: 0.12, edge: 0, bright: 1.25, white: 0.45, flick: 0, actor: 1, jit: 0.1, pat: 2 },
    /* 22 tabard  */ { ramp: " .:;=+x#%", mode: 0, gain: 2.3, under: 0.2, edge: 0, bright: 1.25, white: 0.05, flick: 0, actor: 1, jit: 0.1, pat: 0 },
  ];
  SETS.push(
    /* 23 sky     */ { ramp: "    ..'`", mode: 0, gain: 2.6, under: 0.9, edge: 0, bright: 0.6, white: 0.2, flick: 0 },
    /* 24 star    */ { ramp: " .+*", mode: 0, gain: 1.3, under: 0.25, edge: 0, bright: 1.7, white: 0.85, flick: 1.3 },
    /* 25 moon    */ { ramp: " .:oO0@", mode: 0, gain: 1.0, under: 0.55, edge: 0, bright: 1.35, white: 0.6, flick: 0 },
  );
  // body-type sets are "actors": solid glyph fill, bright silhouette edge, grass pushed back
  [6, 7, 11, 12].forEach(i => { SETS[i].actor = 1; SETS[i].edge = 0; SETS[i].under = 0.12; });
  while (SETS.length < 32) SETS.push({ ramp: ' ', mode: 2, gain: 1, under: 0, edge: 0, bright: 1, white: 0, flick: 0 });
  const ID = E.ID = { SKY: 23, STAR: 24, MOON: 25, MAIL: 16, PLATE: 17, LEATHER: 18, SCALE: 19, SILK: 20, BONEPLATE: 21, TABARD: 22, VOID: 0, GROUND: 1, GRASS: 2, STONE: 3, WATER: 4, LEAF: 5, BODY: 6, METAL: 7, FIRE: 8, FLOWER: 9, WOOD: 10, CLOTH: 11, BONE: 12, RUIN: 13, MOSS: 14, RUNE: 15 };
  E.SETS = SETS;
  const COLS = 16, ROWS = 33; // row 32: edge glyphs

  function buildAtlas() {
    const cw = 32, ch = 48;
    const c = document.createElement('canvas');
    c.width = cw * COLS; c.height = ch * ROWS;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 38px ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
    const draw = (chr, col, row) => { if (chr !== ' ') g.fillText(chr, col * cw + cw / 2, row * ch + ch / 2 + 2); };
    SETS.forEach((s, row) => {
      const r = s.ramp;
      for (let i = 0; i < COLS; i++) {
        const k = i === 0 ? 0 : 1 + Math.floor((i - 1) * (r.length - 1) / (COLS - 1));
        draw(r[Math.min(k, r.length - 1)], i, row);
      }
    });
    '|\\-/+'.split('').forEach((chr, i) => draw(chr, i, 32));
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }

  // ---------- shared lighting uniforms ----------
  const LU = E.LU = {
    uAmb: { value: new THREE.Color(0.1, 0.12, 0.17) },
    uMoonDir: { value: new THREE.Vector3(-0.5, 0.78, 0.38).normalize() },
    uMoonCol: { value: new THREE.Color(0.36, 0.42, 0.58) },
    uLP: { value: Array.from({ length: MAXL }, () => new THREE.Vector4(0, -999, 0, 1)) },
    uLC: { value: Array.from({ length: MAXL }, () => new THREE.Color(0, 0, 0)) },
    uLN: { value: 0 },
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uFog: { value: 0.012 },
    uFogStart: { value: 18 },
    uFogCol: { value: new THREE.Color(0.022, 0.032, 0.058) },
    uShadowMap: { value: null },
    uShadowMat: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
    uDepthPass: { value: 0 },
    uShadowTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
  };

  const LIGHT_GLSL = `
    #include <packing>
    uniform vec3 uAmb; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
    uniform vec4 uLP[${MAXL}]; uniform vec3 uLC[${MAXL}]; uniform int uLN;
    uniform vec3 uCam; uniform float uFog; uniform float uFogStart; uniform float uTime; uniform vec3 uFogCol;
    uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform float uShadowOn; uniform vec2 uShadowTexel; uniform float uDepthPass;
    float gShadow;
    // moon shadow map, 3x3 PCF with a normal offset against acne
    float shadowAt(vec3 W, vec3 n) {
      if (uShadowOn < 0.5) return 1.0;
      vec4 sp = uShadowMat * vec4(W + n * 0.08, 1.0);
      vec3 sc = sp.xyz / sp.w * 0.5 + 0.5;
      if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
      float sh = 0.0;
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
        float d = unpackRGBAToDepth(texture2D(uShadowMap, sc.xy + vec2(float(x), float(y)) * uShadowTexel * 1.25));
        sh += (sc.z - 0.0012 > d) ? 0.0 : 1.0;
      }
      float edge = smoothstep(0.0, 0.08, min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y)));
      return mix(1.0, sh / 9.0, edge);
    }
    vec3 lightAt(vec3 W, vec3 n) {
      float sh = shadowAt(W, n); gShadow = sh;
      vec3 L = uAmb * (0.55 + 0.45 * n.y) * (0.85 + 0.15 * sh) + uMoonCol * max(dot(n, uMoonDir), 0.0) * (0.4 + 0.6 * sh);
      for (int i = 0; i < ${MAXL}; i++) {
        if (i >= uLN) break;
        vec3 d = uLP[i].xyz - W; float dist = length(d);
        float k = clamp(1.0 - dist / uLP[i].w, 0.0, 1.0);
        float att = k * k * (1.0 + 1.5 / (1.0 + dist * dist * 0.35));
        L += uLC[i] * att * (max(dot(n, d / max(dist, 0.001)), 0.0) * 0.8 + 0.2);
      }
      return L;
    }
    // Blinn-Phong highlights from the moon (shadowed) and nearby lights
    vec3 specAt(vec3 W, vec3 n, vec3 V, float shin) {
      vec3 S = uMoonCol * pow(max(dot(n, normalize(uMoonDir + V)), 0.0), shin) * gShadow * 1.6;
      for (int i = 0; i < ${MAXL}; i++) {
        if (i >= uLN) break;
        vec3 d = uLP[i].xyz - W; float dist = length(d);
        float k = clamp(1.0 - dist / uLP[i].w, 0.0, 1.0);
        S += uLC[i] * k * k * pow(max(dot(n, normalize(d / max(dist, 0.001) + V)), 0.0), shin);
      }
      return S;
    }
    float fogAt(vec3 W) { return exp(-max(length(W - uCam) - uFogStart, 0.0) * uFog); }
    vec3 applyFog(vec3 col, vec3 W) { return mix(uFogCol, col, fogAt(W)); }
  `;
  E.LIGHT_GLSL = LIGHT_GLSL;

  const UBER_V = `
    varying vec3 vN; varying vec3 vW; varying vec3 vC;
    uniform vec3 uColor;
    #include <skinning_pars_vertex>
    void main() {
      vec3 objectNormal = normal; vec3 transformed = position;
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <skinning_vertex>
      vec4 p = vec4(transformed, 1.0); vec3 n = objectNormal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
      #endif
      vec4 w = modelMatrix * p;
      vN = normalize(mat3(modelMatrix) * n); vW = w.xyz; vC = uColor;
      #ifdef USE_COLOR
        vC *= color;
      #endif
      #ifdef USE_INSTANCING_COLOR
        vC *= instanceColor;
      #endif
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const UBER_F = `
    varying vec3 vN; varying vec3 vW; varying vec3 vC;
    uniform vec3 uEmissive; uniform float uId; uniform float uFlash; uniform float uRim; uniform float uUnlit; uniform float uSpec; uniform float uNoFog; uniform float uFarGrass;
    ${LIGHT_GLSL}
    void main() {
      if (uDepthPass > 0.5) { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); return; }
      vec3 n = normalize(vN);
      if (!gl_FrontFacing) n = -n;
      vec3 L = mix(lightAt(vW, n), vec3(1.0), uUnlit);
      vec3 V = normalize(uCam - vW);
      float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * uRim;
      vec3 col = vC * L + uEmissive + vec3(rim * 0.35, rim * 0.4, rim * 0.5) + uFlash;
      if (uSpec > 0.0 && uUnlit < 0.5) col += specAt(vW, n, V, 42.0) * uSpec;
      float outId = uId;
      if (uFarGrass > 0.0) {
        // beyond the live grass patch the ground turns into a meadow-coloured field that blends with the blades
        float dd = length(vW.xz - uCam.xz);
        float h = fract(sin(dot(floor(vW.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
        float k = smoothstep(uFarGrass * 0.75, uFarGrass * 1.1, dd + (h - 0.5) * 6.0);
        if (k > 0.5) {
          float meadow = smoothstep(0.02, 0.06, vC.g - vC.r);
          col = mix(col, vec3(0.15, 0.27, 0.17) * (L * 2.6 + 0.16), meadow * k);
          outId = mix(uId, 2.0, step(0.5, meadow));
        }
      }
      if (uNoFog < 0.5) col = uUnlit > 0.5 ? col * fogAt(vW) : applyFog(col, vW);
      gl_FragColor = vec4(col, (outId + 0.5) / 32.0);
    }`;

  const SPEC = { 7: 0.9, 17: 1.0, 16: 0.7, 12: 0.25, 21: 0.35, 19: 0.45, 3: 0.12, 13: 0.1, 6: 0.15, 22: 0.06 };
  // material factory
  E.mat = function (o) {
    o = o || {};
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        uColor: { value: new THREE.Color(o.color !== undefined ? o.color : 0xffffff) },
        uEmissive: { value: new THREE.Color(o.emissive !== undefined ? o.emissive : 0x000000) },
        uId: { value: o.id !== undefined ? o.id : ID.BODY },
        uFlash: { value: 0 },
        uRim: { value: o.rim !== undefined ? o.rim : 0.0 },
        uUnlit: { value: o.unlit ? 1 : 0 },
        uNoFog: { value: o.noFog ? 1 : 0 },
        uFarGrass: { value: o.farGrass || 0 },
        uSpec: { value: o.spec !== undefined ? o.spec : SPEC[o.id !== undefined ? o.id : ID.BODY] || 0.04 },
      }, LU),
      vertexShader: UBER_V, fragmentShader: UBER_F,
      vertexColors: !!o.vertexColors,
      side: o.side || THREE.FrontSide,
    });
    return m;
  };

  // ---------- post pipeline ----------
  const ASCII_F = `
    uniform sampler2D tScene; uniform sampler2D tAtlas;
    uniform vec2 uRes; uniform vec2 uCell; uniform float uTime;
    uniform vec4 uSet[32]; uniform vec4 uSet2[32]; uniform vec4 uSet3[32];
    varying vec2 vUv;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float lum(vec3 c) { return max(max(c.r, c.g), c.b) * 0.55 + dot(c, vec3(0.299, 0.587, 0.114)) * 0.45; }
    int idAt(vec2 cell) { return int(texture2D(tScene, (cell + 0.5) * uCell / uRes).a * 32.0); }
    float actorAt(vec2 cell) { return uSet2[idAt(cell)].w; }
    void main() {
      vec2 fc = gl_FragCoord.xy;
      vec2 cell = floor(fc / uCell);
      vec2 cuv = fract(fc / uCell);
      vec2 cc = (cell + 0.5) * uCell / uRes;
      vec4 cs = texture2D(tScene, cc);
      int id = int(cs.a * 32.0);
      bool actor = uSet2[id].w > 0.5;
      vec4 px = texture2D(tScene, fc / uRes);
      int pid = int(px.a * 32.0);
      vec3 raw = px.rgb;
      // raw sets (grass strokes) are decided per pixel so blades stay crisp lines;
      // around characters the grass is darkened into a halo so silhouettes read
      if (!actor && uSet[pid].x > 0.5 && uSet[pid].x < 1.5) {
        float halo = max(max(actorAt(cell + vec2(1.0, 0.0)), actorAt(cell - vec2(1.0, 0.0))), max(actorAt(cell + vec2(0.0, 1.0)), actorAt(cell - vec2(0.0, 1.0))));
        gl_FragColor = vec4(raw * uSet[pid].y * (1.0 - 0.8 * halo), 1.0); return;
      }
      if (uSet[id].x > 0.5 && uSet[id].x < 1.5) id = 1;
      vec4 S = uSet[id]; vec4 S2 = uSet2[id]; vec4 S3 = uSet3[id];
      if (S.x > 1.5) { gl_FragColor = vec4(raw * 0.25, 1.0); return; }
      vec2 q = uCell / uRes * 0.3;
      vec3 c = (cs.rgb * 2.0 + texture2D(tScene, cc + vec2(q.x, q.y)).rgb + texture2D(tScene, cc + vec2(-q.x, q.y)).rgb
              + texture2D(tScene, cc + vec2(q.x, -q.y)).rgb + texture2D(tScene, cc + vec2(-q.x, -q.y)).rgb) / 6.0;
      float v = clamp(lum(c) * S.y, 0.0, 1.0);
      v = pow(v, 0.8);
      float fl = S2.z > 0.0 ? floor(uTime * S2.z) : 0.0;
      float jit = actor ? S3.x : 0.16;
      v += (h21(cell + fl * vec2(1.7, 9.2)) - 0.5) * jit * smoothstep(0.03, 0.2, v);
      if (actor) v = max(v, 0.28);
      v = clamp(v, 0.0, 0.999);
      float idx = floor(v * 16.0);
      // woven patterns: mail checker, plate bands, scale rows
      if (S3.y > 0.5 && S3.y < 1.5) idx -= mod(cell.x + cell.y, 2.0) * 2.0;
      if (S3.y > 1.5 && S3.y < 2.5) idx -= mod(cell.y, 3.0) < 0.5 ? 3.0 : 0.0;
      if (S3.y > 2.5) idx -= mod(cell.x + floor(cell.y * 0.5) * 1.0, 2.0) * 2.0;
      idx = clamp(idx, actor ? 2.0 : 0.0, 15.0);
      float row = float(id);
      float edgeBoost = 0.0;
      if (actor) {
        float mL = actorAt(cell + vec2(-1.0, 0.0)), mR = actorAt(cell + vec2(1.0, 0.0));
        float mU = actorAt(cell + vec2(0.0, 1.0)), mD = actorAt(cell + vec2(0.0, -1.0));
        if (mL + mR + mU + mD < 3.5) {
          vec2 g = vec2(mR - mL, mU - mD);
          row = 32.0;
          if (dot(g, g) < 0.1) idx = 4.0;
          else idx = mod(floor(atan(g.y, g.x) / 3.14159265 * 4.0 + 0.5), 4.0);
          edgeBoost = 1.0;
        }
      } else if (S.w > 0.5 && idx > 0.5) {
        float mL = idAt(cell + vec2(-1.0, 0.0)) == id ? 1.0 : 0.0;
        float mR = idAt(cell + vec2(1.0, 0.0)) == id ? 1.0 : 0.0;
        float mU = idAt(cell + vec2(0.0, 1.0)) == id ? 1.0 : 0.0;
        float mD = idAt(cell + vec2(0.0, -1.0)) == id ? 1.0 : 0.0;
        if (mL + mR + mU + mD < 3.5) {
          vec2 g = vec2(mR - mL, mU - mD);
          row = 32.0;
          if (dot(g, g) < 0.1) idx = 4.0;
          else idx = mod(floor(atan(g.y, g.x) / 3.14159265 * 4.0 + 0.5), 4.0);
          v = max(v, 0.55);
        }
      }
      float gm = texture2D(tAtlas, vec2((idx + cuv.x) / 16.0, (32.0 - row + cuv.y) / 33.0)).r;
      float mx = max(max(c.r, c.g), c.b);
      vec3 hue = c / max(mx, 0.03);
      vec3 tint = mix(hue, vec3(1.0), S2.y * v + edgeBoost * 0.35);
      vec3 gcol = tint * (0.18 + v * 1.05 + edgeBoost * 0.45) * S2.x;
      vec3 under = actor ? c * S.z : c * S.z;
      gl_FragColor = vec4(under + gm * gcol, 1.0);
    }`;
  const QUAD_V = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BRIGHT_F = `uniform sampler2D tIn; varying vec2 vUv; uniform vec2 uTexel;
    void main() { vec3 c = vec3(0.0);
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) c += texture2D(tIn, vUv + vec2(float(x), float(y)) * uTexel).rgb;
      c /= 9.0; gl_FragColor = vec4(max(c - 0.22, 0.0) * 1.4, 1.0); }`;
  const BLUR_F = `uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vUv;
    void main() { vec3 c = texture2D(tIn, vUv).rgb * 0.227;
      c += texture2D(tIn, vUv + uDir * 1.38).rgb * 0.316; c += texture2D(tIn, vUv - uDir * 1.38).rgb * 0.316;
      c += texture2D(tIn, vUv + uDir * 3.23).rgb * 0.07; c += texture2D(tIn, vUv - uDir * 3.23).rgb * 0.07;
      gl_FragColor = vec4(c, 1.0); }`;
  const COMP_F = `uniform sampler2D tA; uniform sampler2D tB; uniform float uBloom; uniform float uHurt; uniform float uTime; uniform vec2 uRes; uniform float uFadeW;
    varying vec2 vUv;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 a = texture2D(tA, vUv).rgb; vec3 b = texture2D(tB, vUv).rgb;
      vec3 c = a + b * uBloom;
      vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
      float vig = smoothstep(1.15, 0.25, length(d));
      c *= mix(0.55, 1.0, vig);
      float edge = smoothstep(0.3, 0.95, length(vUv - 0.5) * 1.4);
      c = mix(c, c * 0.4 + vec3(0.5, 0.0, 0.0) * edge, uHurt * edge);
      c += (h21(vUv * uRes + uTime) - 0.5) * 0.025;
      c = mix(c, vec3(1.0), uFadeW);
      c *= 1.12;
      c = c / (1.0 + c * 0.18);
      float lu = dot(c, vec3(0.299, 0.587, 0.114));
      c += vec3(-0.008, 0.0, 0.02) * (1.0 - lu) + vec3(0.03, 0.014, -0.018) * lu;
      gl_FragColor = vec4(c, 1.0);
    }`;

  E.Renderer = function (canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.autoClear = true;
    this.r = r;
    this.atlas = buildAtlas();
    this.glyphPx = 9; this.quality = 2;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(quad); this.quad = quad;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const setA = SETS.map(s => new THREE.Vector4(s.mode, s.gain, s.under, s.edge));
    const setB = SETS.map(s => new THREE.Vector4(s.bright, s.white, s.flick, s.actor || 0));
    const setC = SETS.map(s => new THREE.Vector4(s.jit || 0.16, s.pat || 0, 0, 0));
    this.setA = setA;
    this.asciiMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tAtlas: { value: this.atlas }, uRes: { value: new THREE.Vector2() }, uCell: { value: new THREE.Vector2() },
        uTime: LU.uTime, uSet: { value: setA }, uSet2: { value: setB }, uSet3: { value: setC } },
      vertexShader: QUAD_V, fragmentShader: ASCII_F, depthTest: false, depthWrite: false,
    });
    this.brightMat = new THREE.ShaderMaterial({ uniforms: { tIn: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: QUAD_V, fragmentShader: BRIGHT_F, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: { tIn: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: QUAD_V, fragmentShader: BLUR_F, depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({ uniforms: { tA: { value: null }, tB: { value: null }, uBloom: { value: 1.1 }, uHurt: { value: 0 }, uTime: LU.uTime, uRes: { value: new THREE.Vector2() }, uFadeW: { value: 0 } },
      vertexShader: QUAD_V, fragmentShader: COMP_F, depthTest: false, depthWrite: false });
    this.rts = null;
    this.resize();
  };
  E.Renderer.prototype.setPureGrass = function (on) { this.setA[ID.GRASS].x = on ? 0 : 1; this.setA[ID.GRASS].y = on ? 2.4 : 1.95; this.setA[ID.GRASS].z = on ? 0.15 : 0; };
  E.Renderer.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][this.quality]);
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setPixelRatio(dpr); this.r.setSize(w, h, false);
    const W = Math.floor(w * dpr), H = Math.floor(h * dpr);
    this.W = W; this.H = H; this.aspect = w / h;
    const mk = (ww, hh, nearest) => new THREE.WebGLRenderTarget(ww, hh, {
      minFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter, magFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter,
      depthBuffer: !!nearest, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
    });
    if (this.rts) Object.values(this.rts).forEach(t => t.dispose());
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    this.rts = { scene: mk(W, H, true), ascii: mk(W, H, false), b1: mk(bw, bh, false), b2: mk(bw, bh, false) };
    const cw = Math.round(this.glyphPx * dpr * 0.62), ch = Math.round(this.glyphPx * dpr);
    this.cell = [Math.max(3, cw), Math.max(5, ch)];
    this.asciiMat.uniforms.uRes.value.set(W, H);
    this.asciiMat.uniforms.uCell.value.set(this.cell[0], this.cell[1]);
    this.brightMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.compMat.uniforms.uRes.value.set(W, H);
  };
  E.Renderer.prototype.pass = function (mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.quadScene, this.quadCam);
  };
  E.Renderer.prototype.setShadows = function (size) {
    if (this.shadowRT) { this.shadowRT.dispose(); this.shadowRT = null; }
    if (!size) { LU.uShadowOn.value = 0; return; }
    this.shadowRT = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.shadowCam = this.shadowCam || new THREE.OrthographicCamera(-30, 30, 30, -30, 1, 220);
    this.depthMat = this.depthMat || new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    LU.uShadowTexel.value.set(1 / size, 1 / size);
  };
  // render the moon's depth view around `focus`; objects on layer 1 (ground, grass, effects) don't cast
  E.Renderer.prototype.renderShadow = function (scene, focus, half) {
    if (!this.shadowRT) { LU.uShadowOn.value = 0; return; }
    const C = this.shadowCam, size = this.shadowRT.width, texel = half * 2 / size;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    C.left = -half; C.right = half; C.top = half; C.bottom = -half; C.updateProjectionMatrix();
    const d = LU.uMoonDir.value;
    C.position.set(fx + d.x * 100, focus.y + d.y * 100, fz + d.z * 100); C.up.set(0, 1, 0); C.lookAt(fx, focus.y, fz);
    C.updateMatrixWorld(); C.layers.set(0);
    // the game's own shader writes packed depth here, so skinned and instanced meshes pose correctly
    LU.uDepthPass.value = 1; LU.uShadowOn.value = 0;
    this.r.setRenderTarget(this.shadowRT); this.r.setClearColor(0xffffff, 1); this.r.clear();
    this.r.render(scene, C);
    LU.uDepthPass.value = 0;
    LU.uShadowMat.value.multiplyMatrices(C.projectionMatrix, C.matrixWorldInverse);
    LU.uShadowMap.value = this.shadowRT.texture; LU.uShadowOn.value = 1;
  };
  E.Renderer.prototype.render = function (scene, camera, fx) {
    const r = this.r, T = this.rts;
    LU.uCam.value.copy(camera.position);
    camera.layers.enable(1);
    if (fx && fx.shadowFocus) this.renderShadow(scene, fx.shadowFocus, fx.shadowHalf || 30); else LU.uShadowOn.value = 0;
    r.setRenderTarget(T.scene); r.setClearColor(0x000000, 0); r.clear();
    r.render(scene, camera);
    this.asciiMat.uniforms.tScene.value = T.scene.texture;
    this.pass(this.asciiMat, T.ascii);
    this.brightMat.uniforms.tIn.value = T.ascii.texture; this.pass(this.brightMat, T.b1);
    const bw = T.b1.width, bh = T.b1.height;
    this.blurMat.uniforms.tIn.value = T.b1.texture; this.blurMat.uniforms.uDir.value.set(1 / bw, 0); this.pass(this.blurMat, T.b2);
    this.blurMat.uniforms.tIn.value = T.b2.texture; this.blurMat.uniforms.uDir.value.set(0, 1 / bh); this.pass(this.blurMat, T.b1);
    this.blurMat.uniforms.tIn.value = T.b1.texture; this.blurMat.uniforms.uDir.value.set(2 / bw, 0); this.pass(this.blurMat, T.b2);
    this.blurMat.uniforms.tIn.value = T.b2.texture; this.blurMat.uniforms.uDir.value.set(0, 2 / bh); this.pass(this.blurMat, T.b1);
    const cu = this.compMat.uniforms;
    cu.tA.value = T.ascii.texture; cu.tB.value = T.b1.texture;
    cu.uHurt.value = fx ? fx.hurt : 0; cu.uFadeW.value = fx ? fx.white : 0;
    this.pass(this.compMat, null);
  };

  // ---------- light manager: picks the nearest MAXL dynamic lights ----------
  E.Lights = function () { this.list = []; };
  E.Lights.prototype.add = function (x, y, z, color, radius, flicker) {
    const l = { p: new THREE.Vector3(x, y, z), c: new THREE.Color(color), base: new THREE.Color(color), r: radius, flicker: flicker || 0, on: true, seed: Math.random() * 100 };
    this.list.push(l); return l;
  };
  E.Lights.prototype.remove = function (l) { const i = this.list.indexOf(l); if (i >= 0) this.list.splice(i, 1); };
  E.Lights.prototype.update = function (cx, cz, t) {
    const arr = this.list.filter(l => l.on);
    for (const l of arr) l._d = (l.p.x - cx) ** 2 + (l.p.z - cz) ** 2 - l.r * l.r;
    arr.sort((a, b) => a._d - b._d);
    const n = Math.min(MAXL, arr.length);
    for (let i = 0; i < n; i++) {
      const l = arr[i];
      let f = 1;
      if (l.flicker) f = 1 - l.flicker * (0.5 + 0.3 * Math.sin(t * 13 + l.seed) + 0.2 * Math.sin(t * 31 + l.seed * 3)) * 0.6;
      LU.uLP.value[i].set(l.p.x, l.p.y, l.p.z, l.r);
      LU.uLC.value[i].copy(l.c).multiplyScalar(f);
    }
    LU.uLN.value = n;
  };

  // ---------- small helpers ----------
  E.rand = function (seed) { let s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; };
  E.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  E.lerp = (a, b, t) => a + (b - a) * t;
  E.angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  E.ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
})();
