# Arayüz dosyaları

`index.html` tarayıcının pencere iskeletini, panellerini, iletişim kutularını ve SVG simgelerini içerir. Gömülü büyük görsel `assets/embedded-*.png` dosyasına çıkarıldı.

## JavaScript

`scripts/` altındaki dosyalar HTML'deki sırayla yüklenir:

| Dosya            | Sorumluluk                                          |
| ---------------- | --------------------------------------------------- |
| intro.js         | Açılış videosu                                      |
| state.js         | Ortak durum, varsayılan ayarlar ve sabitler         |
| app.js           | Açılışta veri yükleme ve kullanım koşulları         |
| account.js       | Giriş, hesap ve temel iletişim kutuları             |
| browser.js       | Sayfalar, gezinme, sekmeler, bulma ve proxy arayüzü |
| interface.js     | Panel yönlendirmesi, bildirimler, yerel veri kaydı  |
| ai.js            | AI paneli; anahtar değerlerini geri okumaz          |
| tools.js         | Komut paleti, çeviri ve ortak araç durumu           |
| shortcuts.js     | Kısayollar ve uygulama başlangıcı                   |
| updates.js       | Güncelleme arayüzü                                  |
| diagnostics.js   | Sürüm bilgisi ve hız testi                          |
| support.js       | Sorun bildirimi ve hesap silme                      |
| motion-boot.js   | Açılıştaki hareket ayarları                         |
| markup-events.js | Statik HTML öğelerinin `data-ui` olay bağlantıları  |

`features.js`, `atelier.js` ve `studio-motion.js` mevcut özellik dosyalarıdır. `atelier.js`, `studio-motion.js` ve `markup-events.js` ertelenerek yüklenir. Statik HTML'deki 148 olay bağlantısı `markup-events.js` içine alındı; aynı öğeye ait olaylar aynı `data-ui` değerini kullanır. Fonksiyonlara olay ve öğe bağlamı aktarılır. Dosyalar henüz bağımsız ES modülleri değildir; yükleme sırası önemlidir. Dinamik HTML olayları da kaldırılmıştır: panel-actions.js, izinli data-action/data-input adlarını açık bir işlem listesine bağlar. Arayüz CSP kuralı script-src self ile HTML içinden kod çalıştırmayı engeller. Tema rengi, ilerleme ve konum gibi hesaplanan stiller çalışma sırasında uygulanır.

## Paneller

components/ altında history.js, downloads.js, extensions.js, settings.js,
passwords.js ve notes.js bulunur. Her dosya ilgili panelin çizimini ve
kullanıcı işlemlerini içerir. Yükleme sırası index.html içinde açıktır.
Tarayıcı çekirdeğiyle uyumluluk için ortak durum hâlâ state.js ve ana
başlangıç dosyalarından okunur; bu ayrım bağımsız ES modülü dönüşümü değildir.

## Stiller

`styles/base.css` temel görünüm, `styles/updates.css` güncelleme pencereleri, `styles/support.css` bildirim alanıdır. `styles/layout.css`, statik HTML'den çıkarılan 120 farklı stil tanımını `data-layout` üzerinden uygular. Mevcut `premium.css`, `studio.css` ve `atelier.css` dosyalarının sırası korunmuştur. styles/panels.css dinamik şablonlardan çıkarılan 80 sabit stil tanımını içerir. Kaynak biçimi `npm run format:check` ile kontrol edilir.

## Güvenli işlemler

Arayüz yalnızca `preload.js` içindeki izinli bağlantıları kullanır. AI anahtarları ve sağlayıcı istekleri `src/ai-service.js`, şifreli dosyalar `src/secure-store.js`, profil fotoğrafları `src/profile-store.js`, site verisi temizliği `src/browsing-data.js`, Google giriş akışı `src/google-auth.js`, ortak hizmet bağlantıları `src/hosted-service.js` içindedir. Bu servisler arayüz tarafından doğrudan içe aktarılmaz. Google dönüş sayfası `src/pages/` altındadır.
