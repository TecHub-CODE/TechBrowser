// downloads panel: rendering and its user actions.
function addDownload(info) {
  var idx = _dlList.findIndex(function (d) {
    return d.id === info.id;
  });
  if (idx >= 0) {
    if (info.state === 'downloading' && _dlList[idx].received && info.received) {
      var diff = info.received - _dlList[idx].received;
      if (diff > 0) _dlSpeeds[info.id] = diff;
    }
    _dlList[idx] = info;
  } else {
    _dlList.unshift(info);
  }
  if (curPanel === 'downloads') renderDownloads();
}

async function cancelDownload(id) {
  var item = _dlList.find((d) => d.id === id);
  if (!item) return;
  try {
    var r = await window.electronAPI.invoke('cancel-download', item.id);
    if (!r.success) throw Error('İndirme artık etkin değil.');
    toast('İptal isteği uygulandı.');
  } catch (e) {
    toast(e.message);
  }
}

function removeDownload(id) {
  _dlList = _dlList.filter(function (d) {
    return d.id !== id;
  });
  delete _dlSpeeds[id];
  if (curPanel === 'downloads') renderDownloads();
}

function clearAllDownloads() {
  _dlList = _dlList.filter(function (d) {
    return d.state === 'downloading';
  });
  _dlSpeeds = {};
  if (curPanel === 'downloads') renderDownloads();
  toast('Liste temizlendi');
}

function fmtBytes(b) {
  if (!b || b === 0) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function renderDownloads() {
  var act = _dlList.filter(function (d) {
    return d.state === 'downloading';
  });
  var done = _dlList.filter(function (d) {
    return d.state === 'completed';
  });
  var err = _dlList.filter(function (d) {
    return d.state === 'interrupted';
  });
  var html = '';

  if (_dlList.length > 0) {
    html +=
      '<div data-panel-style="panel-20">' +
      '<span data-panel-style="panel-21">' +
      _dlList.length +
      ' öğe</span>' +
      '<div data-panel-style="panel-22">' +
      '<button class="dl-btn" data-action="downloads-folder"><svg class="icon" data-panel-style="panel-19"><use href="#i-folder"/></svg>Klasörü Aç</button>' +
      '<button class="dl-btn danger" data-action="clear-downloads"><svg class="icon" data-panel-style="panel-19"><use href="#i-trash"/></svg>Temizle</button>' +
      '</div></div>';
  }

  if (act.length) {
    html += '<div class="spsec">İNDİRİLİYOR (' + act.length + ')</div>';
    act.forEach(function (d) {
      var pct = d.total > 0 ? Math.round((d.received / d.total) * 100) : 0;
      var spd = _dlSpeeds[d.id] ? fmtBytes(_dlSpeeds[d.id]) + '/s' : '';
      var sz = d.total > 0 ? fmtBytes(d.received) + ' / ' + fmtBytes(d.total) : '';
      var enc = encodeInline(d.id);
      html +=
        '<div class="dl-row">' +
        '<div class="dl-top"><span class="dl-ic"><svg class="icon"><use href="#i-download"/></svg></span>' +
        '<div class="dl-info"><div class="dl-nm">' +
        escHtml(d.filename) +
        '</div>' +
        '<div data-panel-style="panel-23">' +
        '<span class="dl-sz">' +
        sz +
        '</span>' +
        (spd ? '<span class="dl-speed">' + spd + '</span>' : '') +
        '</div></div></div>' +
        '<div class="dl-bar"><div class="dl-fill" style="width:' +
        pct +
        '%"></div></div>' +
        '<div data-panel-style="panel-24">' +
        '<span class="dl-sz" data-panel-style="panel-25">' +
        pct +
        '% indirildi</span>' +
        '<button class="dl-btn danger" data-panel-style="panel-26" data-action="cancel-download" data-value="' +
        enc +
        '"><svg class="icon" data-panel-style="panel-27"><use href="#i-x"/></svg>İptal</button>' +
        '</div></div>';
    });
  }

  if (done.length) {
    html += '<div class="spsec">TAMAMLANDI (' + done.length + ')</div>';
    done.forEach(function (d) {
      var enc = encodeInline(d.id);
      var sp = d.savePath || '';
      var encSp = encodeInline(sp);
      html +=
        '<div class="dl-row">' +
        '<div class="dl-top"><span class="dl-ic"><svg class="icon" data-panel-style="panel-28"><use href="#i-check"/></svg></span>' +
        '<div class="dl-info"><div class="dl-nm">' +
        escHtml(d.filename) +
        '</div>' +
        '<div class="dl-sz">' +
        fmtBytes(d.total) +
        '</div>' +
        '</div></div>' +
        '<div class="dl-bar"><div class="dl-fill done" data-panel-style="panel-29"></div></div>' +
        '<div class="dl-actions">' +
        (sp
          ? '<button class="dl-btn primary" data-action="open-download" data-value="' +
            encSp +
            '"><svg class="icon" data-panel-style="panel-30"><use href="#i-play"/></svg>Aç</button>'
          : '') +
        (sp
          ? '<button class="dl-btn" data-action="downloads-folder"><svg class="icon" data-panel-style="panel-19"><use href="#i-folder"/></svg>Klasörde Göster</button>'
          : '') +
        '<button class="dl-btn danger" data-action="remove-download" data-value="' +
        enc +
        '"><svg class="icon" data-panel-style="panel-30"><use href="#i-x"/></svg>Kaldır</button>' +
        '</div></div>';
    });
  }

  if (err.length) {
    html += '<div class="spsec">BAŞARISIZ (' + err.length + ')</div>';
    err.forEach(function (d) {
      var enc = encodeInline(d.id);
      html +=
        '<div class="dl-row">' +
        '<div class="dl-top"><span class="dl-ic"><svg class="icon" data-panel-style="panel-31"><use href="#i-x"/></svg></span>' +
        '<div class="dl-info"><div class="dl-nm">' +
        escHtml(d.filename) +
        '</div>' +
        '<div class="dl-sz" data-panel-style="panel-32">İndirme başarısız</div>' +
        '</div></div>' +
        '<div class="dl-bar"><div class="dl-fill err" data-panel-style="panel-29"></div></div>' +
        '<div class="dl-actions">' +
        '<button class="dl-btn danger" data-action="remove-download" data-value="' +
        enc +
        '"><svg class="icon" data-panel-style="panel-30"><use href="#i-x"/></svg>Kaldır</button>' +
        '</div></div>';
    });
  }

  if (!html) {
    html =
      '<div class="studio-empty">' +
      '<div data-panel-style="panel-33"><svg class="icon" data-panel-style="panel-34"><use href="#i-download"/></svg></div>' +
      '<div data-panel-style="panel-35">Henüz indirme yok.<br>İndirilen dosyalar burada görünecek.</div>' +
      '<button class="dl-btn" data-panel-style="panel-36" data-action="downloads-folder"><svg class="icon" data-panel-style="panel-37"><use href="#i-folder"/></svg>İndirilenler Klasörünü Aç</button>' +
      '</div>';
  }

  document.getElementById('spBody').innerHTML = html;
}
