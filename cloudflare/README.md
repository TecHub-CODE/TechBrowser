# TechBrowser hizmet sunucusu

Durum: Hizmet `https://techbrowser-api.yigiitxp.workers.dev` adresinde yayında
ve masaüstü uygulaması bu adrese bağlıdır. `src/service-config.json` yalnızca
herkese açık HTTPS adresini ve gizli olmayan Google istemci kimliğini içerir.
Sağlayıcı anahtarları ile OAuth istemci gizli anahtarı Cloudflare'ın şifreli
üretim değişkenlerinde tutulur.

## Sunucunun sundukları

| Yol                     | İşlev                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| `GET /health`           | Hizmetin yanıt verdiğini ve AI yapılandırmasının varlığını gösterir |
| `POST /v1/chat`         | Doğrulanmış Firebase hesabıyla Groq sohbeti                         |
| `POST /v1/email/start`  | Firebase'den okunan doğrulanmış adrese giriş kodu                   |
| `POST /v1/email/finish` | Hesaba bağlı, 5 dakika / 5 deneme sınırında tek kullanımlık kod     |
| `POST /v1/oauth/google` | Google yetkilendirme kodunun PKCE ile değiştirilmesi                |
| `POST /v1/report`       | Yapılandırılmış destek adresine bildirim                            |

Google kod değişimi giriş öncesinde çalışır; diğer POST yolları Firebase
oturumunu ve doğrulanmış e-postayı denetler. Bütün POST yollarında IP sınırı
vardır. İstek gövdesi en fazla 32 KB'dır. Kod kayıtları Durable Objects içinde
özet olarak tutulur; başarılı doğrulamada silinir, süresi dolunca temizlenir.
Firebase oturum anahtarları bu kayıtlarda tutulmaz. Kod denetimi hem birim testlerinde hem gerçek workerd motorunda SQLite Durable Objects ile denendi. Yeniden başlatma, eşzamanlı çift doğrulama ve süresi dolmuş kod kontrolü geçti. Çalıştırma adımları tests/services/README.md içindedir. Sağlayıcı yanıtları otomatik testlerde taklit edilir; üretim yapılandırması canlı uç noktada ayrıca doğrulanır.

## Gerekli hesap ayarları

1. Cloudflare Workers erişimi olan hesabı hazırla.
2. Resend'de gönderen alan adını doğrula ve yalnızca bu göndericiye uygun bir
   API anahtarı oluştur. `MAIL_FROM` bu alan adındaki gönderici, `SUPPORT_TO`
   bildirimleri alacak adres olmalı. [Resend'in Cloudflare rehberi](https://resend.com/docs/send-with-cloudflare-workers).
3. Firebase projesi `techbrowser02` olmalı. `FIREBASE_API_KEY` bu projenin web
   API anahtarıdır; bir yönetici özel anahtarı değildir. Authentication'da
   Email/Password ve Google yapılandırmasını kontrol et.
4. Google OAuth istemcisi, uygulamadaki istemci kimliği ile aynı olmalı.
   Mevcut uygulama `http://localhost:3742/callback` ile başlar, doluysa 3752'ye
   kadar dener. Web türünde istemci kullanılıyorsa bu aralıktaki dönüş
   adreslerini Google konsoluna tek tek kaydet. İstemci türünü ve Firebase'in
   Google sağlayıcısıyla uyumunu canlı testte doğrula. Kod her girişte PKCE
   ve rastgele `state` kullanır. [Google OAuth akışı](https://developers.google.com/identity/protocols/oauth2/native-app).
5. Groq hesabında erişilebilen sohbet modelini ve hizmet anahtarını belirle.
   Sağlayıcı tarafındaki kullanım sınırlarını ayarla. Worker'ın IP/hesap
   başına dakikalık limiti küresel harcama sınırı değildir.

## Yayınlama

Proje kökünden PowerShell'de aşağıdaki komutlar çalıştırılır. Komutlar burada
otomatik çalıştırılmadı. `login` hesap sahibinin tarayıcı onayını ister.
İlk dağıtımda sırlar henüz yoksa ilgili uçlar 503 yanıtı verir.

```powershell
Set-Location cloudflare
npx wrangler@4 login
npx wrangler@4 deploy
npx wrangler@4 secret put FIREBASE_API_KEY
npx wrangler@4 secret put GROQ_API_KEY
npx wrangler@4 secret put GROQ_MODEL
npx wrangler@4 secret put RESEND_API_KEY
npx wrangler@4 secret put MAIL_FROM
npx wrangler@4 secret put SUPPORT_TO
npx wrangler@4 secret put GOOGLE_CLIENT_ID
npx wrangler@4 secret put GOOGLE_CLIENT_SECRET
```

Değerleri komutun açtığı giriş alanına yaz; sohbet, kaynak dosya veya
masaüstü paketine ekleme. `secret put` hizmetin yeni sürümünü etkinleştirir.
[Cloudflare sır yönetimi](https://developers.cloudflare.com/workers/configuration/secrets/).
`wrangler.toml` içindeki `EMAIL_CHALLENGES` bağlaması ve ilk SQLite geçişi
aynı dağıtımda oluşturulur; mevcut geçiş etiketini sonradan değiştirme.
[Durable Objects kurulumu](https://developers.cloudflare.com/durable-objects/get-started/).

Dağıtımın verdiği HTTPS adresinin `/health` yolunu aç. Başarılı yanıt,
e-posta teslimatı veya sağlayıcı kotasının çalıştığını tek başına kanıtlamaz.

## Masaüstüne bağlama

`src/service-config.json` içinde:

- `apiBaseUrl`: Dağıtımın verdiği gerçek HTTPS kök adresi; sonuna `/v1` ekleme.
- `googleClientId`: Sunucuyla aynı, gizli olmayan Google istemci kimliği.
- `firebaseSyncEnabled`: `FIREBASE-SETUP.md` tamamlanana kadar `false`.

Kişisel geliştirmede adresi `TECHBROWSER_API_URL` ortam değişkeniyle de
verebilirsin. Adres boşken yerel `.env` akışı kullanılır. Paylaşılan paket
`.env` içermez; ortak anahtarları kullanıcı bilgisayarlarına kopyalama.
Yapılandırma değişince uygulamayı yeniden başlat; dağıtım için proje kökünde
`npm run build-win` ile yeniden paketle.

## Canlı kabul kontrolü

Silinebilir test hesabıyla doğru/yanlış/süresi dolmuş ve tekrar kullanılan
giriş kodunu; Google girişini ve iptalini; tek bir AI isteğini; destek
bildiriminin doğru adrese ulaşmasını dene. Yetkisiz isteğin ve sınırı aşan
isteğin reddedildiğini kontrol et. Firebase TOTP, kurallar, iki cihaz eşitlemesi
ve hesap silme için `FIREBASE-SETUP.md` ayrı olarak tamamlanmalıdır.

Cloudflare e-posta kodu, Firebase'in TOTP faktörü değildir. Doğrudan Firebase
API erişimini bu kod şartına bağlamaz. Üretimde gerçek ikinci faktör isteniyorsa
Firebase TOTP yapılandırılmalıdır. Buradaki yerel testler canlı yayın onayı değildir.

## Misket günlük kullanıcı kotası (2026-11-09)

- Doğrulanmış Firebase UID başına günde 50 başarılı AI isteği; tüm cihazlar aynı sayacı paylaşır.
- Türkiye saatiyle 00.00 (UTC+03:00) yenilenir. Sayacı istemci saati belirlemez.
- AI_QUOTAS SQLite Durable Object bağlaması ve ai-quota-v1 migration gereklidir; yoksa sohbet kapalı kalır (503).
- İstek başlamadan atomik rezervasyon yapılır. Sağlayıcı hatası/boş yanıt/bağlantı hatası sonrası rezervasyon iade edilir. Sunucu aniden durursa veya iade kaydı yazılamazsa belirsiz istek o gün sayılır; bu yaklaşım sınırın aşılmasını önler.
- Aynı iade ikinci kez işlenmez; önceki güne ait yanıt yeni günün hakkını değiştirmez. Mesaj içeriği sayaçta saklanmaz.
- Bu kullanıcı kotası Groq hesabının toplam ücretsiz kotasını artırmaz. Mevcut kısa süreli IP/hesap limiti de korunur.
- Dağıtımdan sonra ilk gerçek Groq cevabı ayrıca doğrulanmalıdır. Şu an yerel testler tamamlandı; canlı kurulum Cloudflare girişini bekliyor.

