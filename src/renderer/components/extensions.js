// extensions panel: rendering and its user actions.
function renderExt() {
  var installed = EXT_STORE.filter((e) => installedExt.has(e.id));
  document.getElementById('spBody').innerHTML =
    '<div class="spsec">YÜKLÜ (' +
    installed.length +
    '/' +
    EXT_STORE.length +
    ')</div>' +
    installed
      .map((ext) => {
        var on = ext.key ? cfg[ext.key] : true;
        return (
          '<div class="ext-row"><div class="ext-ic">' +
          ext.ic +
          '</div><div data-panel-style="panel-38"><div class="ext-nm">' +
          ext.name +
          '</div><div class="ext-desc">' +
          ext.desc +
          '</div></div><button class="tog ' +
          (on ? 'on' : '') +
          '" data-action="toggle-extension" data-value="' +
          encodeInline(ext.id) +
          '"></button></div>'
        );
      })
      .join('') +
    '<div class="spsec">DAHİLİ ARAÇLAR</div>' +
    '<button class="ext-add" data-action="extension-store"><svg class="icon" data-panel-style="panel-39"><use href="#i-puzzle"/></svg>Tarayıcı araçlarını aç (' +
    EXT_STORE.length +
    ')</button>';
}

function toggleExt(id, name, key, btn) {
  if (!key) {
    useExtension(id);
    return;
  }
  return toggleCfg(key, btn, name);
}

function openExtStore() {
  closeAllModals();
  document.getElementById('extModalBody').innerHTML =
    '<p data-panel-style="panel-40">' +
    EXT_STORE.length +
    ' dahili araç; indirme gerektirmez</p>' +
    '<div class="ext-store-grid">' +
    EXT_STORE.map((ext) => {
      var inst = installedExt.has(ext.id);
      return (
        '<div class="esc"><div class="esc-top"><div class="esc-ic">' +
        ext.ic +
        '</div><div><div class="esc-nm">' +
        ext.name +
        '</div><div class="esc-cat">' +
        ext.cat +
        '</div></div></div><div class="esc-desc">' +
        ext.desc +
        '</div><button class="esc-btn ' +
        (inst ? 'installed' : '') +
        '" id="esbtn_' +
        ext.id +
        '" data-action="install-extension" data-value="' +
        encodeInline(ext.id) +
        '">' +
        (inst ? ico('check') + '<span data-panel-style="panel-41">Eklendi</span>' : 'Ekle') +
        '</button></div>'
      );
    }).join('') +
    '</div>';
  openModal('extModal');
}

function installExt(id, name) {
  if (installedExt.has(id)) {
    toast(name + ' zaten yüklü');
    return;
  }
  installedExt.add(id);
  cfg.installedExtensions = [...installedExt];
  saveCfg();
  var btn = document.getElementById('esbtn_' + id);
  if (btn) {
    btn.innerHTML = ico('check') + '<span data-panel-style="panel-41">Eklendi</span>';
    btn.classList.add('installed');
  }
  toast('⬠ ' + name + ' yüklendi!');
}
