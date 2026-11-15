// ── Sorun Bildir ──────────────────────────────────────────────
var _reportCat = 'bug';

function showReportModal() {
  var m = document.getElementById('reportModal');
  if (m) {
    m.style.display = 'flex';
    m.style.alignItems = 'center';
    m.style.justifyContent = 'center';
  }
  document.getElementById('reportSubject').value = '';
  document.getElementById('reportDescription').value = '';
  document.getElementById('reportEmail').value = '';
  document.getElementById('rDescCount').textContent = '0';
  document.getElementById('reportError').style.display = 'none';
  var btn = document.getElementById('reportSubmitBtn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '↑ Bildirimi Gönder';
    btn.style.opacity = '1';
  }
  _reportCat = 'bug';
  document.querySelectorAll('.rcat-btn').forEach(function (b) {
    b.classList.remove('active');
  });
  var first = document.querySelector('.rcat-btn[data-cat="bug"]');
  if (first) first.classList.add('active');
}

function hideReportModal() {
  var m = document.getElementById('reportModal');
  if (m) m.style.display = 'none';
}

function selectReportCat(btn) {
  document.querySelectorAll('.rcat-btn').forEach(function (b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  _reportCat = btn.getAttribute('data-cat');
}

async function submitReport() {
  var subject = document.getElementById('reportSubject').value.trim();
  var description = document.getElementById('reportDescription').value.trim();
  var userEmail = document.getElementById('reportEmail').value.trim();
  var errEl = document.getElementById('reportError');
  var btn = document.getElementById('reportSubmitBtn');

  if (!subject) {
    errEl.textContent = 'Lütfen bir konu girin.';
    errEl.style.display = 'block';
    return;
  }
  if (description.length < 10) {
    errEl.textContent = 'Açıklama en az 10 karakter olmalıdır.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Gönderiliyor…';
  btn.style.opacity = '.7';

  try {
    var version = '?';
    try {
      version = await window.electronAPI.getAppVersion();
    } catch (e) {}
    var result = await window.electronAPI.submitReport({
      category: _reportCat,
      subject: subject,
      description: description,
      userEmail: userEmail || null,
      appVersion: version,
    });
    if (result.success) {
      hideReportModal();
      if (typeof toast === 'function') toast('✓ Bildiriminiz iletildi, teşekkürler!');
    } else {
      errEl.textContent = result.error || 'Gönderilemedi.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '↑ Bildirimi Gönder';
      btn.style.opacity = '1';
    }
  } catch (e) {
    errEl.textContent = 'Hata: ' + e.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '↑ Bildirimi Gönder';
    btn.style.opacity = '1';
  }
}

// ── Hesap Silme ───────────────────────────────────────────────
function showDeleteAccountModal() {
  var m = document.getElementById('deleteAccountModal');
  if (!m) return;
  m.style.display = 'flex';
  m.style.alignItems = 'center';
  m.style.justifyContent = 'center';

  // Google tespiti: SADECE cu.provider'a bak — en güvenilir kaynak
  var isGoogleUser = !!(typeof cu !== 'undefined' && cu && cu.provider === 'google');

  var passSection = document.getElementById('deletePassSection');
  var googleInfo = document.getElementById('deleteGoogleInfo');
  var emailEl = document.getElementById('deleteEmail');

  document.getElementById('deletePassword').value = '';
  document.getElementById('deleteError').style.display = 'none';

  if (isGoogleUser) {
    passSection.style.display = 'none';
    googleInfo.style.display = 'block';
  } else {
    passSection.style.display = 'block';
    googleInfo.style.display = 'none';
  }

  try {
    if (typeof cu !== 'undefined' && cu && cu.email) emailEl.value = cu.email;
    else emailEl.value = '';
  } catch (e) {
    emailEl.value = '';
  }
}

function hideDeleteAccountModal() {
  cancelDeleteHold();
  var m = document.getElementById('deleteAccountModal');
  if (m) m.style.display = 'none';
  var ov = document.getElementById('overlay');
  if (ov) ov.classList.remove('on');
}

// ── Hesap Silme: 5 sn basılı tut animasyonu ──────────────────
var _deleteHoldTimer = null;
var _deleteHoldInterval = null;
var _deleteInFlight = false;

function startDeleteHold() {
  if (_deleteInFlight || _deleteHoldInterval) return;
  var errEl = document.getElementById('deleteError');
  var delBtn = document.getElementById('deleteConfirmBtn');
  var label = document.getElementById('deleteConfirmLabel');
  var prog = document.getElementById('deleteConfirmProgress');
  if (!delBtn || delBtn.disabled) return;

  var email = document.getElementById('deleteEmail').value.trim();
  var pass = document.getElementById('deletePassword').value;

  var isGoogleUser = !!(typeof cu !== 'undefined' && cu && cu.provider === 'google');

  if (!email) {
    errEl.textContent = 'E-posta zorunludur.';
    errEl.style.display = 'block';
    return;
  }
  if (!isGoogleUser && !pass) {
    errEl.textContent = 'Şifrenizi girin.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  var elapsed = 0;
  var total = 5000;
  var step = 50;
  prog.style.transition = 'none';
  prog.style.width = '0%';
  label.textContent = 'Basılı tutun… (5s)';

  _deleteHoldInterval = setInterval(function () {
    elapsed += step;
    var pct = Math.min((elapsed / total) * 100, 100);
    prog.style.width = pct + '%';
    var remaining = Math.ceil((total - elapsed) / 1000);
    label.textContent = 'Basılı tutun… (' + remaining + 's)';
    if (elapsed >= total) {
      clearInterval(_deleteHoldInterval);
      _deleteHoldInterval = null;
      label.textContent = 'Siliniyor…';
      delBtn.disabled = true;
      confirmDeleteAccount(isGoogleUser, email, pass);
    }
  }, step);
}

function cancelDeleteHold() {
  if (_deleteHoldInterval) {
    clearInterval(_deleteHoldInterval);
    _deleteHoldInterval = null;
  }
  if (_deleteInFlight) return;
  var label = document.getElementById('deleteConfirmLabel');
  var prog = document.getElementById('deleteConfirmProgress');
  var delBtn = document.getElementById('deleteConfirmBtn');
  if (label) label.textContent = 'Hesabımı Kalıcı Olarak Sil';
  if (prog) prog.style.width = '0%';
  if (delBtn) delBtn.disabled = false;
}

async function confirmDeleteAccount(isGoogleUser, email, pass) {
  if (_deleteInFlight) return;
  _deleteInFlight = true;
  window._deletingAccount = true;
  clearTimeout(_saveTimer);
  _saveTimer = null;
  _saveWaiters.splice(0).forEach((resolve) => resolve(false));
  var err = document.getElementById('deleteError');
  try {
    var r = await window.electronAPI.deleteAccount({ password: pass });
    if (!r.success) throw Error(r.error);
    window._deletingAccount = true;
    cu = null;
    hist = [];
    bookmarkList = [];
    passwords = [];
    notes = [];
    hideDeleteAccountModal();
    updateAccountUI();
    renderBookmarks();
    toast(r.cleanupComplete ? 'Hesap ve yerel veriler silindi.' : r.error);
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    _deleteInFlight = false;
    window._deletingAccount = false;
    if (err) {
      err.textContent = e.message;
      err.style.display = 'block';
    }
    toast(e.message);
    cancelDeleteHold();
  }
}

// ── Hesap Silme butonu — basılı tut event'leri ──
(function () {
  var btn = document.getElementById('deleteConfirmBtn');
  if (!btn) return;
  btn.addEventListener('mousedown', function (e) {
    if (e.button === 0) startDeleteHold();
  });
  btn.addEventListener('mouseup', cancelDeleteHold);
  btn.addEventListener('mouseleave', cancelDeleteHold);
  btn.addEventListener(
    'touchstart',
    function (e) {
      e.preventDefault();
      startDeleteHold();
    },
    { passive: false },
  );
  btn.addEventListener('touchend', cancelDeleteHold);
  btn.addEventListener('touchcancel', cancelDeleteHold);
})();
