// ══════════════════════════════════════════
//  COMMAND PALETTE (Ctrl+K)
// ══════════════════════════════════════════
var cmdIdx = 0;
var CMD_ACTIONS = [
  {
    ic: '⌂',
    title: 'Yeni Sekme Aç',
    sub: 'Ctrl+T',
    action: () => {
      newTab();
    },
  },
  {
    ic: '◍',
    title: 'Gizli Mod',
    sub: 'Ctrl+Shift+N',
    action: () => {
      toggleIncognito();
    },
  },
  {
    ic: '❐',
    title: 'Okuyucu Modu',
    sub: '',
    action: () => {
      toggleReader();
    },
  },
  {
    ic: '↓',
    title: 'İndirmeler',
    sub: '',
    action: () => {
      openPanel('downloads');
    },
  },
  {
    ic: '◷',
    title: 'Geçmiş',
    sub: 'Ctrl+H',
    action: () => {
      openPanel('history');
    },
  },
  {
    ic: '⬠',
    title: 'Uzantılar',
    sub: '',
    action: () => {
      openPanel('ext');
    },
  },
  {
    ic: '⚙',
    title: 'Ayarlar',
    sub: '',
    action: () => {
      openPanel('settings');
    },
  },
  {
    ic: '⬢',
    title: 'VPN Aç/Kapat',
    sub: '',
    action: () => {
      toggleVpn();
      closeCmd();
    },
  },
  {
    ic: '⌕',
    title: 'Sayfada Bul',
    sub: 'Ctrl+F',
    action: () => {
      toggleFind();
    },
  },
  {
    ic: '<img src="https://www.google.com/s2/favicons?domain=github.com&sz=32" data-panel-style="panel-13">',
    title: "GitHub'a Git",
    sub: '',
    action: () => {
      newTab(false, 'https://github.com');
    },
  },
  {
    ic: '<img src="https://www.google.com/s2/favicons?domain=youtube.com&sz=32" data-panel-style="panel-13">',
    title: "YouTube'a Git",
    sub: '',
    action: () => {
      newTab(false, 'https://youtube.com');
    },
  },
  {
    ic: '<img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=32" data-panel-style="panel-13">',
    title: "Claude.ai'ya Git",
    sub: '',
    action: () => {
      newTab(false, 'https://claude.ai');
    },
  },
  {
    ic: '<img src="https://www.google.com/s2/favicons?domain=figma.com&sz=32" data-panel-style="panel-13">',
    title: "Figma'ya Git",
    sub: '',
    action: () => {
      newTab(false, 'https://figma.com');
    },
  },
  {
    ic: '<img src="https://www.google.com/s2/favicons?domain=notion.so&sz=32" data-panel-style="panel-13">',
    title: "Notion'a Git",
    sub: '',
    action: () => {
      newTab(false, 'https://notion.so');
    },
  },
];
function openCmd() {
  document.getElementById('cmdOverlay').classList.add('on');
  document.getElementById('cmdBox').style.display = 'block';
  document.getElementById('cmdInput').value = '';
  filterCmd('');
  setTimeout(() => document.getElementById('cmdInput').focus(), 50);
}
function closeCmd() {
  document.getElementById('cmdOverlay').classList.remove('on');
  document.getElementById('cmdBox').style.display = 'none';
}
function filterCmd(q) {
  cmdIdx = 0;
  var lower = q.toLowerCase();
  var tabItems = Object.entries(tabData)
    .map(([id, td]) => ({
      ic: '▦',
      title: td.title || 'Yeni Sekme',
      sub: td.url || 'techbrowser://newtab',
      action: function () {
        var t = document.querySelector('.tab[data-id="' + id + '"]');
        if (t) selectTab(t);
        closeCmd();
      },
    }))
    .filter(
      (t) => !q || t.title.toLowerCase().includes(lower) || t.sub.toLowerCase().includes(lower),
    )
    .slice(0, 4);
  var actItems = CMD_ACTIONS.filter((a) => !q || a.title.toLowerCase().includes(lower)).slice(0, 7);
  var urlItem = null;
  if (q && (q.includes('.') || q.startsWith('http'))) {
    urlItem = {
      ic: '◎',
      title: 'Git: ' + q,
      sub: 'Yeni sekmede aç',
      action: () => {
        newTab(false, q);
        closeCmd();
      },
    };
  }
  window._commandActions = [];
  var html = '';
  if (tabItems.length) {
    html += '<div class="cmd-section">AÇIK SEKMELER</div>';
    tabItems.forEach((item, i) => {
      html +=
        '<div class="cmd-item' +
        (i === 0 && !html.match('selected') ? ' selected' : '') +
        '" data-command="' +
        (window._commandActions.push(item.action) - 1) +
        '"><div class="cmd-item-ic">' +
        item.ic +
        '</div><div class="cmd-item-info"><div class="cmd-item-title">' +
        escHtml(item.title) +
        '</div><div class="cmd-item-sub">' +
        escHtml(item.sub) +
        '</div></div></div>';
    });
  }
  if (actItems.length) {
    html += '<div class="cmd-section">KOMUTLAR</div>';
    actItems.forEach((item, i) => {
      var sel = tabItems.length + i === 0 && !tabItems.length ? 'selected' : '';
      html +=
        '<div class="cmd-item ' +
        sel +
        '" data-command="' +
        (window._commandActions.push(item.action) - 1) +
        '"><div class="cmd-item-ic">' +
        item.ic +
        '</div><div class="cmd-item-info"><div class="cmd-item-title">' +
        escHtml(item.title) +
        '</div></div>' +
        (item.sub ? '<span class="cmd-item-kbd">' + escHtml(item.sub) + '</span>' : '') +
        '</div>';
    });
  }
  if (urlItem)
    html +=
      '<div class="cmd-section">ADRES</div><div class="cmd-item" data-command="' +
      (window._commandActions.push(urlItem.action) - 1) +
      '"><div class="cmd-item-ic">' +
      urlItem.ic +
      '</div><div class="cmd-item-info"><div class="cmd-item-title">' +
      escHtml(urlItem.title) +
      '</div><div class="cmd-item-sub">' +
      escHtml(urlItem.sub) +
      '</div></div></div>';
  if (!html) html = '<div data-panel-style="panel-14">Sonuç bulunamadı</div>';
  document.getElementById('cmdResults').innerHTML = html;
  document
    .querySelectorAll('[data-command]')
    .forEach((el) => (el.onclick = window._commandActions[Number(el.dataset.command)]));
}
function handleCmdKey(e) {
  var items = document.querySelectorAll('.cmd-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdIdx = Math.min(cmdIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdIdx = Math.max(cmdIdx - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items[cmdIdx]) items[cmdIdx].click();
    return;
  } else if (e.key === 'Escape') {
    closeCmd();
    return;
  }
  items.forEach((item, i) => item.classList.toggle('selected', i === cmdIdx));
  if (items[cmdIdx]) items[cmdIdx].scrollIntoView({ block: 'nearest' });
}

// ══════════════════════════════════════════
//  ŞİFRE YÖNETİCİSİ
//  ⬢ Şifreler düz metin localStorage'da DEĞİL, main process'te
//     AES-256-GCM ile şifrelenmiş dosyada saklanır.
// ══════════════════════════════════════════
var passwords = [];

// ══════════════════════════════════════════
//  ÇEVİRİ
// ══════════════════════════════════════════
var translateOn = false;
function translatePage() {
  var td = tabData[activeTabId];
  if (!td || !td.wv) {
    toast('⚠ Önce bir sayfa aç');
    return;
  }
  if (!translateOn) {
    var url = td.url || '';
    if (url && !url.startsWith('techbrowser://')) {
      var translateUrl =
        'https://translate.google.com/translate?sl=auto&tl=tr&u=' + encodeInline(url);
      td.wv.src = translateUrl;
      translateOn = true;
      document.getElementById('translateBtn').classList.add('lit');
      toast('◎ Sayfa Türkçeye çevriliyor...');
    }
  } else {
    var origUrl = td.url || '';
    // Google translate URL'sinden orijinali çıkar
    var match = origUrl.match(/[?&]u=([^&]+)/);
    if (match) {
      td.wv.src = decodeURIComponent(match[1]);
    }
    translateOn = false;
    document.getElementById('translateBtn').classList.remove('lit');
    toast('Çeviri kapatıldı');
  }
}

// ══════════════════════════════════════════
//  NOTLAR
// ══════════════════════════════════════════
var notes = readLocalJSON('tb_notes', []);
var editingNote = null;
