// passwords panel: rendering and its user actions.
async function savePw(next = passwords) {
  if (window._passwordReadFailed) throw Error('Şifreler okunamadığından kayıt engellendi.');
  const result = await window.electronAPI.savePasswords(next);
  if (!result.success) throw Error(result.error || 'Şifreler kaydedilemedi.');
}

async function loadPasswords() {
  try {
    passwords = await window.electronAPI.loadPasswords();
    if (curPanel === 'passwords') renderPasswords();
  } catch (e) {
    window._passwordReadFailed = true;
    toast('Şifreler yüklenemedi; mevcut dosya korunuyor.');
  }
}

function renderPasswords() {
  var html =
    '<div class="spsec">YENİ EKLE</div>' +
    '<div class="pw-add-form">' +
    '<input id="pwSite" placeholder="Site (örn: github.com)"/>' +
    '<input id="pwUser" placeholder="Kullanıcı adı / E-posta"/>' +
    '<input id="pwPass" type="password" placeholder="Şifre"/>' +
    '<button class="btn-pr" data-panel-style="panel-52" data-action="add-password">+ Ekle</button>' +
    '</div>' +
    '<div class="spsec">KAYITLI (' +
    passwords.length +
    ')</div>';
  if (passwords.length === 0) {
    html +=
      '<div class="studio-empty"><svg class="icon"><use href="#i-lock"/></svg><strong>Şifreleriniz için bir yer</strong><p>Eklediğiniz giriş bilgilerini buradan yönetebilirsiniz.</p></div>';
  } else {
    passwords.forEach(function (p, i) {
      html +=
        '<div class="pw-row">' +
        '<div class="pw-ic"><svg class="icon"><use href="#i-key"/></svg></div>' +
        '<div class="pw-inf"><div class="pw-site">' +
        escHtml(p.site) +
        '</div><div class="pw-user">' +
        escHtml(p.user) +
        '</div></div>' +
        '<div class="pw-actions">' +
        '<button class="pw-btn" data-action="copy-user" data-value="' +
        i +
        '" title="Kullanıcı adını kopyala"><svg class="icon"><use href="#i-at"/></svg></button>' +
        '<button class="pw-btn" data-action="copy-password" data-value="' +
        i +
        '" title="Şifreyi kopyala"><svg class="icon"><use href="#i-copy"/></svg></button>' +
        '<button class="pw-btn" data-action="delete-password" data-value="' +
        i +
        '" title="Sil" data-panel-style="panel-53"><svg class="icon"><use href="#i-x"/></svg></button>' +
        '</div></div>';
    });
  }
  document.getElementById('spBody').innerHTML = html;
}

async function addPassword() {
  const site = document.getElementById('pwSite').value.trim(),
    user = document.getElementById('pwUser').value.trim(),
    pass = document.getElementById('pwPass').value;
  if (!site || !user || !pass) return toast('Tüm alanları doldurun.');
  const next = [{ site, user, pass, date: new Date().toLocaleDateString('tr') }, ...passwords];
  try {
    await savePw(next);
    passwords = next;
    renderPasswords();
    toast('Şifre kaydedildi.');
  } catch (e) {
    toast(e.message);
  }
}

function copyPwUser(i) {
  navigator.clipboard.writeText(passwords[i].user);
  toast('◔ Kullanıcı adı kopyalandı');
}

function copyPwPass(i) {
  navigator.clipboard.writeText(passwords[i].pass);
  toast('▤ Şifre kopyalandı');
}

async function deletePw(i) {
  try {
    const next = passwords.filter((_, index) => index !== i);
    await savePw(next);
    passwords = next;
    renderPasswords();
    toast('Şifre silindi.');
  } catch (e) {
    toast(e.message);
  }
}
