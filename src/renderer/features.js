'use strict';

// Retain live pages only while needed. Never suspend a page playing audio,
// capturing media, downloading, or containing edited form fields.
async function suspendTab(id) {
  const td = tabData[id];
  if (!td || Number(id) === activeTabId || !td.wv || td.loading || td.incognito) return false;
  if (_dlList.some((d) => d.state === 'downloading')) return false;
  try {
    const guest = td.wv;
    if (td.wv.isCurrentlyAudible()) return false;
    const busy = await td.wv.executeJavaScript(
      `!!(document.querySelector('video:not([paused]),audio:not([paused])') && [...document.querySelectorAll('video,audio')].some(e=>!e.paused)) || [...document.querySelectorAll('input,textarea,select,[contenteditable="true"]')].some(e=>e.isContentEditable || (e.tagName==='SELECT' ? [...e.options].some(o=>o.selected!==o.defaultSelected) : (e.type==='checkbox'||e.type==='radio') ? e.checked!==e.defaultChecked : ('value' in e && e.value!==e.defaultValue)))`,
    );
    if (busy || Number(id) === activeTabId) return false;
    // Capture/RTC status is checked in main, where the guest cannot forge it.
    const check = await window.electronAPI.invoke('can-suspend-tab', td.wv.getWebContentsId());
    if (!check || Number(id) === activeTabId || td.wv !== guest || td.loading) return false;
    td.container.remove();
    td.wv = null;
    td.container = null;
    td.suspended = true;
    const el = document.querySelector('.tab[data-id="' + id + '"]');
    if (el) {
      el.classList.add('sleeping');
      el.title = 'Bellekten çıkarıldı; seçilince yeniden yüklenir.';
    }
    return true;
  } catch {
    return false;
  }
}
async function manageMemory(usedMB) {
  if (document.hidden) return;
  const time = Date.now(),
    pressure = usedMB > Number(cfg.ramLimit || 512);
  const inactive = Object.keys(tabData)
    .filter((id) => Number(id) !== activeTabId && tabData[id]?.wv)
    .sort((a, b) => (tabData[a].lastActive || 0) - (tabData[b].lastActive || 0));
  for (let index = 0; index < inactive.length; index++) {
    const id = inactive[index];
    const td = tabData[id];
    const age = time - (td.lastActive || time);
    const overLiveBudget = window.performanceMode && index < inactive.length - 2;
    const idleLimit = window.performanceMode ? 15000 : pressure ? 30000 : 120000;
    if (overLiveBudget || age > idleLimit) await suspendTab(id);
  }
}
function updateIncognitoUI() {
  incognito = !!tabData[activeTabId]?.incognito;
  document.body.classList.toggle('incognito', incognito);
  document.getElementById('incogBtn').classList.toggle('lit', incognito);
}
let incognitoCleanup = Promise.resolve();
function cleanupIncognitoIfEmpty() {
  if (!Object.values(tabData).some((t) => t.incognito)) {
    incognitoCleanup = incognitoCleanup.then(() => window.electronAPI.clearIncognitoData());
    incognitoCleanup.catch((e) => toast('Gizli oturum temizlenemedi: ' + e.message));
  }
}
async function toggleIncognito() {
  await incognitoCleanup;
  if (incognito) {
    newTab(false);
    toast('Normal sekmeye geçildi. Gizli sekmeler kapanana kadar oturumları korunur.');
  } else newIncogTab();
}
async function toggleReader() {
  if (readerOn) {
    readerOn = false;
    document.getElementById('readerView').classList.remove('on');
    return;
  }
  const td = tabData[activeTabId];
  if (!td?.wv) return toast('Önce bir yazı sayfası açın.');
  try {
    const tabId = activeTabId,
      guest = td.wv,
      source = guest.getURL();
    const article = await td.wv.executeJavaScript(
      `(()=>{const root=document.querySelector('article')||document.querySelector('main')||document.body;const copy=root.cloneNode(true);copy.querySelectorAll('script,style,nav,header,footer,aside,form,button,iframe').forEach(e=>e.remove());return {title:document.title,text:copy.textContent.trim().slice(0,150000)}})()`,
    );
    if (activeTabId !== tabId || tabData[tabId]?.wv !== guest || guest.getURL() !== source) return;
    const body = document.querySelector('#readerView .rv-body');
    body.replaceChildren();
    body.style.fontFamily = cfg.serifFont ? 'Georgia, serif' : 'inherit';
    const title = document.createElement('h1'),
      text = document.createElement('div');
    title.textContent = article.title;
    text.textContent = article.text;
    text.style.whiteSpace = 'pre-wrap';
    body.append(title, text);
    readerOn = true;
    document.getElementById('readerView').classList.add('on');
  } catch (e) {
    toast('Sayfa okunamadı: ' + e.message);
  }
}
async function applyPageFeatures(td) {
  if (!td?.wv) return;
  try {
    if (td.featureCss) await td.wv.removeInsertedCSS(td.featureCss);
    let css = cfg.smoothScroll ? 'html{scroll-behavior:smooth!important}' : '';
    if (cfg.darkMode)
      css +=
        'html{color-scheme:dark!important;background:#121212!important}body{background:#121212!important;color:#e5e5e5!important}a{color:#8ab4f8!important}';
    if (css) td.featureCss = await td.wv.insertCSS(css);
  } catch {}
}
function groupTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const host = (el) => {
    try {
      return new URL(tabData[el.dataset.id].url).hostname;
    } catch {
      return '';
    }
  };
  tabs
    .sort((a, b) => host(a).localeCompare(host(b), 'tr'))
    .forEach((el) => document.querySelector('.tab-new').before(el));
  toast('Sekmeler site adına göre gruplandı.');
}
async function capturePage() {
  const td = tabData[activeTabId];
  if (!td?.wv) return toast('Önce bir sayfa açın.');
  const r = await window.electronAPI.invoke('capture-page', td.wv.getWebContentsId());
  if (r?.success) toast('Görünen sayfa görüntüsü kaydedildi.');
  else if (r?.error) toast(r.error);
}
function useExtension(id) {
  const actions = {
    reader: toggleReader,
    tabgroup: groupTabs,
    screenshot: capturePage,
    password: () => openPanel('passwords'),
    translate: translatePage,
    vpn: toggleVpnPopup,
  };
  if (actions[id]) actions[id]();
}
async function syncData() {
  if (!cu) return toast('Senkronizasyon için giriş yapın.');
  try {
    const r = await window.electronAPI.invoke('sync-data', { bookmarks: bookmarkList });
    if (!r.success) throw Error(r.error);
    bookmarkList = r.bookmarks;
    await saveAllData();
    renderBookmarks();
    toast('Yer imleri diğer cihazlarla senkronize edildi.');
  } catch (e) {
    toast('Senkronizasyon tamamlanamadı: ' + e.message);
  }
}

async function openMfaSetup() {
  if (!cu) return toast('Önce giriş yapın.');
  if (cu.mfaEnabled) return toast('Hesabınızda doğrulayıcı koruması zaten açık.');
  if (window._mfaOpening) return;
  window._mfaOpening = true;
  try {
    const result = await window.electronAPI.invoke('auth-mfa-enroll-start');
    if (!result.success) throw Error(result.error);
    closeAllModals();
    const modal = document.createElement('div');
    modal.className = 'modal on mfa-card';
    modal.id = 'mfaSetup';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'mfaTitle');
    modal.innerHTML =
      '<button class="mfa-close" aria-label="Kapat">×</button><div class="mfa-badge">HESAP GÜVENLİĞİ</div><h2 id="mfaTitle">Bir tarama. Ekstra koruma.</h2><p class="mfa-sub">Doğrulayıcı uygulamanızla hesabınızı güvenceye alın.</p><div class="mfa-layout"><div class="mfa-qr"><img width="224" height="224" alt="Doğrulayıcı kurulum QR kodu"></div><div class="mfa-guide"><div class="mfa-step"><b>1</b><div><strong>QR kodu tarayın</strong><p>Doğrulayıcı uygulamanızda hesap ekleyip bu kodu tarayın.</p></div></div><div class="mfa-step"><b>2</b><div><strong>Kodu doğrulayın</strong><p>Telefonunuzda üretilen 6 haneli kodu aşağıya girin.</p></div></div><details class="mfa-manual"><summary>Kamerayı kullanamıyor musunuz?</summary><input readonly aria-label="Elle kurulum anahtarı"><button type="button">Anahtarı kopyala</button></details></div></div><form class="mfa-form"><label for="mfaCode">DOĞRULAMA KODU</label><input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" pattern="[0-9]{6}" required><p class="mfa-status" role="status" aria-live="polite"></p><button class="btn-pr mfa-submit" type="submit">Doğrula ve etkinleştir →</button></form><p class="mfa-foot">QR kod yalnızca bu cihazda oluşturulur. Kurulum anahtarınızı paylaşmayın.</p>';
    const qr = modal.querySelector('img'),
      secret = modal.querySelector('[readonly]'),
      code = modal.querySelector('#mfaCode'),
      status = modal.querySelector('.mfa-status'),
      save = modal.querySelector('.mfa-submit');
    qr.src = result.qr;
    secret.value = result.secret;
    const close = () => {
      qr.removeAttribute('src');
      secret.value = '';
      code.value = '';
      closeAllModals();
    };
    modal.querySelector('.mfa-close').onclick = close;
    modal.querySelector('.mfa-manual button').onclick = async () => {
      try {
        await navigator.clipboard.writeText(secret.value);
        status.textContent = 'Anahtar kopyalandı.';
      } catch {
        status.textContent = 'Kopyalanamadı; anahtarı seçip elle kopyalayabilirsiniz.';
      }
    };
    code.oninput = () => {
      code.value = code.value.replace(/[^0-9]/g, '');
    };
    modal.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      if (!/^\d{6}$/.test(code.value)) {
        status.textContent = 'Doğrulayıcı uygulamanızdaki 6 haneli kodu girin.';
        return;
      }
      save.disabled = true;
      save.textContent = 'Doğrulanıyor…';
      status.textContent = '';
      try {
        const r = await window.electronAPI.invoke('auth-mfa-enroll-finish', { code: code.value });
        if (!r.success) throw Error(r.error);
        cu = r.user;
        updateAccountUI();
        close();
        toast('Sunucu doğrulamalı ikinci faktör etkin.');
      } catch (e) {
        status.textContent = e.message;
        if (e.message.includes('Kurulum geçersizleşti')) {
          qr.removeAttribute('src');
          secret.value = '';
          code.value = '';
          save.hidden = true;
          const restart = document.createElement('button');
          restart.type = 'button';
          restart.className = 'btn-pr';
          restart.textContent = 'Yeni QR kodla başlat';
          restart.onclick = () => {
            close();
            openMfaSetup();
          };
          status.after(restart);
        }
      } finally {
        save.disabled = false;
        save.textContent = 'Doğrula ve etkinleştir →';
      }
    };
    document.body.append(modal);
    openOverlay();
    code.focus();
  } catch (e) {
    toast('Doğrulayıcı kurulamadı: ' + e.message);
  } finally {
    window._mfaOpening = false;
  }
}
