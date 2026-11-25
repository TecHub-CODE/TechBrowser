// settings panel: rendering and its user actions.
function renderSettings() {
  document.getElementById('spBody').innerHTML =
    '<div class="spsec">TEMA</div><div class="theme-grid">' +
    Object.keys(THEMES)
      .map((k) => {
        var t = THEMES[k];
        return (
          '<button type="button" class="tcard ' +
          (ct === k && !cfg.customThemeEnabled ? 'active' : '') +
          '" aria-pressed="' +
          (ct === k && !cfg.customThemeEnabled) +
          '" data-action="theme" data-value="' +
          encodeInline(k) +
          '"><span class="theme-preview" style="--preview-bg:' +
          t.bg +
          ';--preview-surface:' +
          t.s +
          ';--preview-accent:' +
          t.ac +
          '"><span class="theme-preview-bar"></span><span class="theme-preview-search"></span><span class="theme-preview-line"></span></span><span class="tname">' +
          t.name +
          '</span><span class="tchk">' +
          ico('check') +
          '</span></button>'
        );
      })
      .join('') +
    '</div>' +
    renderThemeEditor() +
    '<div class="spsec">ARAMA MOTORU</div><div class="se-grid">' +
    Object.keys(SE)
      .map((k) => {
        var se = SE[k];
        return (
          '<div class="secard ' +
          (cfg.searchEngine === k ? 'active' : '') +
          '" data-action="search-engine" data-value="' +
          encodeInline(k) +
          '"><span class="se-ic">' +
          se.ic +
          '</span><span class="se-nm">' +
          se.name +
          '</span></div>'
        );
      })
      .join('') +
    '</div>' +
    '<div class="spsec">YAZI BOYUTU</div><div class="sld-wrap"><input class="sld" type="range" min="12" max="22" value="' +
    cfg.fontSize +
    '" data-input="font-size"><div class="sld-val" id="fsVal">' +
    cfg.fontSize +
    'px</div><div class="sld-lbl"><span>12px</span><span>22px</span></div></div>' +
    '<div class="spsec">BELLEK TASARRUF EŞİĞİ</div><div class="sld-wrap"><input class="sld" type="range" min="256" max="4096" step="256" value="' +
    cfg.ramLimit +
    '" data-input="memory-limit"><div class="ram-info-row"><span class="ram-alloc" id="ramAllocV">' +
    cfg.ramLimit +
    ' MB</span><span data-panel-style="panel-54">Sekme uyutma eşiği; kesin üst sınır değildir</span></div></div>' +
    '<div class="srow"><div class="sric">' +
    ico('bolt') +
    '</div><div class="srinf"><div class="srlbl">Performans Kipi</div><div class="srdesc" id="performanceModeDesc">' +
    (window.performanceModeConfigured !== window.performanceMode
      ? 'Değişiklik yeniden başlatınca uygulanacak'
      : window.performanceMode
        ? 'Etkin · grafik yükü ve yoğun animasyonlar azaltıldı'
        : 'Düşük donanımlı cihazlar için daha hafif çalışma') +
    '</div></div><button id="performanceModeToggle" class="tog ' +
    (window.performanceModeConfigured ? 'on' : '') +
    '" data-action="performance-mode" aria-label="Performans Kipini değiştir"></button></div>' +
    '<div class="spsec">GÖRÜNÜM</div>' +
    [
      ['book', 'Serif Yazı Tipi', 'Okuyucu modu için Georgia', 'serifFont'],
      ['scroll', 'Smooth Scroll', 'Akıcı kaydırma', 'smoothScroll'],
    ]
      .map(
        (a) =>
          '<div class="srow"><div class="sric">' +
          ico(a[0]) +
          '</div><div class="srinf"><div class="srlbl">' +
          a[1] +
          '</div><div class="srdesc">' +
          a[2] +
          '</div></div><button class="tog ' +
          (cfg[a[3]] ? 'on' : '') +
          '" data-action="toggle-setting" data-value="' +
          encodeInline(a[3]) +
          '" data-label="' +
          escHtml(a[1]) +
          '"></button></div>',
      )
      .join('') +
    '<div class="srow"><div class="sric">' +
    ico('swap') +
    '</div><div class="srinf"><div class="srlbl">Dikey Sekmeler</div><div class="srdesc">Sekmeleri sol kenara taşı</div></div><button class="tog ' +
    (cfg.verticalTabs ? 'on' : '') +
    '" data-action="vertical-tabs"></button></div>' +
    '<div class="spsec">ERİŞİLEBİLİRLİK</div><div class="srow"><div class="sric">' +
    ico('gear') +
    '</div><div class="srinf"><div class="srlbl" id="browserVoiceLabel">Sesli rehber</div><div class="srdesc">Tab ile odaklandığınız tarayıcı kontrollerini okuyun</div></div><input type="checkbox" data-setup-voice aria-labelledby="browserVoiceLabel" ' +
    (localStorage.getItem('tb_setup_voice_off') !== '1' ? 'checked' : '') +
    '></div><div class="spsec">GİZLİLİK</div>' +
    [
      [
        'shieldcheck',
        'Reklam Engelleme',
        'Bilinen reklam ve takip alan adlarını engelle',
        'adBlock',
      ],
      ['bell', 'Bildirimler', 'Site bildirimlerine izin ver', 'notifications'],
      ['save', 'Geçmişi Kaydet', 'Ziyaret geçmişini sakla', 'saveHistory'],
    ]
      .map(
        (a) =>
          '<div class="srow"><div class="sric">' +
          ico(a[0]) +
          '</div><div class="srinf"><div class="srlbl">' +
          a[1] +
          '</div><div class="srdesc">' +
          a[2] +
          '</div></div><button class="tog ' +
          (cfg[a[3]] ? 'on' : '') +
          '" data-action="toggle-setting" data-value="' +
          encodeInline(a[3]) +
          '" data-label="' +
          escHtml(a[1]) +
          '"></button></div>',
      )
      .join('') +
    '<div class="srow"><div class="sric">' +
    ico('trash') +
    '</div><div class="srinf"><div class="srlbl">Tarama Verilerini Sil</div><div class="srdesc" id="clearDataDesc">Çerezler, önbellek ve site verileri</div></div><button data-panel-style="panel-55" data-action="clear-browsing-data">Temizle</button></div>' +
    '<div class="spsec">GÜNCELLEME</div>' +
    '<div class="srow"><div class="sric">' +
    ico('refresh') +
    '</div><div class="srinf"><div class="srlbl">Güncellemeleri Kontrol Et</div><div class="srdesc" id="updateCheckDesc">Son kontrol: ' +
    getLastUpdateCheck() +
    '</div></div><button id="checkUpdateBtn" data-panel-style="panel-56" data-action="check-update">Kontrol Et</button></div>' +
    '<div class="spsec">HIZ TESTİ</div>' +
    '<div id="speedtest-widget" data-panel-style="panel-57">' +
    '<svg width="0" height="0" data-panel-style="panel-58"><defs><linearGradient id="stGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#4f8cff"/></linearGradient></defs></svg>' +
    '<div data-panel-style="panel-59">' +
    '<div data-panel-style="panel-60"><svg class="icon" data-panel-style="panel-61"><use href="#i-bolt"/></svg></div>' +
    '<div><div data-panel-style="panel-62">İnternet Hız Testi</div><div data-panel-style="panel-63">Cloudflare CDN üzerinden ölçüm</div></div></div>' +
    '<div data-panel-style="panel-64">' +
    '<svg width="160" height="90" viewBox="0 0 160 90" overflow="visible">' +
    '<path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10" stroke-linecap="round"/>' +
    '<path id="st-gauge-arc" d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="url(#stGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="219.9" stroke-dashoffset="219.9" data-panel-style="panel-65"/>' +
    '</svg>' +
    '<div id="st-speed-num" data-panel-style="panel-66">—</div>' +
    '<div data-panel-style="panel-67">Mbps indirme hızı</div></div>' +
    '<div id="st-status" data-panel-style="panel-68">Teste başlamak için butona bas</div>' +
    '<button id="st-btn" data-action="speedtest" data-panel-style="panel-69">Hız Testini Başlat</button>' +
    '<div id="st-results" data-panel-style="panel-70">' +
    '<div data-panel-style="panel-71"><div data-panel-style="panel-72">İndirme</div><div id="st-dl-val" data-panel-style="panel-73">—</div><div data-panel-style="panel-54">Mbps</div></div>' +
    '<div data-panel-style="panel-71"><div data-panel-style="panel-72">Kalite</div><div id="st-qual-val" data-panel-style="panel-73">—</div></div>' +
    '<div data-panel-style="panel-71"><div data-panel-style="panel-72">Durum</div><div id="st-partial-val" data-panel-style="panel-73">—</div></div>' +
    '</div></div>' +
    '<div class="spsec">HAKKINDA</div>' +
    '<div class="srow" data-panel-style="panel-74"><div class="sric">' +
    ico('info') +
    '</div><div class="srinf"><div class="srlbl">TechBrowser</div><div class="srdesc" id="app-version-desc">Sürüm bilgisi alınıyor…</div></div></div>' +
    '<div class="spsec">DESTEK</div>' +
    '<div class="srow" data-panel-style="panel-75" data-action="report"><div class="sric">' +
    ico('flag') +
    '</div><div class="srinf"><div class="srlbl">Sorun Bildir</div><div class="srdesc">Hata, öneri veya geri bildirim gönder</div></div><span data-panel-style="panel-76">›</span></div>' +
    '<div class="spsec">GELİŞTİRİCİ</div>' +
    '<div class="srow" data-panel-style="panel-75" data-action="external" data-value="https://youtube.com/@techhubtr?si=bq49bRrE7k9Bg2rI"><div class="sric"><svg class="icon"><use href="#i-youtube"/></svg></div><div class="srinf"><div class="srlbl">YouTube</div><div class="srdesc">@techhubtr</div></div><span data-panel-style="panel-76">›</span></div>' +
    '<div class="srow" data-panel-style="panel-75" data-action="external" data-value="https://www.instagram.com/techhubstudiotr/"><div class="sric" data-panel-style="panel-78">' +
    ico('instagram') +
    '</div><div class="srinf"><div class="srlbl">Instagram</div><div class="srdesc">@techhubstudiotr</div></div><span data-panel-style="panel-76">›</span></div>' +
    '<div class="srow" data-panel-style="panel-75" data-action="external" data-value="https://www.tiktok.com/@tech.hub_studio"><div class="sric" data-panel-style="panel-79">' +
    ico('music') +
    '</div><div class="srinf"><div class="srlbl">TikTok</div><div class="srdesc">@tech.hub_studio</div></div><span data-panel-style="panel-76">›</span></div>';
  window.electronAPI
    .getAppVersion()
    .then((version) => {
      const el = document.getElementById('app-version-desc');
      if (el) el.textContent = 'Sürüm ' + version + ' · TechHub Studio';
    })
    .catch(() => {
      const el = document.getElementById('app-version-desc');
      if (el) el.textContent = 'Sürüm bilgisi alınamadı.';
    });
}

function applyThemeCard(k, card) {
  document.querySelectorAll('.tcard').forEach((c) => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
  card.classList.add('active');
  card.setAttribute('aria-pressed', 'true');
  cfg.customThemeEnabled = false;
  applyTheme(k);
  const customButton = document.querySelector('[data-action=custom-theme]');
  if (customButton) customButton.textContent = 'Renklerimi uygula';
  toast(THEMES[k].name + ' teması');
}

function setSeCard(k, card) {
  cfg.searchEngine = k;
  saveCfg();
  updateSeBadge();
  document.querySelectorAll('.secard').forEach((c) => c.classList.remove('active'));
  card.classList.add('active');
  toast('Arama: ' + SE[k].name);
}

function changeFontSize(v) {
  cfg.fontSize = v;
  document.documentElement.style.setProperty('--fs', v + 'px');
  var e = document.getElementById('fsVal');
  if (e) e.textContent = v + 'px';
  saveCfg();
}

function changeRam(v) {
  cfg.ramLimit = v;
  var e = document.getElementById('ramAllocV');
  if (e) e.textContent = v + ' MB';
  saveCfg();
}

async function applyBrowserSettings() {
  const result = await window.electronAPI.invoke('site-settings', {
    adBlock: cfg.adBlock,
    spellcheck: cfg.spellcheck !== false,
    notifications: cfg.notifications === true,
  });
  if (!result?.success) throw Error(result?.error || 'Site ayarları uygulanamadı.');
  document.body.classList.toggle('smooth-scroll', cfg.smoothScroll);
  const reader = document.querySelector('#readerView .rv-body');
  if (reader) reader.style.fontFamily = cfg.serifFont ? 'Georgia, serif' : 'inherit';
  await Promise.all(Object.values(tabData).map(applyPageFeatures));
}

async function toggleCfg(key, btn, name) {
  if (btn.disabled) return;
  const previous = cfg[key];
  btn.disabled = true;
  cfg[key] = !previous;
  try {
    await applyBrowserSettings();
    if (!(await saveAllData())) throw Error('Ayar kaydedilemedi.');
    btn.classList.toggle('on', cfg[key]);
    toast(name + ': ' + (cfg[key] ? 'Açık' : 'Kapalı'));
  } catch (error) {
    cfg[key] = previous;
    btn.classList.toggle('on', previous);
    await applyBrowserSettings().catch(() => {});
    toast(error.message);
  } finally {
    btn.disabled = false;
  }
}

async function togglePerformanceMode(button) {
  if (button.disabled) return;
  button.disabled = true;
  const next = !window.performanceModeConfigured;
  try {
    const result = await window.electronAPI.invoke('performance-mode-set', next);
    if (!result?.success) throw Error(result?.error || 'Performans Kipi kaydedilemedi.');
    window.performanceModeConfigured = next;
    button.classList.toggle('on', next);
    const desc = document.getElementById('performanceModeDesc');
    if (desc) desc.textContent = 'Değişiklik yeniden başlatınca uygulanacak';
    toast(
      'Performans Kipi ' + (next ? 'açılacak' : 'kapanacak') + ' · TechBrowser’ı yeniden başlatın',
    );
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function clearBrowsingData() {
  var desc = document.getElementById('clearDataDesc');
  if (desc) desc.textContent = 'Temizleniyor...';
  try {
    if (window.electronAPI && window.electronAPI.clearBrowsingData) {
      var r = await window.electronAPI.clearBrowsingData();
      if (r && !r.success) throw new Error(r.error || 'Bilinmeyen hata');
    }
    if (desc)
      desc.innerHTML =
        '<svg class="icon" data-panel-style="panel-80"><use href="#i-check"/></svg>Temizlendi · ' +
        new Date().toLocaleTimeString('tr-TR');
    toast('Tarama verileri temizlendi');
  } catch (e) {
    if (desc) desc.textContent = 'Çerezler, önbellek ve site verileri';
    toast('Temizleme hatası: ' + e.message);
  }
}

function renderThemeEditor() {
  const colors = cfg.customTheme || {};
  const safe = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
  return (
    '<div class="theme-editor"><div><h3>Kendi temanı oluştur</h3><p>Zemin ve vurgu rengini seç. Metin kontrastı otomatik ayarlanır.</p></div><div class="theme-color-fields"><label>Zemin<input aria-label="Tema zemin rengi" type="color" data-input="theme-background" value="' +
    safe(colors.background, '#101216') +
    '"></label><label>Vurgu<input aria-label="Tema vurgu rengi" type="color" data-input="theme-accent" value="' +
    safe(colors.accent, '#c9d2de') +
    '"></label><button data-action="custom-theme">' +
    (cfg.customThemeEnabled ? 'Özel tema etkin' : 'Renklerimi uygula') +
    '</button><button data-action="reset-custom-theme">Sıfırla</button></div></div>'
  );
}
function setCustomThemeColor(key, value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return;
  cfg.customTheme = { background: '#101216', accent: '#c9d2de', ...cfg.customTheme, [key]: value };
  if (cfg.customThemeEnabled) applyCustomTheme();
  saveCfg();
}
function useCustomTheme() {
  cfg.customThemeEnabled = true;
  applyCustomTheme();
  saveCfg();
  renderSettings();
}
function resetCustomTheme() {
  cfg.customThemeEnabled = false;
  delete cfg.customTheme;
  applyTheme('default');
  renderSettings();
}
