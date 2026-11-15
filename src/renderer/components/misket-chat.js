// The chat owns one bounded WebGL preview; toolbar icons stay static.
let misketChatGL = null;
const chatMisketOptions = {
  variant: 'aurora',
  color: '#7c5cff',
  eyeColor: '#fafafa',
  motion: true,
};
const chatMisketFace =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="currentColor"/><path d="M12 12v6m8-6v6" stroke="var(--bg)" stroke-width="2.5" stroke-linecap="round"/></svg>';
const chatMisketHost = document.createElement('div');
chatMisketHost.className = 'misket-chat-character misket-preview';
chatMisketHost.innerHTML =
  '<div class="misket-fallback">' +
  misketSvg(chatMisketOptions) +
  '</div><canvas aria-label="Misket"></canvas><img class="misket-chat-badge" src="../../assets/techhub-misket-badge.png" alt="TechHub Studio arması" />';
document.getElementById('aiMisketHome').append(chatMisketHost);
document.getElementById('aiBtn').innerHTML = chatMisketFace;
document.getElementById('aiBtn').setAttribute('aria-label', 'Misket');
document.querySelector('.ai-dot').innerHTML = chatMisketFace;
function syncMisketChat() {
  if (!aiOpen) {
    misketChatGL?.destroy();
    misketChatGL = null;
    return;
  }
  if (!misketChatGL) {
    const old = chatMisketHost.querySelector('canvas'),
      canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Misket');
    old.replaceWith(canvas);
    misketChatGL = createMisketGL(canvas, chatMisketOptions, (ready) =>
      chatMisketHost.classList.toggle('has-gl', ready),
    );
  }
}
function dockMisketChat() {
  document.getElementById('aiMisketDock').append(chatMisketHost);
}
document.getElementById('aiPanel').addEventListener('pointermove', (event) => {
  if (!aiOpen || !misketChatGL) return;
  const box = chatMisketHost.getBoundingClientRect();
  misketChatGL.setLook(
    (event.clientX - box.x - box.width / 2) / 250,
    -(event.clientY - box.y - box.height / 2) / 250,
  );
});
document
  .getElementById('aiPanel')
  .addEventListener('pointerleave', () => misketChatGL?.setLook(0, 0.08));
document.addEventListener('visibilitychange', () =>
  document.getElementById('aiPanel').classList.toggle('chat-suspended', document.hidden),
);
window.addEventListener('blur', () =>
  document.getElementById('aiPanel').classList.add('chat-suspended'),
);
window.addEventListener('focus', () =>
  document.getElementById('aiPanel').classList.remove('chat-suspended'),
);
