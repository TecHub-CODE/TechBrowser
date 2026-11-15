function updateMotion() {
  document.body.classList.toggle('motion-paused', document.hidden || !document.hasFocus());
}
document.addEventListener('visibilitychange', updateMotion);
window.addEventListener('blur', updateMotion);
window.addEventListener('focus', updateMotion);
updateMotion();
