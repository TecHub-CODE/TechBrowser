// ══════════════════════════════════════════
//  FIREBASE AUTH
// ══════════════════════════════════════════
var _fbInitialized = false;
var _pendingEmail = '';
var _fbAuthMod = null;

// E-posta 2FA durumu — kod renderer'da tutulmaz, main process'te doğrulanır
var _pending2FA = {};

async function doGoogleLogin() {
  setBtnLoading('googleBtn', true);
  try {
    var r = await window.electronAPI.openGoogleAuth({
      remember: document.getElementById('rememberGoogle').checked,
    });
    if (!r.success) throw Error(r.error);
    if (r.challengeId) {
      _pending2FA = { challengeId: r.challengeId };
      document.getElementById('otpEmailHint2fa').textContent =
        'Doğrulayıcı uygulamanızdaki kodu girin.';
      showAuthStep('otp2fa');
      return;
    }
    cu = r.user;
    await saveAllData();
    updateAccountUI();
    closeAllModals();
    toast('Giriş başarılı.');
    maybeOfferMisket();
  } catch (e) {
    toast(e.message);
  } finally {
    setBtnLoading('googleBtn', false);
  }
}

async function doLogin() {
  var email = document.getElementById('liU').value.trim(),
    password = document.getElementById('liP').value;
  document.getElementById('resendVerificationBtn').hidden = true;
  setBtnLoading('liBtn', true);
  try {
    var r = await window.electronAPI.invoke('auth-begin', {
      email,
      password,
      remember: document.getElementById('rememberMe').checked,
    });
    document.getElementById('liP').value = '';
    if (!r.success) {
      if (r.error === 'Önce e-posta adresinizi doğrulayın.') {
        document.getElementById('resendVerificationBtn').hidden = false;
        throw Error(
          'E-posta adresinizi doğrulayın. Bağlantıyı yeniden istemek için şifrenizi tekrar girin.',
        );
      }
      throw Error(r.error);
    }
    _pending2FA = { challengeId: r.challengeId };
    document.getElementById('otpEmailHint2fa').textContent =
      r.method === 'totp'
        ? 'Doğrulayıcı uygulamanızdaki kodu girin.'
        : email + ' adresine giriş kodu gönderildi.';
    showAuthStep('otp2fa');
  } catch (e) {
    showErr('liErr', e.message);
  } finally {
    setBtnLoading('liBtn', false);
  }
}

function tfaInput(inp, idx) {
  inp.value = inp.value.replace(/\D/, '');
  if (inp.value && idx < 5) document.getElementById('tfa' + (idx + 1)).focus();
  inp.classList.toggle('filled', !!inp.value);
}
function tfaKey(e, idx) {
  if (e.key === 'Backspace' && !e.target.value && idx > 0)
    document.getElementById('tfa' + (idx - 1)).focus();
  if (e.key === 'Enter') verify2FA();
}
function get2FAValue() {
  return [0, 1, 2, 3, 4, 5].map((i) => document.getElementById('tfa' + i).value).join('');
}

async function verify2FA() {
  setBtnLoading('tfaBtn', true);
  try {
    var r = await window.electronAPI.invoke('auth-finish', {
      challengeId: _pending2FA.challengeId,
      code: get2FAValue(),
    });
    if (!r.success) throw Error(r.error);
    cu = r.user;
    _pending2FA = {};
    await saveAllData();
    updateAccountUI();
    closeAllModals();
    toast('Giriş başarılı.');
    maybeOfferMisket();
  } catch (e) {
    showErr('tfaErr', e.message);
  } finally {
    setBtnLoading('tfaBtn', false);
  }
}

async function doRegister() {
  setBtnLoading('rgBtn', true);
  try {
    var r = await window.electronAPI.invoke('auth-register', {
      email: document.getElementById('rgE').value.trim(),
      password: document.getElementById('rgP').value,
      name: document.getElementById('rgN').value.trim(),
    });
    if (!r.success) throw Error(r.error);
    document.getElementById('rgP').value = '';
    document.getElementById('otpEmailHint').textContent =
      'E-postadaki bağlantıyla adresini doğrula, ardından giriş yap.';
    showAuthStep('otp');
  } catch (e) {
    showErr('rgErr', e.message);
  } finally {
    setBtnLoading('rgBtn', false);
  }
}
function verifyOtp() {
  showAuthStep('login');
  toast('Doğrulama bağlantısına tıkladıysan şimdi giriş yapabilirsin.');
}
function resendOtp() {
  showAuthStep('login');
  document.getElementById('resendVerificationBtn').hidden = false;
  toast('E-posta ve şifrenizi girerek doğrulama bağlantısını yeniden isteyebilirsiniz.');
}
async function resendVerification() {
  try {
    var r = await window.electronAPI.invoke('auth-resend-verification', {
      email: document.getElementById('liU').value.trim(),
      password: document.getElementById('liP').value,
    });
    if (!r.success) throw Error(r.error);
    toast('Doğrulama bağlantısı gönderildi.');
  } catch (e) {
    toast(e.message);
  }
}
async function sendResetCode() {
  try {
    var r = await window.electronAPI.invoke('auth-reset', {
      email: document.getElementById('frgE').value.trim(),
    });
    if (!r.success) throw Error(r.error);
    document.getElementById('frgSuc').textContent =
      'Şifre sıfırlama bağlantısı istendi. E-postanızı kontrol edin.';
    document.getElementById('frgSuc').classList.add('on');
  } catch (e) {
    showErr('frgErr', e.message);
  }
}

function doResetPassword() {
  showAuthStep('login');
}

async function doLogout() {
  try {
    var result = await window.electronAPI.invoke('auth-logout');
    if (!result.success) throw Error(result.error);
    cu = null;
    sessionStorage.removeItem('tb_google_login');
    await saveAllData();
    updateAccountUI();
    closeAllModals();
    toast('Çıkış yapıldı.');
  } catch (e) {
    toast('Çıkış tamamlanamadı: ' + e.message);
  }
}

function setBtnLoading(id, on) {
  var b = document.getElementById(id);
  if (!b) return;
  if (!b.dataset.orig) b.dataset.orig = b.textContent;
  b.disabled = on;
  b.style.opacity = on ? '0.6' : '1';
  b.textContent = on ? '⏳ Lütfen bekleyin...' : b.dataset.orig;
}
function showErr(id, msg) {
  var e = document.getElementById(id);
  if (!e) return;
  e.textContent = msg;
  e.classList.add('on');
}

function otpInput(inp, idx) {
  inp.value = inp.value.replace(/\D/, '');
  if (inp.value && idx < 5) document.getElementById('otp' + (idx + 1)).focus();
  inp.classList.toggle('filled', !!inp.value);
}
function otpKey(e, idx) {
  if (e.key === 'Backspace' && !e.target.value && idx > 0)
    document.getElementById('otp' + (idx - 1)).focus();
  if (e.key === 'Enter') verifyOtp();
}
function getOtpValue() {
  return [0, 1, 2, 3, 4, 5].map((i) => document.getElementById('otp' + i).value).join('');
}
function clearOtpInputs() {
  [0, 1, 2, 3, 4, 5].forEach((i) => {
    var el = document.getElementById('otp' + i);
    el.value = '';
    el.classList.remove('filled');
  });
}

// ══════════════════════════════════════════
//  AUTH STEPS
// ══════════════════════════════════════════
function showAuthStep(step) {
  const title = document.getElementById('authTitle');
  document.getElementById('authIntro').hidden = step !== 'login';
  if (title)
    title.textContent =
      {
        login: 'Hesabına giriş yap',
        otp: 'E-postanı doğrula',
        forgot: 'Şifreni sıfırla',
        reset: 'E-postanı kontrol et',
        otp2fa: 'Girişini doğrula',
      }[step] || 'Hesabım';
  ['authStepLogin', 'authStepOtp', 'authStepForgot', 'authStepReset', 'authStep2fa'].forEach(
    (id) => {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    },
  );
  if (step === 'login') {
    document.getElementById('authStepLogin').style.display = 'block';
    switchAuthTab('li');
  } else if (step === 'otp') document.getElementById('authStepOtp').style.display = 'block';
  else if (step === 'forgot') document.getElementById('authStepForgot').style.display = 'block';
  else if (step === 'reset') document.getElementById('authStepReset').style.display = 'block';
  else if (step === 'otp2fa') document.getElementById('authStep2fa').style.display = 'block';
}

function switchAuthTab(t) {
  document.getElementById('authIntro').hidden = false;
  document.getElementById('authIntro').textContent =
    t === 'li' ? 'Tekrar hoş geldin.' : 'TechBrowser’a hoş geldin.';
  const footer = document.getElementById('authSwitchHint');
  if (footer) footer.textContent = t === 'li' ? 'Henüz hesabın yok mu?' : 'Zaten hesabın var mı?';
  document.getElementById('liTab').hidden = t === 'li';
  document.getElementById('rgTab').hidden = t === 'rg';
  document.getElementById('authStepLogin').style.display = 'block';
  document.getElementById('authTitle').textContent =
    t === 'li' ? 'Hesabına giriş yap' : 'Hesap oluştur';
  document.getElementById('liForm').style.display = t === 'li' ? 'block' : 'none';
  document.getElementById('rgForm').style.display = t === 'rg' ? 'block' : 'none';
  document.getElementById('liTab').classList.toggle('active', t === 'li');
  document.getElementById('rgTab').classList.toggle('active', t === 'rg');
  ['liErr', 'rgErr'].forEach((id) => document.getElementById(id).classList.remove('on'));
}

function updateAccountUI() {
  if (cu) {
    var ini = cu.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
    document.getElementById('acName').textContent = cu.name;
    document.getElementById('acSub').textContent = '@' + cu.username;
    setAv('avatarSmall', 'avatarInit', cu.avatar, ini);
    setAv('accAvBig', 'accAvInit', cu.avatar, ini);
    document.getElementById('accNm').textContent = cu.name;
    document.getElementById('accEm').textContent = cu.email;
    var h = new Date().getHours();
    var g = h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi öğlenler' : 'İyi akşamlar';
    document.getElementById('ntGreet').innerHTML =
      g + ', <span>' + escHtml(cu.name.split(' ')[0]) + '!</span>';
  } else {
    document.getElementById('acName').textContent = 'TechAccount ile Giriş';
    document.getElementById('acSub').textContent = 'Kayıt ol veya giriş yap';
    document.getElementById('avatarSmall').innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>';
    document.getElementById('ntGreet').innerHTML = 'Hoş geldin.';
  }
}
function setAv(cid, iid, avatar, ini) {
  var e = document.getElementById(cid);
  if (avatar) {
    e.innerHTML = '<img src="' + escHtml(avatar) + '" alt="avatar">';
  } else {
    e.innerHTML = '<span id="' + iid + '">' + escHtml(ini) + '</span>';
  }
}
function handleAvatarUpload(input) {
  if (!input.files[0] || !cu) return;
  var file = input.files[0];
  if (
    file.size > 2 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  ) {
    toast('En fazla 2 MB boyutunda PNG, JPEG veya WebP seçin.');
    input.value = '';
    return;
  }
  var uid = cu.uid;
  var r = new FileReader();
  r.onload = async function (e) {
    if (cu?.uid !== uid) return;
    try {
      var result = await window.electronAPI.invoke('profile-save-avatar', {
        uid,
        avatar: e.target.result,
      });
      if (!result.success) throw Error(result.error);
      if (cu?.uid === uid) {
        cu = result.user;
        updateAccountUI();
        toast('Profil fotoğrafı bu cihazda kaydedildi.');
      }
    } catch (error) {
      toast('Fotoğraf kaydedilemedi: ' + error.message);
    } finally {
      input.value = '';
    }
  };
  r.onerror = function () {
    toast('Resim okunamadı.');
    input.value = '';
  };
  r.readAsDataURL(file);
}

// ══════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════
function openOverlay() {
  document.getElementById('overlay').classList.add('on');
}
function closeAllModals() {
  if (typeof destroyMisket === 'function') destroyMisket();
  document.getElementById('mfaSetup')?.remove();
  document.getElementById('overlay').classList.remove('on');
  document.querySelectorAll('.modal').forEach((m) => m.classList.remove('on'));
}
function openModal(id) {
  openOverlay();
  document.getElementById(id).classList.add('on');
}
function cancel2FA() {
  _pending2FA = { email: '', pass: '', remember: false };

  showAuthStep('login');
}
function closeAuthModal() {
  if (_pending2FA.email) cancel2FA();
  closeAllModals();
}

// ESC ile modal kapatma — capture phase, input'lardan önce yakalar
window.addEventListener(
  'keydown',
  function (e) {
    if (e.key === 'Escape') {
      var anyModal = document.querySelector('.modal.on');
      if (anyModal) {
        e.preventDefault();
        e.stopPropagation();
        closeAuthModal();
      }
    }
  },
  true,
);

function openAccountModal() {
  if (!cu) {
    document.getElementById('resendVerificationBtn').hidden = true;
    showAuthStep('login');
    switchAuthTab('li');
    openModal('authModal');
  } else {
    openModal('accountModal');
  }
}

document.getElementById('liU').addEventListener('input', () => {
  document.getElementById('resendVerificationBtn').hidden = true;
});

// Shared social sign-in keeps the same OAuth handler on both account screens.
(() => {
  const step = document.getElementById('authStepLogin');
  const tabs = step.querySelector('.auth-tabs');
  const google = document.getElementById('googleBtn');
  const remember = document.getElementById('rememberGoogle').closest('label');
  const divider = step.querySelector('[data-layout="static-32"]');
  const social = document.createElement('div');
  social.className = 'auth-social';
  social.append(google, remember);
  step.prepend(social, divider);
  const hint = document.createElement('span');
  hint.id = 'authSwitchHint';
  hint.textContent = 'Henüz hesabın yok mu?';
  tabs.prepend(hint);
  tabs.classList.add('auth-switch');
  step.append(tabs);
  document.getElementById('liTab').hidden = true;
})();
