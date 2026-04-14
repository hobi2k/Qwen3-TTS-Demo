param(
    [ValidateSet("all", "core")]
    [string]$Profile = "all"
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "app\backend"
$VenvDir = Join-Path $RootDir ".venv"
$ModelsDir = Join-Path $RootDir "data\models"
$VendorDir = Join-Path $RootDir "vendor"
$RvcDir = Join-Path $RootDir "data\rvc-models"
$MMAudioModelsDir = Join-Path $RootDir "data\mmaudio"

if (-not (Test-Path $VenvDir)) {
    throw "Virtual environment not found. Run .\scripts\setup_backend.ps1 first."
}

New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null
New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
New-Item -ItemType Directory -Force -Path $RvcDir | Out-Null
New-Item -ItemType Directory -Force -Path $MMAudioModelsDir | Out-Null

$ActivatePath = Join-Path $VenvDir "Scripts\Activate.ps1"
. $ActivatePath

$EnvPath = Join-Path $BackendDir ".env"
if (Test-Path $EnvPath) {
    Get-Content $EnvPath | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') {
            return
        }
        $name, $value = $_ -split '=', 2
        [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
}

$env:HF_HUB_ENABLE_HF_TRANSFER = if ($env:HF_HUB_ENABLE_HF_TRANSFER) { $env:HF_HUB_ENABLE_HF_TRANSFER } else { "1" }

python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

models_dir = Path(r'''$ModelsDir''')
profile = r'''$Profile'''

profiles = {
    'core': [
        ('Qwen/Qwen3-TTS-Tokenizer-12Hz', 'Qwen3-TTS-Tokenizer-12Hz'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', 'Qwen3-TTS-12Hz-0.6B-CustomVoice'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-Base', 'Qwen3-TTS-12Hz-0.6B-Base'),
        ('openai/whisper-large-v3', 'whisper-large-v3'),
    ],
    'all': [
        ('Qwen/Qwen3-TTS-Tokenizer-12Hz', 'Qwen3-TTS-Tokenizer-12Hz'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', 'Qwen3-TTS-12Hz-0.6B-CustomVoice'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', 'Qwen3-TTS-12Hz-1.7B-CustomVoice'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-Base', 'Qwen3-TTS-12Hz-0.6B-Base'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-Base', 'Qwen3-TTS-12Hz-1.7B-Base'),
        ('openai/whisper-large-v3', 'whisper-large-v3'),
    ],
}

for repo_id, dirname in profiles[profile]:
    local_dir = models_dir / dirname
    print(f'Downloading {repo_id} -> {local_dir}')
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        local_dir_use_symlinks=False,
        resume_download=True,
    )

print('Model download completed.')
"@

Write-Host ""
Write-Host "Downloaded model profile: $Profile"
Write-Host "Models stored in: $ModelsDir"

$ApplioDir = if ($env:APPLIO_REPO_ROOT) { $env:APPLIO_REPO_ROOT } else { Join-Path $VendorDir "Applio" }
$MMAudioDir = if ($env:MMAUDIO_REPO_ROOT) { $env:MMAUDIO_REPO_ROOT } else { Join-Path $VendorDir "MMAudio" }
$ApplioRepoUrl = if ($env:APPLIO_REPO_URL) { $env:APPLIO_REPO_URL } else { "https://github.com/IAHispano/Applio.git" }
$MMAudioRepoUrl = if ($env:MMAUDIO_REPO_URL) { $env:MMAUDIO_REPO_URL } else { "https://github.com/hkchengrex/MMAudio.git" }
$DefaultRvcModelUrl = if ($env:APPLIO_DEFAULT_RVC_MODEL_URL) { $env:APPLIO_DEFAULT_RVC_MODEL_URL } else { "https://huggingface.co/SmlCoke/rvc-yui/resolve/main/weights/yui-mix-pro-hq-40k.pth" }
$DefaultRvcIndexUrl = if ($env:APPLIO_DEFAULT_RVC_INDEX_URL) { $env:APPLIO_DEFAULT_RVC_INDEX_URL } else { "https://huggingface.co/SmlCoke/rvc-yui/resolve/main/index/added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index" }
$DefaultRvcModelFilename = if ($env:APPLIO_DEFAULT_RVC_MODEL_FILENAME) { $env:APPLIO_DEFAULT_RVC_MODEL_FILENAME } else { "yui-mix-pro-hq-40k.pth" }
$DefaultRvcIndexFilename = if ($env:APPLIO_DEFAULT_RVC_INDEX_FILENAME) { $env:APPLIO_DEFAULT_RVC_INDEX_FILENAME } else { "added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index" }
$SkipDefaultRvc = if ($env:APPLIO_SKIP_DEFAULT_RVC) { $env:APPLIO_SKIP_DEFAULT_RVC } else { "0" }

if (-not (Test-Path (Join-Path $ApplioDir ".git"))) {
    Write-Host "Cloning Applio -> $ApplioDir"
    git clone $ApplioRepoUrl $ApplioDir
}
else {
    Write-Host "Applio already present at $ApplioDir"
}

if (-not (Test-Path (Join-Path $MMAudioDir ".git"))) {
    Write-Host "Cloning MMAudio -> $MMAudioDir"
    git clone $MMAudioRepoUrl $MMAudioDir
}
else {
    Write-Host "MMAudio already present at $MMAudioDir"
}

$RvcModelUrl = $env:APPLIO_RVC_MODEL_URL
$RvcIndexUrl = $env:APPLIO_RVC_INDEX_URL
$RvcModelFilename = $env:APPLIO_RVC_MODEL_FILENAME
$RvcIndexFilename = $env:APPLIO_RVC_INDEX_FILENAME

if ((-not $RvcModelUrl) -and (-not $RvcIndexUrl) -and ($SkipDefaultRvc -ne "1")) {
    Write-Host "No explicit Applio/RVC model URLs provided. Downloading the default demo voice-conversion pair."
    $RvcModelUrl = $DefaultRvcModelUrl
    $RvcIndexUrl = $DefaultRvcIndexUrl
    $RvcModelFilename = $DefaultRvcModelFilename
    $RvcIndexFilename = $DefaultRvcIndexFilename
}

if ($RvcModelUrl) {
    $ModelFilename = if ($RvcModelFilename) { $RvcModelFilename } else { [System.IO.Path]::GetFileName($RvcModelUrl) }
    $TargetArchive = Join-Path $RvcDir $ModelFilename
    if (-not (Test-Path $TargetArchive)) {
        Write-Host "Downloading Applio/RVC model -> $TargetArchive"
        Invoke-WebRequest -Uri $RvcModelUrl -OutFile $TargetArchive
    }
    else {
        Write-Host "Applio/RVC model already present: $TargetArchive"
    }
}

if ($RvcIndexUrl) {
    $IndexFilename = if ($RvcIndexFilename) { $RvcIndexFilename } else { [System.IO.Path]::GetFileName($RvcIndexUrl) }
    $TargetIndex = Join-Path $RvcDir $IndexFilename
    if (-not (Test-Path $TargetIndex)) {
        Write-Host "Downloading Applio/RVC index -> $TargetIndex"
        Invoke-WebRequest -Uri $RvcIndexUrl -OutFile $TargetIndex
    }
    else {
        Write-Host "Applio/RVC index already present: $TargetIndex"
    }
}

if ((-not $RvcModelUrl) -or (-not $RvcIndexUrl)) {
    Write-Host ""
    Write-Host "Applio repository is present, but no default RVC voice-conversion model was downloaded."
    Write-Host "Reason: provide APPLIO_RVC_MODEL_URL and APPLIO_RVC_INDEX_URL, or leave APPLIO_SKIP_DEFAULT_RVC unset so the built-in demo pair downloads."
    Write-Host "Current RVC asset directory: $RvcDir"
}

if ($env:MMAUDIO_MODEL_URL) {
    $ModelFilename = if ($env:MMAUDIO_MODEL_FILENAME) { $env:MMAUDIO_MODEL_FILENAME } else { [System.IO.Path]::GetFileName($env:MMAUDIO_MODEL_URL) }
    $TargetArchive = Join-Path $MMAudioModelsDir $ModelFilename
    if (-not (Test-Path $TargetArchive)) {
        Write-Host "Downloading MMAudio model -> $TargetArchive"
        Invoke-WebRequest -Uri $env:MMAUDIO_MODEL_URL -OutFile $TargetArchive
    }
    else {
        Write-Host "MMAudio model already present: $TargetArchive"
    }
}

if ($env:MMAUDIO_CONFIG_URL) {
    $ConfigFilename = if ($env:MMAUDIO_CONFIG_FILENAME) { $env:MMAUDIO_CONFIG_FILENAME } else { [System.IO.Path]::GetFileName($env:MMAUDIO_CONFIG_URL) }
    $TargetConfig = Join-Path $MMAudioModelsDir $ConfigFilename
    if (-not (Test-Path $TargetConfig)) {
        Write-Host "Downloading MMAudio config -> $TargetConfig"
        Invoke-WebRequest -Uri $env:MMAUDIO_CONFIG_URL -OutFile $TargetConfig
    }
    else {
        Write-Host "MMAudio config already present: $TargetConfig"
    }
}

Write-Host "Suggested next step:"
Write-Host "  cd app\backend; ..\..\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
