(() => {
  const buttons = document.querySelectorAll('[data-voice-search]');
  const dialog = document.createElement('dialog');
  dialog.id = 'voiceSearch';
  dialog.setAttribute('aria-label', 'Sesli arama');
  dialog.innerHTML = `
    <div class="voice-body">
      <div class="voice-orb" aria-hidden="true"><span class="voice-emblem"><img src="../../assets/techhub-misket-badge.png" alt=""></span></div>
      <p class="voice-status" role="status"></p>
      <div class="voice-thinking" aria-hidden="true"><i></i><i></i><i></i></div>
    </div>`;
  document.body.append(dialog);
  const status = dialog.querySelector('.voice-status');
  const orb = dialog.querySelector('.voice-orb');
  let active;
  let processing = false;
  let disposeOrb;
  let closeTimer;

  function release(recording) {
    clearTimeout(recording.timer);
    if (recording.processor) recording.processor.onaudioprocess = null;
    recording.stream?.getTracks().forEach((track) => track.stop());
    recording.context?.close().catch(() => {});
  }

  function cue(context) {
    const start = context.currentTime;
    for (const [index, frequency] of [659.25, 987.77].entries()) {
      const tone = context.createOscillator();
      const envelope = context.createGain();
      const when = start + index * 0.075;
      tone.type = 'sine';
      tone.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, when);
      envelope.gain.exponentialRampToValueAtTime(0.09, when + 0.024);
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
      tone.connect(envelope).connect(context.destination);
      tone.start(when);
      tone.stop(when + 0.15);
    }
  }

  function wave(recording) {
    const bytes = new Uint8Array(44 + recording.length * 2);
    const view = new DataView(bytes.buffer);
    bytes.set([82, 73, 70, 70], 0);
    bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
    bytes.set([100, 97, 116, 97], 36);
    for (const [offset, value] of [[4, bytes.length - 8], [16, 16], [24, 16000], [28, 32000], [40, bytes.length - 44]])
      view.setUint32(offset, value, true);
    for (const [offset, value] of [[20, 1], [22, 1], [32, 2], [34, 16]])
      view.setUint16(offset, value, true);
    for (let i = 0; i < recording.length; i++)
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, recording.samples[i])) * 32767, true);
    return bytes;
  }

  async function finish(recording) {
    if (active !== recording || processing || dialog.dataset.state !== 'listening') return;
    release(recording);
    dialog.dataset.state = 'processing';
    status.textContent = 'Misket düşünüyor…';
    processing = true;
    try {
      if (!recording.heard || recording.length < 3200) throw Error('Konuşma algılanmadı.');
      const [text] = await Promise.all([
        window.electronAPI.invoke('voice-search-transcribe', wave(recording)),
        new Promise((resolve) => setTimeout(resolve, 420)),
      ]);
      if (active !== recording || !dialog.open) return;
      if (!text) throw Error('Aranacak metin bulunamadı.');
      dialog.close();
      doNavigate((SE[cfg.searchEngine] || SE.google).url + encodeInline(text));
    } catch {
      if (active !== recording || !dialog.open) return;
      showError('Anlayamadım. Mikrofon düğmesine basıp tekrar söyleyin.');
    } finally {
      processing = false;
    }
  }

  async function listen() {
    const recording = { samples: new Float32Array(16000 * 12), length: 0, voiced: 0, heard: false, lastVoice: 0 };
    active = recording;
    dialog.dataset.state = 'starting';
    orb.style.setProperty('--voice-level', '0');
    status.textContent = 'Mikrofon hazırlanıyor…';
    try {
      const context = new AudioContext({ sampleRate: 16000 });
      recording.context = context;
      await context.resume();
      if (active !== recording) return;
      if (!await window.electronAPI.invoke('voice-search-arm')) throw Error('Mikrofon başlatılamadı.');
      if (active !== recording) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      recording.stream = stream;
      if (active !== recording) { release(recording); return; }
      cue(context);
      await new Promise((resolve) => setTimeout(resolve, 270));
      if (active !== recording) return;
      const processor = context.createScriptProcessor(1024, 1, 1);
      recording.processor = processor;
      const silent = context.createGain();
      silent.gain.value = 0;
      context.createMediaStreamSource(stream).connect(processor).connect(silent).connect(context.destination);
      processor.onaudioprocess = (event) => {
        if (active !== recording) return;
        const input = event.inputBuffer.getChannelData(0);
        const samples = input.subarray(0, recording.samples.length - recording.length);
        recording.samples.set(samples, recording.length);
        recording.length += samples.length;
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const level = Math.sqrt(energy / samples.length);
        orb.style.setProperty('--voice-level', Math.min(level * 12, 1).toFixed(2));
        if (level > 0.009) {
          recording.voiced += samples.length;
          recording.heard = recording.voiced >= 2048;
          recording.lastVoice = recording.length;
        }
        if (recording.length === recording.samples.length ||
            (recording.heard && recording.length - recording.lastVoice > 20800)) finish(recording);
      };
      dialog.dataset.state = 'listening';
      status.textContent = 'Şimdi ne aramak istediğinizi söyleyin.';
      recording.timer = setTimeout(() => finish(recording), 12000);
    } catch {
      release(recording);
      if (active !== recording) return;
      showError('Mikrofona erişilemedi. Windows mikrofon izinlerini kontrol edin.');
    }
  }

  function showError(message) {
    dialog.dataset.state = 'error';
    status.textContent = message;
    closeTimer = setTimeout(() => dialog.close(), 4500);
  }

  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearTimeout(closeTimer);
    disposeOrb?.();
    disposeOrb = null;
    if (active) release(active);
    active = null;
  });
  window.addEventListener('blur', () => {
    if (dialog.open) dialog.close();
  });
  window.electronAPI?.invoke('voice-search-status').then((available) => {
    if (!available) return;
    for (const button of buttons) {
      button.hidden = false;
      button.addEventListener('click', () => {
        if (dialog.open || processing || document.getElementById('addr').readOnly) return;
        window.stopBrowserVoice?.();
        dialog.showModal();
        disposeOrb = mountVoiceOrb(orb, dialog);
        listen();
      });
    }
  }).catch(() => {});
})();
