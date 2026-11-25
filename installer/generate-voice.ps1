# Run with Windows PowerShell and the Microsoft Tolga Turkish voice installed.
# Only the resulting WAV recordings are bundled with Setup.
param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'assets/voice'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$synthType = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$resultType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods().Where({
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0].MakeGenericMethod($resultType)
$synth = New-Object $synthType.FullName
$voice = $synthType::AllVoices | Where-Object { $_.Language -eq 'tr-TR' -and $_.DisplayName -match 'Tolga' } | Select-Object -First 1
if (!$voice) { throw 'Microsoft Tolga (tr-TR) is required for recording.' }
$synth.Voice = $voice
$synth.Options.SpeakingRate = 0.94

$lines = [ordered]@{
    Welcome = 'Tek Brauzır kurulumuna hoş geldiniz. Sesli rehbere ihtiyacınız yoksa bu seçeneği kapatabilirsiniz.'
    VoiceGuide = 'Sesli rehber açık. Kapatmak için boşluk tuşuna basın.'
    Minimize = 'Pencereyi küçült.'
    Close = 'Kurulum penceresini kapat.'
    Location = 'Kurulum konumu.'
    License = 'Lisans koşulları.'
    StandardMode = 'Standart modla devam et.'
    EnablePerformance = 'Performans kipiyle devam et.'
    Cancel = 'İptal.'
    Finish = 'Kapat.'
    Action = 'Kur.'
    Retry = 'Tekrar dene.'
    Launch = 'Tek Brauzır uygulamasını aç.'
    BrowserTerms = 'Tek Brauzıra hoş geldiniz. Bu ekranda kullanım koşullarını inceleyebilirsiniz. Sesli rehberi kapatmak için kutunun üzerindeyken boşluk tuşuna basın.'
    BrowserTermsText = 'Kullanım koşulları. Metinde ilerlemek için yön tuşlarını kullanabilirsiniz.'
    BrowserTermsCheck = 'Kullanım koşullarını kabul etme kutusu.'
    BrowserTermsAccept = 'Kabul et ve devam et.'
    BrowserWelcome = 'Başlangıç ayarları. Tema, arama motoru ve diğer tercihleri seçebilirsiniz. Seçenekler arasında ilerlemek için Tab tuşuna basın.'
    BrowserSurvey = 'Kısa anket. Bizi nereden duydunuz? İsterseniz anketi atlayabilirsiniz.'
    BrowserToggle = 'Sesli rehber açık. Kapatmak için boşluk tuşuna basın.'
    BrowserDefault = 'Grafit tema.'
    BrowserLight = 'Açık tema.'
    BrowserMidnight = 'Gece teması.'
    BrowserWhite = 'Beyaz vurgu.'
    BrowserBlue = 'Mavi vurgu.'
    BrowserPurple = 'Mor vurgu.'
    BrowserGreen = 'Yeşil vurgu.'
    BrowserOrange = 'Turuncu vurgu.'
    BrowserGoogle = 'Gugıl.'
    BrowserDuck = 'Dak Dak Go.'
    BrowserBing = 'Bing.'
    BrowserAdBlock = 'Reklam engellemeyi açık tut.'
    BrowserDefaultBrowser = 'Varsayılan tarayıcı yap.'
    BrowserImport = 'Eski tarayıcıdan verileri içe aktar.'
    BrowserDefaults = 'Varsayılanlarla devam et.'
    BrowserContinue = 'Devam et.'
    BrowserYoutubeTiktok = 'Yutub veya Tik Tok.'
    BrowserInstagram = 'Instagram.'
    BrowserGithub = 'Git Hab.'
    BrowserCommunity = 'İks veya topluluk forumları.'
    BrowserFriendFamily = 'Arkadaş veya aile.'
    BrowserSearch = 'Arama motoru.'
    BrowserArticle = 'Haber veya makale.'
    BrowserOther = 'Diğer.'
    BrowserOtherInput = 'Nereden duyduğunuzu kısaca yazabilirsiniz.'
    BrowserSkip = 'Anketi atla.'
    BrowserStart = 'Tek Brauzırı kullanmaya başla.'
    BrowserAddress = 'Adres çubuğu.'
    BrowserSearchField = 'Web araması.'
    BrowserBack = 'Geri.'
    BrowserForward = 'İleri.'
    BrowserReload = 'Yenile.'
    BrowserMisket = 'Misket.'
    BrowserVoiceSearch = 'Sesli ara.'
    BrowserSettings = 'Ayarlar.'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
try {
    foreach ($clip in $lines.GetEnumerator()) {
        $operation = $synth.SynthesizeTextToStreamAsync($clip.Value)
        $result = $asTask.Invoke($null, @($operation)).GetAwaiter().GetResult()
        $source = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($result.GetInputStreamAt(0))
        try {
            # Windows adds a two-byte format extension to its PCM WAV output.
            # Write the canonical PCM header expected by the installer's duration reader.
            $reader = New-Object IO.BinaryReader($source)
            $header = $reader.ReadBytes(46)
            if ($header.Length -ne 46 -or
                [Text.Encoding]::ASCII.GetString($header, 12, 4) -ne 'fmt ' -or
                [BitConverter]::ToUInt32($header, 16) -ne 18 -or
                [BitConverter]::ToUInt16($header, 20) -ne 1 -or
                [BitConverter]::ToUInt16($header, 36) -ne 0 -or
                [Text.Encoding]::ASCII.GetString($header, 38, 4) -ne 'data') {
                throw 'Unexpected Windows speech WAV format.'
            }
            $target = [IO.File]::Create((Join-Path $OutputDirectory ($clip.Key + '.wav')))
            try {
                [BitConverter]::GetBytes([uint32]16).CopyTo($header, 16)
                [BitConverter]::GetBytes([uint32]([BitConverter]::ToUInt32($header, 4) - 2)).CopyTo($header, 4)
                $target.Write($header, 0, 36)
                $target.Write($header, 38, 8)
                $source.CopyTo($target)
            } finally { $target.Dispose() }
        } finally {
            $source.Dispose()
            $result.Dispose()
        }
    }
} finally { $synth.Dispose() }
