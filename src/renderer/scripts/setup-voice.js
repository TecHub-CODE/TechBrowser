(() => {
  const audio = new Audio();
  audio.id = 'setupVoiceAudio';
  audio.hidden = true;
  audio.preload = 'none';
  document.body.append(audio);
  const voices = new URL('../../installer/assets/voice/', location.href);
  const skipKey = 'tb_setup_voice_off';
  const controls = {
    termsScroll: 'TermsText', termsCheck: 'TermsCheck', termsAcceptBtn: 'TermsAccept',
    firstRunAdBlock: 'AdBlock', firstRunDefaultBrowser: 'DefaultBrowser',
    firstRunImport: 'Import', firstRunSkipSetup: 'Defaults', firstRunSave: 'Continue',
    firstRunOtherInput: 'OtherInput', firstRunSkipSurvey: 'Skip', firstRunFinish: 'Start',
  };
  const commonControls = {
    addr: 'Address', ntInput: 'SearchField', btnBack: 'Back', btnFwd: 'Forward',
    btnReload: 'Reload', aiBtn: 'Misket',
  };
  let currentPage;
  let greeting = false;
  let focusTimer;
  let enabled = localStorage.getItem(skipKey) !== '1';
  let utterance = 0;

  function stop() {
    utterance++;
    clearTimeout(focusTimer);
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    greeting = false;
  }
  window.stopBrowserVoice = stop;

  function play(clip, onEnd) {
    audio.onended = onEnd ?? null;
    audio.onerror = onEnd ?? null;
    audio.src = new URL('Browser' + clip + '.wav', voices).href;
    audio.play().catch(() => {
      if (audio.onended === onEnd) onEnd?.();
    });
  }

  function readFocus() {
    if (!enabled || greeting || !document.hasFocus() || document.querySelector('#voiceSearch[open]')) return;
    const field = document.activeElement;
    if (!currentPage) {
      readBrowserControl(field);
      return;
    }
    if (!currentPage.contains(field)) return;
    if (field.matches('[data-setup-voice]')) {
      play('Toggle');
      return;
    }
    const { themeChoice, accentChoice, searchChoice, source } = field.dataset;
    const value = themeChoice || accentChoice || searchChoice || source;
    const clip = controls[field.id] || (value && value.replace(/(^|-)([a-z])/g, (_, dash, letter) => letter.toUpperCase()));
    if (clip) play(clip);
  }

  function readBrowserControl(field) {
    stop();
    if (!field?.matches('button, input:not([type=hidden]), select, textarea, a[href], [role=button], [tabindex]')) return;
    const clip = commonControls[field.id] ||
      (field.matches('[data-voice-search]') ? 'VoiceSearch' : null) ||
      (field.title === 'Ayarlar' ? 'Settings' : null);
    if (clip) {
      play(clip);
      return;
    }
    const label = field.getAttribute('aria-label') ||
      field.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' ').trim() ||
      field.labels?.[0]?.textContent.trim() ||
      field.title ||
      field.getAttribute('placeholder') ||
      (field.id === 'addr' ? 'Adres çubuğu' : field.textContent.trim());
    if (!label) return;
    const state = field.matches('input[type=checkbox]') ? (field.checked ? ', açık.' : ', kapalı.')
      : field.getAttribute('aria-pressed') === 'true' ? ', seçili.' : '';
    const text = (label.replace(/\s+/g, ' ') + state).slice(0, 160);
    const request = utterance;
    focusTimer = setTimeout(async () => {
      try {
        const data = await window.electronAPI.invoke('voice-read', text);
        if (data && request === utterance && document.activeElement === field) {
          audio.src = 'data:audio/wav;base64,' + data;
          await audio.play();
        }
      } catch {}
    }, 110);
  }

  window.refreshSetupVoice = () => {
    if (document.getElementById('introOverlay')) return;
    const terms = document.getElementById('termsOverlay');
    const page = terms && getComputedStyle(terms).display !== 'none'
      ? terms
      : document.querySelector('.first-run-page.active');
    if (page === currentPage) return;
    stop();
    currentPage = page;
    if (!enabled || !page) return;
    greeting = true;
    page.querySelector('[data-setup-voice]')?.focus({ preventScroll: true });
    const clip = page === terms ? 'Terms' : page.id === 'firstRunSurvey' ? 'Survey' : 'Welcome';
    play(clip, () => {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        greeting = false;
        readFocus();
      }, 1000);
    });
  };

  for (const checkbox of document.querySelectorAll('[data-setup-voice]')) checkbox.checked = enabled;
  document.addEventListener('focusin', readFocus);
  window.addEventListener('blur', stop);
  window.addEventListener('focus', readFocus);
  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-setup-voice]')) return;
    enabled = event.target.checked;
    localStorage.setItem(skipKey, enabled ? '0' : '1');
    for (const checkbox of document.querySelectorAll('[data-setup-voice]')) checkbox.checked = enabled;
    stop();
    if (enabled) readFocus();
  });
})();
