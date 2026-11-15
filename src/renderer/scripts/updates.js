(function () {
  // Kapat butonları
  document.getElementById('updateCloseBtn').addEventListener('click', function () {
    var b = document.getElementById('updateBanner');
    b.classList.remove('show');
    b.classList.add('hide');
    setTimeout(function () {
      b.style.display = 'none';
      b.classList.remove('hide');
    }, 300);
  });
  document.getElementById('changelogCloseBtn').addEventListener('click', function () {
    document.getElementById('changelogModal').style.display = 'none';
  });
  document.getElementById('changelogOkBtn').addEventListener('click', function () {
    document.getElementById('changelogModal').style.display = 'none';
  });

  if (!window.electronAPI) return;

  // ── Güncelleme mevcut ────────────────────────────────────────
  window.electronAPI.onUpdateAvailable &&
    window.electronAPI.onUpdateAvailable(function (info) {
      var banner = document.getElementById('updateBanner');
      document.getElementById('updateTitle').textContent = 'Güncelleme Mevcut';
      document.getElementById('updateVersion').textContent = 'v' + info.version + ' hazır';
      var notes = '';
      if (info.releaseNotes) {
        if (typeof info.releaseNotes === 'string') notes = info.releaseNotes;
        else if (Array.isArray(info.releaseNotes))
          notes = info.releaseNotes
            .map(function (n) {
              return n.note || n;
            })
            .join('\n');
      }
      document.getElementById('updateNotes').textContent = String(notes || '')
        ? notes.replace(/\n/g, '<br>')
        : 'Yeni sürüm indirmeye hazır.';
      document.getElementById('updateDownloadBtn').style.display = 'flex';
      document.getElementById('updateInstallBtn').style.display = 'none';
      banner.style.display = 'block';
      setTimeout(function () {
        banner.classList.add('show');
      }, 10);
    });

  // ── İndirme progress ─────────────────────────────────────────
  window.electronAPI.onUpdateProgress &&
    window.electronAPI.onUpdateProgress(function (prog) {
      document.getElementById('updateProgressWrap').style.display = 'block';
      var pct = Math.round(prog.percent || 0);
      document.getElementById('updateProgressBar').style.width = pct + '%';
      var speed = prog.bytesPerSecond
        ? (prog.bytesPerSecond / 1024 / 1024).toFixed(1) + ' MB/s'
        : '';
      document.getElementById('updateProgressText').textContent =
        pct + '%' + (speed ? '  ·  ' + speed : '');
      var btn = document.getElementById('updateDownloadBtn');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      document.getElementById('updateDownloadBtnText').textContent = 'İndiriliyor...';
    });

  // ── İndirme tamamlandı ────────────────────────────────────────
  window.electronAPI.onUpdateDownloaded &&
    window.electronAPI.onUpdateDownloaded(function (info) {
      document.getElementById('updateProgressWrap').style.display = 'none';
      document.getElementById('updateDownloadBtn').style.display = 'none';
      var installBtn = document.getElementById('updateInstallBtn');
      installBtn.style.display = 'flex';
      document.getElementById('updateTitle').textContent = 'Güncelleme Hazır';
      document.getElementById('updateVersion').textContent =
        'v' + info.version + ' · Yeniden başlatmayı bekliyor';
      document.getElementById('updateNotes').innerHTML =
        (document.getElementById('updateNotes').innerHTML || '') +
        '<div data-panel-style="panel-15"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Dosya imzası doğrulandı</div>';
    });

  // ── Changelog ────────────────────────────────────────────────
  window.electronAPI.onShowChangelog &&
    window.electronAPI.onShowChangelog(function (info) {
      document.getElementById('changelogVersion').textContent =
        'v' + info.version + ' ile Güncellendi';
      var notes = '';
      if (info.releaseNotes) {
        if (typeof info.releaseNotes === 'string') notes = info.releaseNotes;
        else if (Array.isArray(info.releaseNotes))
          notes = info.releaseNotes
            .map(function (n) {
              return (
                '<div data-panel-style="panel-16"><span data-panel-style="panel-17"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>' +
                (n.note || n) +
                '</span></div>'
              );
            })
            .join('');
      }
      document.getElementById('changelogContent').textContent =
        notes ||
        '<div data-panel-style="panel-16"><span data-panel-style="panel-17"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>Performans iyileştirmeleri ve hata düzeltmeleri.</span></div>';
      document.getElementById('changelogModal').style.display = 'flex';
    });

  // ── Güncelleme hatası ─────────────────────────────────────────
  window.electronAPI.onUpdateError &&
    window.electronAPI.onUpdateError(function (info) {
      var banner = document.getElementById('updateBanner');
      var btn = document.getElementById('updateDownloadBtn');
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      document.getElementById('updateDownloadBtnText').textContent = '↓ İndir ve Kur';
      document.getElementById('updateProgressWrap').style.display = 'none';
      document.getElementById('updateNotes').innerHTML =
        '<span data-panel-style="panel-18"><svg class="icon" data-panel-style="panel-19"><use href="#i-x"/></svg>Hata: ' +
        escHtml((info && info.message) || 'Bilinmeyen hata') +
        '</span>';
      if (banner.style.display === 'none' || !banner.classList.contains('show')) {
        document.getElementById('updateTitle').textContent = 'Güncelleme Hatası';
        document.getElementById('updateVersion').textContent = 'Tekrar denemek için butona basın';
        banner.style.display = 'block';
        setTimeout(function () {
          banner.classList.add('show');
        }, 10);
      }
    });
})();

function startUpdateDownload() {
  var btn = document.getElementById('updateDownloadBtn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }
  document.getElementById('updateDownloadBtnText').textContent = 'Başlatılıyor...';
  document.getElementById('updateProgressWrap').style.display = 'block';
  if (window.electronAPI && window.electronAPI.downloadUpdate) {
    window.electronAPI
      .downloadUpdate()
      .then(function (r) {
        if (r && !r.success) {
          var btn2 = document.getElementById('updateDownloadBtn');
          if (btn2) {
            btn2.disabled = false;
            btn2.style.opacity = '1';
          }
          document.getElementById('updateDownloadBtnText').textContent = '↓ İndir ve Kur';
          document.getElementById('updateProgressWrap').style.display = 'none';
          document.getElementById('updateNotes').innerHTML =
            '<span data-panel-style="panel-18"><svg class="icon" data-panel-style="panel-19"><use href="#i-x"/></svg>Hata: ' +
            escHtml(r.error || 'Bilinmeyen hata') +
            '</span>';
        }
      })
      .catch(function () {});
  }
}
function installUpdateNow() {
  if (window.electronAPI && window.electronAPI.installUpdate) {
    window.electronAPI.installUpdate();
  }
}
