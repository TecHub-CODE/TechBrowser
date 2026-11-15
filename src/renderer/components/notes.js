// notes panel: rendering and its user actions.
function saveNotes(next = notes) {
  if (window._deletingAccount) throw Error('Hesap silinirken not kaydedilemez.');
  localStorage.setItem('tb_notes', JSON.stringify(next));
  notes = next;
}

function renderNotes() {
  if (editingNote !== null) {
    renderNoteEditor();
    return;
  }
  var html = '<button data-action="new-note" data-panel-style="panel-45">+ Yeni Not</button>';
  html += '<div class="spsec">NOTLAR (' + notes.length + ')</div>';
  if (notes.length === 0) {
    html +=
      '<div class="studio-empty"><svg class="icon"><use href="#i-book"/></svg><strong>Bir fikri yakalayın</strong><p>İlk notunuzu yukarıdaki alandan ekleyin.</p></div>';
  } else {
    notes.forEach(function (n, i) {
      html +=
        '<div class="note-item" data-action="edit-note" data-value="' +
        i +
        '">' +
        '<div data-panel-style="panel-46">' +
        '<div class="note-title">' +
        escHtml(n.title || 'Başlıksız') +
        '</div>' +
        '<button data-action="delete-note" data-value="' +
        i +
        '" data-panel-style="panel-47"><svg class="icon" data-panel-style="panel-48"><use href="#i-x"/></svg></button>' +
        '</div>' +
        '<div class="note-preview">' +
        escHtml((n.body || '').substring(0, 60)) +
        '</div>' +
        '<div class="note-date">' +
        escHtml(n.date) +
        '</div>' +
        '</div>';
    });
  }
  document.getElementById('spBody').innerHTML = html;
}

function newNote() {
  editingNote = { title: '', body: '', date: new Date().toLocaleDateString('tr'), isNew: true };
  renderNoteEditor();
}

function editNote(i) {
  editingNote = { ...notes[i], idx: i };
  renderNoteEditor();
}

function renderNoteEditor() {
  var n = editingNote;
  document.getElementById('spBody').innerHTML =
    '<div class="note-editor">' +
    '<button data-action="back-notes" data-panel-style="panel-49">← Geri</button>' +
    '<input id="noteTitleInp" placeholder="Not başlığı..." value="' +
    escHtml(n.title || '') +
    '"/>' +
    '<textarea id="noteBodyInp" placeholder="Notunuzu yazın...">' +
    escHtml(n.body || '') +
    '</textarea>' +
    '<button data-action="save-note" data-panel-style="panel-50"><svg class="icon" data-panel-style="panel-51"><use href="#i-save"/></svg>Kaydet</button>' +
    '</div>';
}

function saveNote() {
  var title = document.getElementById('noteTitleInp').value.trim() || 'Başlıksız';
  var body = document.getElementById('noteBodyInp').value;
  const note = { title, body, date: new Date().toLocaleDateString('tr') };
  const next = editingNote.isNew
    ? [note, ...notes]
    : notes.map((item, index) => (index === editingNote.idx ? note : item));
  try {
    saveNotes(next);
    editingNote = null;
    renderNotes();
    toast('▨ Not kaydedildi');
  } catch {
    toast('Not kaydedilemedi. Yazdıklarınız açık tutuluyor; yeniden deneyin.');
  }
}

function deleteNote(i) {
  try {
    saveNotes(notes.filter((_, index) => index !== i));
    renderNotes();
    toast('Not silindi');
  } catch {
    toast('Not silinemedi; mevcut kayıt korundu.');
  }
}

function backToNotes() {
  editingNote = null;
  renderNotes();
}
