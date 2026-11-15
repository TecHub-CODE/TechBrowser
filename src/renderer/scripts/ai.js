// ══════════════════════════════════════════
//  AI PANELİ
// ══════════════════════════════════════════
var aiOpen = false;
var aiHistory = [];
var aiKeys = {}; // Only booleans indicating configured providers; never stored keys.
var aiBusy = false;
var aiReady = false;
var aiHosted = false;
var aiModel = localStorage.getItem('tb_ai_model') || 'groq';

var AI_MODELS = {
  groq: { name: 'Misket', tag: 'Misket', color: '#4f8cff' },
  chatgpt: { name: 'ChatGPT', tag: 'OpenAI', color: '#10a37f' },
  claude: { name: 'Claude', tag: 'Claude', color: '#d4a27f' },
  gemini: { name: 'Gemini', tag: 'Gemini', color: '#4285f4' },
};
if (!AI_MODELS[aiModel]) aiModel = 'groq';

async function initAiKeys() {
  try {
    var legacy = localStorage.getItem('tb_ai_keys');
    var result =
      legacy === null
        ? await window.electronAPI.invoke('ai-status')
        : await window.electronAPI.invoke('ai-migrate-keys', JSON.parse(legacy));
    if (!result.success) throw Error(result.error);
    aiKeys = result.configured;
    aiHosted = result.hosted === true;
    if (legacy !== null) localStorage.removeItem('tb_ai_keys');
    aiReady = true;
  } catch (error) {
    toast('AI anahtarları yüklenemedi; mevcut kayıt korundu. ' + error.message);
  }
  renderAiKeyBar();
  updateAiSendBtn();
}

function toggleAiPanel() {
  aiOpen = !aiOpen;
  var panel = document.getElementById('aiPanel');
  var btn = document.getElementById('aiBtn');
  panel.classList.toggle('on', aiOpen);
  syncMisketChat();
  btn.style.color = aiOpen ? 'var(--ac)' : '';
  if (aiOpen) {
    renderAiKeyBar();
    document.getElementById('aiModelSelect').value = aiModel;
    updateAiSendBtn();
  }
}

function onAiModelChange() {
  if (aiBusy) return;
  aiModel = document.getElementById('aiModelSelect').value;
  document.getElementById('aiKeyInput').value = '';
  localStorage.setItem('tb_ai_model', aiModel);
  renderAiKeyBar();
  updateAiSendBtn();
}

function renderAiKeyBar() {
  var bar = document.getElementById('aiKeyBar');
  var hint = document.getElementById('aiKeyHint');
  if (aiModel === 'groq') {
    if (bar) bar.style.display = aiHosted ? 'none' : 'flex';
    const input = document.getElementById('aiKeyInput');
    if (input)
      input.placeholder = aiKeys.groq
        ? 'Yeni Groq anahtarıyla değiştir…'
        : 'Groq API anahtarı (gsk_…)';
    if (hint) {
      hint.textContent = aiHosted
        ? 'Doğrulanmış hesabınızla günde 50 mesaj. Haklar Türkiye saatiyle 00.00’da yenilenir. Mesajlarınız Groq tarafından işlenir.'
        : aiKeys.groq
          ? 'Anahtar kayıtlı; bağlantı ilk mesajda denenir. Mesajlarınız Groq ile paylaşılır.'
          : 'Groq anahtarını yukarıdaki alana yapıştırıp Kaydet’e basın. Anahtar bu cihazda şifreli saklanır.';
      hint.style.color = '';
    }
    return;
  }
  if (bar) bar.style.display = 'flex';
  if (hint) {
    hint.textContent =
      'Anahtar cihazda şifreli saklanır. İstekler ve anahtar yalnızca seçtiğiniz AI sağlayıcısına gönderilir.';
    hint.style.color = '';
  }
  var key = aiKeys[aiModel] || '';
  var input = document.getElementById('aiKeyInput');
  if (input) input.placeholder = key ? '••••••••••••••••' : getKeyPlaceholder();
}

function getKeyPlaceholder() {
  if (aiModel === 'groq') return 'gsk_… (console.groq.com)';
  if (aiModel === 'chatgpt') return 'sk-... (platform.openai.com)';
  if (aiModel === 'claude') return 'sk-ant-... (console.anthropic.com)';
  if (aiModel === 'gemini') return 'AI... (aistudio.google.com)';
  return 'API Key girin...';
}

async function saveAiKey() {
  if (!aiReady) {
    await initAiKeys();
    if (!aiReady) return;
  }
  var provider = aiModel;
  var val = document.getElementById('aiKeyInput').value;
  if (!val) {
    toast('⚠ API key boş olamaz');
    return;
  }
  try {
    var result = await window.electronAPI.invoke('ai-save-key', { provider, key: val });
    if (!result.success) throw Error(result.error);
    aiKeys = result.configured;
    aiHosted = result.hosted === true;
    document.getElementById('aiKeyInput').value = '';
    renderAiKeyBar();
    updateAiSendBtn();
    toast(AI_MODELS[provider].name + ' API anahtarı şifreli kaydedildi.');
  } catch (error) {
    toast('Anahtar kaydedilemedi: ' + error.message);
  }
}

function updateAiSendBtn() {
  var hasKey = aiReady && !!aiKeys[aiModel];
  var btn = document.getElementById('aiSendBtn');
  if (btn) btn.disabled = !hasKey || aiBusy;
  document.getElementById('aiPanel')?.classList.toggle('ai-busy', aiBusy);
  const status = document.getElementById('aiComposeStatus');
  if (status) status.textContent = aiBusy ? 'Yanıt hazırlanıyor…' : 'Ctrl+Enter ile gönder';
  var input = document.getElementById('aiInput');
  if (input) input.disabled = !hasKey || aiBusy;
  var select = document.getElementById('aiModelSelect');
  if (select) select.disabled = aiBusy;
  if (input)
    input.placeholder = hasKey ? 'Misket’e bir şey sor…' : 'Önce bir AI sağlayıcısı yapılandırın';
}

function onAiKey(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
    e.preventDefault();
    sendAiMessage();
  }
}

function autoResizeAi(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

async function sendAiMessage() {
  if (aiBusy || !aiReady) return;
  var input = document.getElementById('aiInput');
  var text = input.value.trim();
  if (!text) return;
  if (!aiKeys[aiModel]) {
    toast('Önce bu AI sağlayıcısını yapılandırın.');
    return;
  }
  aiBusy = true;
  var provider = aiModel;

  input.value = '';
  input.style.height = 'auto';
  updateAiSendBtn();

  // Kullanıcı mesajı ekle
  aiHistory.push({ role: 'user', content: text });
  appendAiMsg('user', text);

  // Loading
  var loadId = 'ai-load-' + Date.now();
  appendAiMsg('assistant', '...', loadId, true);

  try {
    var response = await window.electronAPI.invoke('ai-query', {
      provider,
      messages: aiHistory
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content })),
    });
    if (!response.success) throw Error(response.error);
    var reply = response.reply;

    // Loading mesajını değiştir
    var loadEl = document.getElementById(loadId);
    if (loadEl) {
      loadEl.querySelector('.ai-msg-text').textContent = reply;
      loadEl.classList.remove('loading');
    }

    aiHistory.push({ role: 'assistant', content: reply });
  } catch (e) {
    aiHistory.pop();
    var loadEl = document.getElementById(loadId);
    if (loadEl) {
      loadEl.querySelector('.ai-msg-text').textContent = 'Yanıt alınamadı: ' + e.message;
      loadEl.classList.remove('loading');
    }
  }

  aiBusy = false;
  updateAiSendBtn();
  var msgs = document.getElementById('aiMessages');
  msgs.scrollTop = msgs.scrollHeight;
}

function appendAiMsg(role, text, id, loading) {
  var msgs = document.getElementById('aiMessages');
  // Welcome mesajını kaldır
  var welcome = msgs.querySelector('.ai-welcome');
  if (welcome) {
    dockMisketChat();
    welcome.remove();
  }

  var m = AI_MODELS[aiModel];
  var div = document.createElement('div');
  div.className = 'ai-msg ' + role + (loading ? ' loading' : '');
  if (id) div.id = id;
  if (role === 'assistant') {
    div.innerHTML =
      '<div class="ai-model-tag" style="color:' +
      m.color +
      '">' +
      m.tag +
      '</div><div class="ai-msg-text">' +
      escHtml(text) +
      '</div>';
  } else {
    div.innerHTML = '<div class="ai-msg-text">' + escHtml(text) + '</div>';
  }
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function escHtml(t) {
  return String(t ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
function encodeInline(t) {
  return encodeURIComponent(String(t)).replace(/'/g, '%27');
}

// Anahtarlar ve sağlayıcı çağrıları src/ai-service.js içinde yönetilir.
