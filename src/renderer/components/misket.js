// TechHub Misket: a lightweight adaptation of the user-supplied LiveOrb concept.
// Only the editor animates. Saved avatars are 256px PNGs, never live canvases.
let misketEditor = null;
function misketSvg(options) {
  const color = /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : '#7c5cff';
  const eye = /^#[0-9a-f]{6}$/i.test(options.eyeColor) ? options.eyeColor : '#fafafa';
  const body =
    options.variant === 'white' ? '#f4f4f5' : options.variant === 'black' ? '#18181b' : color;
  const ink =
    options.variant === 'white' || options.variant === 'aurora'
      ? '#15151a'
      : options.variant === 'black'
        ? '#f4f4f5'
        : eye;
  const aurora = options.variant === 'aurora';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="TechHub Misket"><defs><linearGradient id="misketWash" x2="1" y2="1"><stop stop-color="#7c6af7"/><stop offset=".5" stop-color="#7dd3c7"/><stop offset="1" stop-color="#e8b4d4"/></linearGradient><radialGradient id="misketGlow"><stop stop-color="#c3a5ff" stop-opacity=".9"/><stop offset="1" stop-color="#7c6af7" stop-opacity="0"/></radialGradient><clipPath id="misketClip"><circle cx="128" cy="128" r="120"/></clipPath></defs><circle cx="128" cy="128" r="120" fill="${aurora ? 'url(#misketWash)' : body}"/>${aurora ? '<g clip-path="url(#misketClip)"><ellipse cx="70" cy="75" rx="125" ry="85" fill="url(#misketGlow)"/><ellipse cx="203" cy="185" rx="110" ry="80" fill="url(#misketGlow)"/></g>' : ''}<g class="misket-gaze"><g class="misket-eyes" fill="${ink}"><rect x="88" y="100" width="13" height="44" rx="6.5"/><rect x="155" y="100" width="13" height="44" rx="6.5"/></g></g></svg>`;
}
function destroyMisket() {
  if (!misketEditor) return;
  misketEditor.gl?.destroy();
  misketEditor.abort.abort();
  misketEditor.modal.remove();
  misketEditor = null;
}
function maybeOfferMisket() {
  if (!cu || cu.avatar) return;
  const seen = Array.isArray(cfg.misketPrompted) ? cfg.misketPrompted : [];
  if (seen.includes(cu.uid)) return;
  cfg.misketPrompted = [...seen.slice(-99), cu.uid];
  saveCfg();
  openMisket(true);
}
function openMisket(firstRun = false) {
  if (!cu) return;
  closeAllModals();
  const uid = cu.uid;
  let draft = {
    variant: 'white',
    color: '#7c5cff',
    eyeColor: '#fafafa',
    motion: true,
    ...cu.misket,
  };
  const abort = new AbortController();
  const modal = document.createElement('div');
  modal.id = 'misketEditor';
  modal.className = 'modal misket-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'misketTitle');
  modal.innerHTML = `<div class="mhead"><div><h2 id="misketTitle">${firstRun ? 'Profilini oluştur' : 'Profil görünümü'}</h2></div><button type="button" class="mclose" id="misketClose" aria-label="Kapat">×</button></div><div class="misket-body"><div class="misket-stage"><div class="misket-preview"></div></div><div class="misket-controls"><label class="misket-label" for="misketMaterial">Görünüm</label><select id="misketMaterial"><option value="white">Porselen</option><option value="black">Gece</option><option value="custom">Kendi rengin</option><option value="aurora">Aurora</option></select><div class="misket-colors"><label>Gövde<input id="misketColor" type="color" /></label><label>Gözler<input id="misketEye" type="color" /></label></div><label class="misket-motion"><input id="misketMotion" type="checkbox" />Canlı önizleme</label><p class="misket-hint">Yalnızca bu önizlemede hareket eder.</p><p class="misket-local">Bu cihazdaki hesabına kaydedilir.</p></div></div><p id="misketError" role="alert"></p><div class="misket-actions"><button id="misketLater">${firstRun ? 'Şimdilik geç' : 'Vazgeç'}</button><button id="misketSave">Kaydet</button></div>`;
  document.body.append(modal);
  misketEditor = { modal, abort };
  const $ = (selector) => modal.querySelector(selector);
  const preview = $('.misket-preview');
  preview.innerHTML =
    '<div class="misket-fallback"></div><canvas aria-label="Profil önizlemesi"></canvas>';
  const fallback = preview.querySelector('.misket-fallback');
  let engine = null,
    attemptedGL = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  function motion() {
    modal.classList.toggle(
      'misket-live',
      draft.motion && !reduce.matches && !document.hidden && document.hasFocus(),
    );
  }
  function render() {
    fallback.innerHTML = misketSvg(draft);
    if (!attemptedGL) {
      attemptedGL = true;
      engine = createMisketGL(preview.querySelector('canvas'), draft, (ready) =>
        preview.classList.toggle('has-gl', ready),
      );
      misketEditor.gl = engine;
    } else engine?.setOptions(draft);
    $('#misketMaterial').value = draft.variant;
    $('#misketColor').value = draft.color;
    $('#misketEye').value = draft.eyeColor;
    $('#misketMotion').checked = draft.motion;
    $('.misket-colors').hidden = draft.variant !== 'custom';
    motion();
  }
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });
  on($('#misketMaterial'), 'change', (e) => {
    draft.variant = e.target.value;
    render();
  });
  on($('#misketColor'), 'input', (e) => {
    draft.color = e.target.value;
    render();
  });
  on($('#misketEye'), 'input', (e) => {
    draft.eyeColor = e.target.value;
    render();
  });
  on($('#misketMotion'), 'change', (e) => {
    draft.motion = e.target.checked;
    render();
  });
  on(modal, 'pointermove', (e) => {
    if (!modal.classList.contains('misket-live')) return;
    const box = preview.getBoundingClientRect();
    const x = Math.max(-18, Math.min(18, (e.clientX - box.x - box.width / 2) * 0.08));
    const y = Math.max(-10, Math.min(10, (e.clientY - box.y - box.height / 2) * 0.06));
    engine?.setLook(x / 24, -y / 20);
    fallback.querySelector('.misket-gaze').setAttribute('transform', `translate(${x} ${y})`);
  });
  on(modal, 'pointerleave', () => {
    engine?.setLook(0, 0.08);
    fallback.querySelector('.misket-gaze')?.removeAttribute('transform');
  });
  on(document, 'visibilitychange', motion);
  on(window, 'blur', motion);
  on(window, 'focus', motion);
  on(reduce, 'change', motion);
  const dismiss = () => {
    closeAllModals();
    document.getElementById('accountBtn').focus();
  };
  on($('#misketClose'), 'click', dismiss);
  on($('#misketLater'), 'click', dismiss);
  on(modal, 'keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
    }
    if (e.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button,input,select')].filter(
        (el) => !el.disabled && el.getClientRects().length,
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  on($('#misketSave'), 'click', async () => {
    const button = $('#misketSave');
    button.disabled = true;
    $('#misketError').textContent = '';
    const saved = { ...draft };
    try {
      let avatar = engine?.capture();
      if (!avatar) {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([misketSvg(saved)], { type: 'image/svg+xml' }));
        try {
          image.src = url;
          await image.decode();
        } finally {
          URL.revokeObjectURL(url);
        }
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        canvas.getContext('2d').drawImage(image, 0, 0, 256, 256);
        avatar = canvas.toDataURL('image/png');
        canvas.width = canvas.height = 0;
      }
      const result = await window.electronAPI.invoke('profile-save-avatar', {
        uid,
        avatar,
        misket: saved,
      });
      if (!result?.success) throw Error(result?.error || 'Profil kaydedilemedi.');
      if (cu?.uid !== uid) return;
      cu = result.user;
      updateAccountUI();
      if (misketEditor?.modal === modal) {
        closeAllModals();
        openAccountModal();
        toast('Misket profilinde hazır.');
      }
    } catch (error) {
      if (modal.isConnected) $('#misketError').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  render();
  openModal('misketEditor');
  $('#misketMaterial').focus();
  motion();
}
document.getElementById('editMisket').addEventListener('click', () => openMisket());
