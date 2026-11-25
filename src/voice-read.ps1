$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$type = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$resultType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$voice = $type::AllVoices | Where-Object { $_.Language -like 'tr-*' } | Select-Object -First 1
if (!$voice) { exit 0 }
$await = [System.WindowsRuntimeSystemExtensions].GetMethods().Where({
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0].MakeGenericMethod($resultType)
$synth = New-Object $type.FullName
try {
    $synth.Voice = $voice
    $operation = $synth.SynthesizeTextToStreamAsync($env:TECHBROWSER_VOICE_LABEL)
    $result = $await.Invoke($null, @($operation)).GetAwaiter().GetResult()
    $source = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($result.GetInputStreamAt(0))
    $bytes = New-Object IO.MemoryStream
    try {
        $source.CopyTo($bytes)
        [Console]::WriteLine([Convert]::ToBase64String($bytes.ToArray()))
    } finally { $source.Dispose(); $bytes.Dispose(); $result.Dispose() }
} finally { $synth.Dispose() }
