// history panel: rendering and its user actions.
function renderHistory() {
  var show = hist.slice(0, 60);
  document.getElementById('spBody').innerHTML =
    (!cfg.saveHistory ? '<div data-panel-style="panel-42">⚠ Geçmişi kaydet kapalı.</div>' : '') +
    '<div class="spsec">SON ZİYARETLER</div>' +
    (show.length === 0
      ? '<div class="studio-empty"><svg class="icon"><use href="#i-clock"/></svg><strong>Yeni keşiflere hazır</strong><p>Ziyaret ettiğiniz sayfalar burada listelenir.</p></div>'
      : show
          .map(
            (i) =>
              '<div class="hi" data-action="visit-history" data-value="' +
              encodeInline(i.url) +
              '"><span class="hi-ic"><svg class="icon"><use href="#i-globe"/></svg></span><div class="hi-main"><div class="hi-t">' +
              escHtml(i.title) +
              '</div><div class="hi-u">' +
              escHtml(i.url) +
              '</div></div><span class="hi-tm">' +
              escHtml(i.time) +
              '</span></div>',
          )
          .join('')) +
    '<div data-panel-style="panel-43"></div>' +
    '<button data-action="clear-history" data-panel-style="panel-44"  >Geçmişi Temizle</button>';
}

function clearHist() {
  hist = [];
  saveAllData();
  toast('Geçmiş temizlendi');
  renderHistory();
}
