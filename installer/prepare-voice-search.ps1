param([string]$target = (Join-Path $PSScriptRoot 'generated/voice-search'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $target | Out-Null
function Fetch-Verified($url, $file, $sha256) {
    if (!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file).Hash -ne $sha256) {
        Invoke-WebRequest -Uri $url -OutFile $file
    }
    if ((Get-FileHash -LiteralPath $file).Hash -ne $sha256) { throw "Hash mismatch: $file" }
}
$archive = Join-Path $target 'whisper.zip'
Fetch-Verified 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip' $archive '0d2eca299c248f965bd0341bcb219db4b433c7f0c0ce2200d4df85765e8156a9'
Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
Fetch-Verified 'https://huggingface.co/ggerganov/whisper.cpp/resolve/c521a4b02f422512d734391fdf08bb08c0862f68/ggml-base-q5_1.bin' (Join-Path $target 'model-base.bin') '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.7.6/LICENSE' -OutFile (Join-Path $target 'LICENSE')
