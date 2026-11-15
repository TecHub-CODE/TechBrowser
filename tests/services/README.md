# Yerel hizmet testleri

Bu klasör masaüstü uygulamasının dağıtımına dahil edilmez. Ayrı kilit dosyası
sayesinde Firebase/Cloudflare test araçları uygulamanın bağımlılıklarına eklenmez.
Node 24.12+ ve Firestore için Java 21+ gerekir.

Proje kökünden:

```powershell
npm ci --prefix tests/services
node tests/services/prepare-firestore.mjs
npm run test:worker
npm run test:rules
```

Java PATH üzerinde bulunabilir veya `TECHBROWSER_TEST_JAVA` ortam değişkeni
Java çalıştırılabilir dosyasının tam yolunu gösterebilir. Bu çalışma sırasında
indirilen, SHA-256 ile doğrulanmış resmi Adoptium JRE, `tests/.runtime/java`
altındaysa test başlatıcısı onu otomatik bulur. Sistem Java ayarı değiştirilmez.
`TECHBROWSER_FIRESTORE_JAR` ile başka bir yerel emülatör yolu verilebilir.
Hazırlama betiği Firebase CLI 15.34.2'nin resmi indirme manifestindeki Firestore
1.22.0 adresi ve SHA-256 değerini kullanır; kuralların kendisi doğrudan
`firebase/browserSync.rules.txt` dosyasından yüklenir.

Firestore yalnızca `127.0.0.1` üzerinde boş bir portta, `demo-techbrowser`
projesiyle açılır; test bitince kapatılır. Türkçe Windows'ta eksik Java hata
çevirisine takılmaması için yalnızca test sürecinin dili İngilizceye ayarlanır.
Kaydı `tests/.runtime/firebase/emulator.log` içindedir. Gerçek Firebase'e istek
göndermez, mevcut kuralları veya kullanıcıları değiştirmez.

Cloudflare testi gerçek workerd motorunu ve SQLite Durable Objects depolamasını
kullanır. Motor yeniden başlatılınca kod kaydının korunmasını, aynı kodun eşzamanlı
iki istekte yalnızca bir kez kullanılmasını, tekrarın ve süresi dolmuş kodun
reddedilmesini sınar. Firebase/Groq/Resend yanıtları kontrollü olarak üretilir;
beklenmeyen dış ağ isteği test hatasıdır. Gerçek e-posta gönderilmez.

Test motoru 2026-07-30 uyumluluk tarihini destekler; dağıtım ayarı 2026-09-11'dir.
Bu test canlı Cloudflare dağıtımının, sağlayıcı anahtarlarının veya gerçek
e-posta teslimatının doğrulandığı anlamına gelmez.

Kaynaklar: [Firebase kural testleri](https://firebase.google.com/docs/rules/unit-tests),
[Cloudflare Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/get-started/),
[Adoptium](https://adoptium.net/temurin/releases/).
