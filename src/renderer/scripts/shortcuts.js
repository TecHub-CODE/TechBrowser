// ══════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
document.addEventListener('keydown', function (e) {
  var mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 't') {
    e.preventDefault();
    newTab();
  }
  if (mod && e.key === 'k') {
    e.preventDefault();
    openCmd();
  }
  if (mod && e.key === 'r') {
    e.preventDefault();
    reload();
  }
  if (mod && e.key === 'f') {
    e.preventDefault();
    toggleFind();
  }
  if (mod && e.key === 'l') {
    e.preventDefault();
    document.getElementById('addr').focus();
  }
  if (mod && e.key === 'w') {
    e.preventDefault();
    var a = document.querySelector('.tab.active');
    if (a) closeTab(e, a.querySelector('.tab-x'));
  }
  if (mod && e.key === 'h') {
    e.preventDefault();
    openPanel('history');
  }
  if (mod && e.key === 'd') {
    e.preventDefault();
    bookmark();
  }
  if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
    e.preventDefault();
    toggleIncognito();
  }
  if (mod && (e.key === '+' || e.key === '=')) {
    e.preventDefault();
    zoomIn();
  }
  if (mod && e.key === '-') {
    e.preventDefault();
    zoomOut();
  }
  if (e.key === 'Escape') {
    closeAllModals();
    closeSpanel();
    closeCtx();
    if (findOpen) toggleFind();
  }
  if (e.key === 'F5') {
    e.preventDefault();
    reload();
  }
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    navBack();
  }
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    navFwd();
  }
});

// Find bar buttons
document.getElementById('findPrev').onclick = () => findInPage(-1);
document.getElementById('findNext').onclick = () => findInPage(1);

var TB_LOGO = '../../assets/techbrowser-logo.png';
// Logo yerleştir
(function () {
  var imgs = ['tbLogoImg', 'authLogoImg'];
  imgs.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.src = TB_LOGO;
  });
})();
init();

// ══════════════════════════════════════════
// Bayram sistemi kaldırıldı.
