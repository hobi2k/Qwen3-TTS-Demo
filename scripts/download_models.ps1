param(
    [ValidateSet("all", "core")]
    [string]$Profile = "all"
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "app\backend"
$VenvDir = Join-Path $RootDir ".venv"
$ModelsDir = Join-Path $RootDir "data\models"

if (-not (Test-Path $VenvDir)) {
    throw "Virtual environment not found. Run .\scripts\setup_backend.ps1 first."
}

New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

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
Write-Host "Suggested next step:"
Write-Host "  cd app\backend; ..\..\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
