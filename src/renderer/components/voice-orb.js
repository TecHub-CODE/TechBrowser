// The orb renders only while the dialog is open and uses the recorder's existing audio level.
function mountVoiceOrb(stage, dialog) {
  if (window.performanceMode || matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => {};

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 288;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false });
  if (!gl) return () => {};

  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const shaders = [];
  let frame;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    canvas.removeEventListener('webglcontextlost', dispose);
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    canvas.remove();
    stage.classList.remove('has-orb-canvas');
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  function attach(type, source) {
    const shader = gl.createShader(type);
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Orb shader failed');
    gl.attachShader(program, shader);
  }

  try {
    attach(gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 point;
      void main() {
        point = position;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    attach(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 point;
      uniform float phase, energy, working;

      void main() {
        float angle = atan(point.y, point.x + 0.0001);
        float radius = length(point);
        float flow = angle + phase;
        float wave = sin(flow * 3.0 + 0.8 * sin(flow * 2.0 - phase));
        float ripple = sin(angle * 7.0 - phase * 3.0);
        float contour = 0.64 + wave * (0.035 + 0.06 * energy) + ripple * (0.007 + 0.02 * energy);
        float offset = radius - contour;
        float ribbon = exp(-abs(offset) * (16.0 - 4.5 * energy));
        float edge = exp(-abs(offset + 0.04 * sin(flow * 4.0)) * 42.0);
        float highlight = pow(0.5 + 0.5 * cos(angle - phase * (1.4 + working)), 5.0);
        vec3 violet = vec3(0.53, 0.40, 0.92);
        vec3 blue = vec3(0.34, 0.75, 0.92);
        vec3 tint = mix(violet, blue, 0.5 + 0.5 * cos(flow + wave * 0.32));
        float opacity = clamp(ribbon * (0.62 + 0.26 * highlight) + edge * 0.22, 0.0, 1.0);
        vec3 color = mix(tint, vec3(0.90, 0.94, 1.0), edge * highlight * 0.75);
        gl_FragColor = vec4(color * opacity, opacity);
      }
    `);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Orb program failed');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const phaseLocation = gl.getUniformLocation(program, 'phase');
    const energyLocation = gl.getUniformLocation(program, 'energy');
    const workingLocation = gl.getUniformLocation(program, 'working');
    stage.prepend(canvas);
    stage.classList.add('has-orb-canvas');
    canvas.addEventListener('webglcontextlost', dispose, { once: true });

    let last = performance.now();
    let rotation = 0;
    let energy = 0;
    function tick(now) {
      if (!dialog.open || gl.isContextLost()) return;
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / 32) return;
      const working = dialog.dataset.state === 'processing';
      const target = dialog.dataset.state === 'listening'
        ? Number(stage.style.getPropertyValue('--voice-level'))
        : 0;
      energy += (target - energy) * 0.24;
      rotation = (rotation + Math.min((now - last) / 1000, 0.08) *
        (working ? 1.25 : 0.36 + energy * 1.8)) % (Math.PI * 20);
      last = now;
      gl.uniform1f(phaseLocation, rotation);
      gl.uniform1f(energyLocation, energy);
      gl.uniform1f(workingLocation, Number(working));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    frame = requestAnimationFrame(tick);
    return dispose;
  } catch {
    dispose();
    return () => {};
  }
}
