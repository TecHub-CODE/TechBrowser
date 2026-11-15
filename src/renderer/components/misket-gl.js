// Shaders adapted from the LiveOrb component supplied by the user.
const MISKET_VERT =
  '\r\nattribute vec2 a_position;\r\nvoid main() {\r\n  gl_Position = vec4(a_position, 0.0, 1.0);\r\n}\r\n';
const MISKET_FRAG =
  '\r\nprecision highp float;\r\n\r\nuniform vec2 u_resolution;\r\nuniform float u_time;\r\nuniform float u_speed;\r\nuniform vec2 u_look;\r\nuniform float u_blink;\r\nuniform float u_mode;\r\nuniform vec3 u_body;\r\nuniform vec3 u_eye;\r\nuniform vec3 u_c1;\r\nuniform vec3 u_c2;\r\nuniform vec3 u_c3;\r\n\r\nfloat hash(vec2 p) {\r\n  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);\r\n}\r\n\r\nfloat noise(vec2 p) {\r\n  vec2 i = floor(p);\r\n  vec2 f = fract(p);\r\n  float a = hash(i);\r\n  float b = hash(i + vec2(1.0, 0.0));\r\n  float c = hash(i + vec2(0.0, 1.0));\r\n  float d = hash(i + vec2(1.0, 1.0));\r\n  vec2 u = f * f * (3.0 - 2.0 * f);\r\n  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;\r\n}\r\n\r\nfloat fbm(vec2 p) {\r\n  float v = 0.0;\r\n  float a = 0.5;\r\n  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);\r\n  for (int i = 0; i < 5; i++) {\r\n    v += a * noise(p);\r\n    p = m * p;\r\n    a *= 0.5;\r\n  }\r\n  return v;\r\n}\r\n\r\nvec3 orient(vec3 p, vec2 look) {\r\n  float yaw = look.x * 0.92;\r\n  float pitch = -look.y * 0.78;\r\n  float cy = cos(yaw);\r\n  float sy = sin(yaw);\r\n  float cp = cos(pitch);\r\n  float sp = sin(pitch);\r\n  vec3 q = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);\r\n  return vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);\r\n}\r\n\r\nfloat eyeMask(vec3 n, vec3 e, vec3 right, vec3 up, float halfH, float rad) {\r\n  float facing = dot(n, e);\r\n  float x = dot(n, right) - dot(e, right);\r\n  float y = dot(n, up) - dot(e, up);\r\n  y -= clamp(y, -halfH, halfH);\r\n  float d = length(vec2(x, y)) - rad;\r\n  float fill = 1.0 - smoothstep(-0.01, 0.01, d);\r\n  return fill * smoothstep(0.12, 0.32, facing);\r\n}\r\n\r\nvec3 wash(vec3 n, float t) {\r\n  vec2 q = n.xy * 2.2 + n.z * 0.85;\r\n  vec2 w1 = vec2(\r\n    fbm(q * 1.4 + vec2(t * 0.22, t * 0.18)),\r\n    fbm(q * 1.4 + vec2(-t * 0.16, t * 0.24) + 4.1)\r\n  );\r\n  q += (w1 - 0.5) * 0.72;\r\n  float f = fbm(q * 2.1 + vec2(0.0, t * 0.12));\r\n  float g = fbm(q * 4.6 - vec2(t * 0.2, 0.0));\r\n  vec3 col = mix(u_c1, u_c2, smoothstep(0.28, 0.72, f));\r\n  return mix(col, u_c3, pow(smoothstep(0.42, 0.9, g), 1.4));\r\n}\r\n\r\nvoid main() {\r\n  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;\r\n  float aspect = u_resolution.x / max(u_resolution.y, 1.0);\r\n  uv.x *= aspect;\r\n\r\n  float radius = 0.94;\r\n  vec2 p = uv / radius;\r\n  float r2 = dot(p, p);\r\n  float edge = 1.0 - smoothstep(0.985, 1.012, sqrt(max(r2, 0.0)));\r\n  if (edge <= 0.001) {\r\n    gl_FragColor = vec4(0.0);\r\n    return;\r\n  }\r\n\r\n  float z = sqrt(max(1.0 - r2, 0.0));\r\n  vec3 n = normalize(vec3(p, z));\r\n\r\n  vec2 look = u_look;\r\n  float lm = length(look);\r\n  if (lm > 1.0) look /= lm;\r\n\r\n  vec3 right = orient(vec3(1.0, 0.0, 0.0), look);\r\n  vec3 up = orient(vec3(0.0, 1.0, 0.0), look);\r\n  vec3 eL = orient(normalize(vec3(-0.32, 0.08, 1.0)), look);\r\n  vec3 eR = orient(normalize(vec3(0.32, 0.08, 1.0)), look);\r\n\r\n  float halfH = mix(0.128, 0.012, u_blink);\r\n  float rad = mix(0.054, 0.062, u_blink);\r\n  float eyes = max(\r\n    eyeMask(n, eL, right, up, halfH, rad),\r\n    eyeMask(n, eR, right, up, halfH, rad)\r\n  );\r\n\r\n  vec3 body = u_mode > 0.5 ? wash(n, u_time * u_speed) : u_body;\r\n  vec3 col = mix(body, u_eye, clamp(eyes, 0.0, 1.0));\r\n\r\n  gl_FragColor = vec4(clamp(col, 0.0, 1.0), edge);\r\n}\r\n';
// One low-power context, a fixed 256px backing buffer, at most 24 draws/second.
function createMisketGL(canvas, initial, onReady) {
  if (window.performanceMode) return null;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  canvas.width = canvas.height = 256;
  let options = { ...initial },
    program = null,
    buffer = null,
    shaders = [],
    uniforms = {},
    timer = 0,
    dead = false,
    lost = false,
    onScreen = true,
    active = true,
    time = 0,
    last = performance.now(),
    frames = 0;
  const look = [0, 0.08],
    target = [0, 0.08];
  const abort = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listen = (obj, event, fn) => obj.addEventListener(event, fn, { signal: abort.signal });
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  function release() {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach((s) => gl.deleteShader(s));
    buffer = program = null;
    shaders = [];
  }
  function init() {
    release();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, MISKET_VERT],
      [gl.FRAGMENT_SHADER, MISKET_FRAG],
    ]) {
      const shader = gl.createShader(type);
      if (!shader) throw Error('Shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error('Shader compilation failed');
    }
    program = gl.createProgram();
    shaders.forEach((s) => gl.attachShader(program, s));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Shader linking failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    for (const name of [
      'resolution',
      'time',
      'speed',
      'look',
      'blink',
      'mode',
      'body',
      'eye',
      'c1',
      'c2',
      'c3',
    ])
      uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
    gl.viewport(0, 0, 256, 256);
    onReady(true);
  }
  const moving = () =>
    !dead &&
    !lost &&
    active &&
    onScreen &&
    options.motion &&
    !reduced.matches &&
    !document.hidden &&
    document.hasFocus();
  function stop() {
    clearTimeout(timer);
    timer = 0;
  }
  function draw(snapshot = false) {
    if (dead || lost || !program) return;
    const now = performance.now();
    if (moving()) time += Math.min(100, now - last) / 1000;
    last = now;
    const white = options.variant === 'white',
      black = options.variant === 'black',
      aurora = options.variant === 'aurora';
    const body = white ? '#f4f4f5' : black ? '#18181b' : options.color;
    const eye = white || aurora ? '#09090b' : black ? '#f4f4f5' : options.eyeColor;
    const stationary = snapshot || !moving();
    look[0] += (target[0] - look[0]) * 0.22;
    look[1] += (target[1] - look[1]) * 0.22;
    gl.useProgram(program);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.resolution, 256, 256);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.speed, 0.55);
    gl.uniform2f(uniforms.look, stationary ? 0 : look[0], stationary ? 0.08 : look[1]);
    const phase = time % 5.2;
    gl.uniform1f(
      uniforms.blink,
      stationary ? 0 : phase > 5 ? Math.max(0, 1 - Math.abs(phase - 5.1) / 0.1) : 0,
    );
    gl.uniform1f(uniforms.mode, aurora ? 1 : 0);
    gl.uniform3fv(uniforms.body, rgb(body));
    gl.uniform3fv(uniforms.eye, rgb(eye));
    ['#7c6af7', '#7dd3c7', '#e8b4d4'].forEach((color, i) =>
      gl.uniform3fv(uniforms['c' + (i + 1)], rgb(color)),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    frames++;
  }
  function tick() {
    timer = 0;
    if (!moving()) return;
    draw();
    timer = setTimeout(tick, 1000 / 24);
  }
  function sync() {
    stop();
    last = performance.now();
    if (!dead && !lost) {
      draw();
      if (moving()) timer = setTimeout(tick, 1000 / 24);
    }
  }
  listen(document, 'visibilitychange', sync);
  listen(window, 'focus', sync);
  listen(window, 'blur', sync);
  listen(reduced, 'change', sync);
  listen(canvas, 'webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    stop();
    onReady(false);
  });
  listen(canvas, 'webglcontextrestored', () => {
    if (dead) return;
    lost = false;
    try {
      init();
      sync();
    } catch {
      release();
      onReady(false);
    }
  });
  const observer = new IntersectionObserver((entries) => {
    onScreen = entries[0]?.isIntersecting === true;
    sync();
  });
  observer.observe(canvas);
  try {
    init();
    sync();
  } catch {
    stop();
    abort.abort();
    observer.disconnect();
    release();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  return {
    setOptions(value) {
      options = { ...value };
      sync();
    },
    setLook(x, y) {
      target[0] = Math.max(-0.8, Math.min(0.8, x));
      target[1] = Math.max(-0.5, Math.min(0.5, y));
    },
    setActive(value) {
      active = value;
      sync();
    },
    capture() {
      if (dead || lost || !program) return null;
      draw(true);
      return canvas.toDataURL('image/png');
    },
    stats() {
      return { frames, scheduled: !!timer, width: canvas.width, height: canvas.height, lost };
    },
    destroy() {
      if (dead) return;
      dead = true;
      stop();
      abort.abort();
      observer.disconnect();
      release();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = canvas.height = 0;
      onReady(false);
    },
  };
}
