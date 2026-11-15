// ── v2.7.0: Sürüm fix + Speedtest ───────────────────────────────
(function () {
  'use strict';

  // Sürümü dinamik yükle
  async function loadAppVersion() {
    try {
      var ver = await window.electronAPI.getAppVersion();
      var el = document.getElementById('app-version-desc');
      if (el) el.textContent = 'v' + ver + ' · Electron · Chromium';
    } catch (e) {
      console.warn('[Version]', e);
    }
  }

  // Speedtest
  var ARC_LEN = 219.9;
  var MAX_MBPS = 200;
  var _running = false;
  var _unsub = null;

  function setGauge(mbps) {
    var ratio = Math.min(mbps / MAX_MBPS, 1);
    var offset = ARC_LEN * (1 - ratio);
    var arc = document.getElementById('st-gauge-arc');
    var num = document.getElementById('st-speed-num');
    if (arc) arc.style.strokeDashoffset = offset.toFixed(1);
    if (num) num.textContent = mbps >= 1 ? Math.round(mbps) : mbps.toFixed(1);
  }

  function setStatus(msg, color) {
    var el = document.getElementById('st-status');
    if (el) {
      el.textContent = msg;
      el.style.color = color || 'var(--tx2)';
    }
  }

  function qualLabel(mbps) {
    if (mbps >= 100) return '⌃ Ultra';
    if (mbps >= 50) return '✓ İyi';
    if (mbps >= 20) return '◆ Orta';
    if (mbps >= 5) return '● Yavaş';
    return '✕ Çok yavaş';
  }

  window.startSpeedtest = async function () {
    if (_running) return;
    _running = true;

    var btn = document.getElementById('st-btn');
    var res = document.getElementById('st-results');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Test yapılıyor…';
      btn.style.opacity = '.7';
    }
    if (res) res.style.display = 'none';

    setGauge(0);
    setStatus('Bağlantı kuruluyor…', '#4f8cff');

    if (_unsub) {
      _unsub();
      _unsub = null;
    }

    if (window.electronAPI && window.electronAPI.onSpeedtestProgress) {
      _unsub = window.electronAPI.onSpeedtestProgress(function (d) {
        setGauge(d.mbps);
        setStatus('Ölçülüyor… ' + d.mbps.toFixed(1) + ' Mbps', '#4f8cff');
      });
    }

    try {
      var result = await window.electronAPI.runSpeedtest();
      if (_unsub) {
        _unsub();
        _unsub = null;
      }

      if (result.success) {
        setGauge(result.mbps);
        setStatus('Tamamlandı' + (result.partial ? ' (kısmi)' : '') + ' ✓', '#10b981');
        var dl = document.getElementById('st-dl-val');
        var ql = document.getElementById('st-qual-val');
        var pt = document.getElementById('st-partial-val');
        if (dl) dl.textContent = result.mbps.toFixed(1);
        if (ql) ql.textContent = qualLabel(result.mbps);
        if (pt) pt.textContent = result.partial ? '⚠ Kısmi' : '✓ Tam';
        if (res) {
          res.style.display = 'flex';
        }
      } else {
        setGauge(0);
        setStatus('Hata: ' + (result.error || '?'), '#f87171');
      }
    } catch (e) {
      if (_unsub) {
        _unsub();
        _unsub = null;
      }
      setGauge(0);
      setStatus('Hata: ' + e.message, '#f87171');
    } finally {
      _running = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Tekrar Test Et';
        btn.style.opacity = '1';
      }
    }
  };

  // Sayfa yüklenince sürümü çek
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAppVersion);
  } else {
    loadAppVersion();
  }
})();
