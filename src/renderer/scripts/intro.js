var introTimeout = setTimeout(skipIntro, 30000);
function skipIntro() {
  clearTimeout(introTimeout);
  var overlay = document.getElementById('introOverlay');
  if (!overlay || overlay.dataset.leaving) return;
  overlay.dataset.leaving = 'true';
  var v = document.getElementById('introVideo');
  if (v) {
    v.onended = null;
    v.onerror = null;
    v.pause();
  }
  document.body.classList.add('studio-arriving');
  overlay.classList.add('studio-leaving');
  var duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1250;
  setTimeout(function () {
    if (v) {
      v.removeAttribute('src');
      v.load();
    }
    overlay.remove();
  }, duration);
  setTimeout(function () {
    document.body.classList.remove('studio-arriving');
  }, 1900);
}
