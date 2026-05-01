param(
    [ValidateSet("all", "core", "s2pro")]
    [string]$Profile = "all"
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "app\backend"
$VenvDir = Join-Path $RootDir ".venv"
$ModelsDir = Join-Path $RootDir "data\models"
$VendorDir = Join-Path $RootDir "vendor"
$RvcDir = Join-Path $RootDir "data\rvc-models"
$ApplioDir = if ($env:APPLIO_REPO_ROOT) { $env:APPLIO_REPO_ROOT } else { Join-Path $VendorDir "Applio" }
$ApplioContentvecDir = Join-Path $ApplioDir "rvc\models\embedders\contentvec"
$ApplioPredictorDir = Join-Path $ApplioDir "rvc\models\predictors"
$MMAudioModelsDir = Join-Path $RootDir "data\mmaudio"
$StemSeparatorModelsDir = Join-Path $RootDir "data\stem-separator-models"
$FishSpeechDir = if ($env:FISH_SPEECH_REPO_ROOT) { $env:FISH_SPEECH_REPO_ROOT } else { Join-Path $VendorDir "fish-speech" }
$FishSpeechModelDir = if ($env:FISH_SPEECH_MODEL_DIR) { $env:FISH_SPEECH_MODEL_DIR } else { Join-Path $RootDir "data\models\fish-speech\s2-pro" }

if (-not (Test-Path $VenvDir)) {
    throw "Virtual environment not found. Run .\scripts\setup_backend.ps1 first."
}

New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null
New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
New-Item -ItemType Directory -Force -Path $RvcDir | Out-Null
New-Item -ItemType Directory -Force -Path $ApplioContentvecDir | Out-Null
New-Item -ItemType Directory -Force -Path $ApplioPredictorDir | Out-Null
New-Item -ItemType Directory -Force -Path $MMAudioModelsDir | Out-Null
New-Item -ItemType Directory -Force -Path $StemSeparatorModelsDir | Out-Null
New-Item -ItemType Directory -Force -Path $FishSpeechModelDir | Out-Null

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
$PrivateAssetRepoId = $env:PRIVATE_ASSET_REPO_ID
$PrivateAssetRevision = if ($env:PRIVATE_ASSET_REVISION) { $env:PRIVATE_ASSET_REVISION } else { "main" }

function Download-PrivateAsset {
    param(
        [string]$RepoPath,
        [string]$TargetPath
    )

    if (-not $PrivateAssetRepoId) {
        return $false
    }
    if (Test-Path $TargetPath) {
        Write-Host "Private asset already present: $TargetPath"
        return $true
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetPath) | Out-Null
    python -c @"
import shutil
import sys
from pathlib import Path
from huggingface_hub import hf_hub_download

repo_id, revision, filename, target = sys.argv[1:5]
cached = hf_hub_download(repo_id=repo_id, filename=filename, revision=revision, repo_type='model')
target_path = Path(target)
target_path.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(cached, target_path)
print(f'Downloaded private asset {repo_id}/{filename} -> {target_path}')
"@ $PrivateAssetRepoId $PrivateAssetRevision $RepoPath $TargetPath
    return ($LASTEXITCODE -eq 0)
}

python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

models_dir = Path(r'''$ModelsDir''')
profile = r'''$Profile'''

profiles = {
    's2pro': [],
    'core': [
        ('Qwen/Qwen3-TTS-Tokenizer-12Hz', 'Qwen3-TTS-Tokenizer-12Hz'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', 'Qwen3-TTS-12Hz-0.6B-CustomVoice'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-Base', 'Qwen3-TTS-12Hz-0.6B-Base'),
        ('Qwen/Qwen3-ASR-1.7B', 'Qwen3-ASR-1.7B'),
        ('Qwen/Qwen3-ASR-0.6B', 'Qwen3-ASR-0.6B'),
    ],
    'all': [
        ('Qwen/Qwen3-TTS-Tokenizer-12Hz', 'Qwen3-TTS-Tokenizer-12Hz'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', 'Qwen3-TTS-12Hz-0.6B-CustomVoice'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', 'Qwen3-TTS-12Hz-1.7B-CustomVoice'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'),
        ('Qwen/Qwen3-TTS-12Hz-0.6B-Base', 'Qwen3-TTS-12Hz-0.6B-Base'),
        ('Qwen/Qwen3-TTS-12Hz-1.7B-Base', 'Qwen3-TTS-12Hz-1.7B-Base'),
        ('Qwen/Qwen3-ASR-1.7B', 'Qwen3-ASR-1.7B'),
        ('Qwen/Qwen3-ASR-0.6B', 'Qwen3-ASR-0.6B'),
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

if (($Profile -eq "all") -or ($Profile -eq "s2pro")) {
    $FishSpeechRepoUrl = if ($env:FISH_SPEECH_REPO_URL) { $env:FISH_SPEECH_REPO_URL } else { "https://github.com/fishaudio/fish-speech.git" }
    if (-not (Test-Path (Join-Path $FishSpeechDir ".git"))) {
        Write-Host "Cloning Fish Speech -> $FishSpeechDir"
        git clone $FishSpeechRepoUrl $FishSpeechDir
    }
    else {
        Write-Host "Fish Speech already present at $FishSpeechDir"
    }

    python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

target_dir = Path(r'''$FishSpeechModelDir''')
print(f'Downloading fishaudio/s2-pro -> {target_dir}')
snapshot_download(
    repo_id='fishaudio/s2-pro',
    local_dir=str(target_dir),
    local_dir_use_symlinks=False,
    resume_download=True,
)
print('Fish Speech S2-Pro model download completed.')
"@
}

if ($Profile -eq "s2pro") {
    Write-Host "S2-Pro-only profile completed."
    exit 0
}

$MMAudioDir = if ($env:MMAUDIO_REPO_ROOT) { $env:MMAUDIO_REPO_ROOT } else { Join-Path $VendorDir "MMAudio" }
$ApplioRepoUrl = if ($env:APPLIO_REPO_URL) { $env:APPLIO_REPO_URL } else { "https://github.com/IAHispano/Applio.git" }
$MMAudioRepoUrl = if ($env:MMAUDIO_REPO_URL) { $env:MMAUDIO_REPO_URL } else { "https://github.com/hkchengrex/MMAudio.git" }
$DefaultRvcModelUrl = if ($env:APPLIO_DEFAULT_RVC_MODEL_URL) { $env:APPLIO_DEFAULT_RVC_MODEL_URL } else { "https://huggingface.co/SmlCoke/rvc-yui/resolve/main/weights/yui-mix-pro-hq-40k.pth" }
$DefaultRvcIndexUrl = if ($env:APPLIO_DEFAULT_RVC_INDEX_URL) { $env:APPLIO_DEFAULT_RVC_INDEX_URL } else { "https://huggingface.co/SmlCoke/rvc-yui/resolve/main/index/added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index" }
$DefaultRvcModelFilename = if ($env:APPLIO_DEFAULT_RVC_MODEL_FILENAME) { $env:APPLIO_DEFAULT_RVC_MODEL_FILENAME } else { "yui-mix-pro-hq-40k.pth" }
$DefaultRvcIndexFilename = if ($env:APPLIO_DEFAULT_RVC_INDEX_FILENAME) { $env:APPLIO_DEFAULT_RVC_INDEX_FILENAME } else { "added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index" }
$SkipDefaultRvc = if ($env:APPLIO_SKIP_DEFAULT_RVC) { $env:APPLIO_SKIP_DEFAULT_RVC } else { "0" }
$ApplioContentvecModelUrl = if ($env:APPLIO_CONTENTVEC_MODEL_URL) { $env:APPLIO_CONTENTVEC_MODEL_URL } else { "https://huggingface.co/IAHispano/Applio/resolve/main/Resources/embedders/contentvec/pytorch_model.bin" }
$ApplioContentvecConfigUrl = if ($env:APPLIO_CONTENTVEC_CONFIG_URL) { $env:APPLIO_CONTENTVEC_CONFIG_URL } else { "https://huggingface.co/IAHispano/Applio/resolve/main/Resources/embedders/contentvec/config.json" }
$ApplioRmvpeUrl = if ($env:APPLIO_RMVPE_URL) { $env:APPLIO_RMVPE_URL } else { "https://huggingface.co/IAHispano/Applio/resolve/main/Resources/predictors/rmvpe.pt" }

if (-not (Test-Path (Join-Path $ApplioDir ".git"))) {
    Write-Host "Cloning Applio -> $ApplioDir"
    git clone $ApplioRepoUrl $ApplioDir
}
else {
    Write-Host "Applio already present at $ApplioDir"
}

$ApplioRuntimeAssets = @(
    @{ PrivatePath = "applio/embedders/contentvec/pytorch_model.bin"; TargetPath = (Join-Path $ApplioContentvecDir "pytorch_model.bin"); Url = $ApplioContentvecModelUrl },
    @{ PrivatePath = "applio/embedders/contentvec/config.json"; TargetPath = (Join-Path $ApplioContentvecDir "config.json"); Url = $ApplioContentvecConfigUrl },
    @{ PrivatePath = "applio/predictors/rmvpe.pt"; TargetPath = (Join-Path $ApplioPredictorDir "rmvpe.pt"); Url = $ApplioRmvpeUrl }
)

foreach ($Asset in $ApplioRuntimeAssets) {
    if (Test-Path $Asset.TargetPath) {
        Write-Host "Applio runtime asset already present: $($Asset.TargetPath)"
    }
    elseif (Download-PrivateAsset -RepoPath $Asset.PrivatePath -TargetPath $Asset.TargetPath) {
        Write-Host "Downloaded Applio runtime asset from private asset repo: $($Asset.PrivatePath)"
    }
    else {
        Write-Host "Downloading Applio runtime asset -> $($Asset.TargetPath)"
        Invoke-WebRequest -Uri $Asset.Url -OutFile $Asset.TargetPath
    }
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
    $RvcModelFilename = $DefaultRvcModelFilename
    $RvcIndexFilename = $DefaultRvcIndexFilename
    $PrivateRvcModel = Download-PrivateAsset -RepoPath "rvc-models/$RvcModelFilename" -TargetPath (Join-Path $RvcDir $RvcModelFilename)
    $PrivateRvcIndex = Download-PrivateAsset -RepoPath "rvc-models/$RvcIndexFilename" -TargetPath (Join-Path $RvcDir $RvcIndexFilename)
    if ($PrivateRvcModel -and $PrivateRvcIndex) {
        Write-Host "Downloaded Applio/RVC assets from private asset repo."
    }
    else {
        Write-Host "No explicit Applio/RVC model URLs provided. Downloading the default demo voice-conversion pair."
        $RvcModelUrl = $DefaultRvcModelUrl
        $RvcIndexUrl = $DefaultRvcIndexUrl
    }
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

$MMAudioNsfwModelUrl = if ($env:MMAUDIO_NSFW_MODEL_URL) { $env:MMAUDIO_NSFW_MODEL_URL } else { "https://huggingface.co/phazei/NSFW_MMaudio/resolve/main/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors" }
if (($Profile -eq "all") -and $MMAudioNsfwModelUrl) {
    $NsfwFilename = if ($env:MMAUDIO_NSFW_MODEL_FILENAME) { $env:MMAUDIO_NSFW_MODEL_FILENAME } else { "mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors" }
    $NsfwDir = Join-Path $MMAudioModelsDir "nsfw"
    New-Item -ItemType Directory -Force -Path $NsfwDir | Out-Null
    $TargetNsfwModel = Join-Path $NsfwDir $NsfwFilename
    if (-not (Test-Path $TargetNsfwModel)) {
        if (Download-PrivateAsset -RepoPath "mmaudio/nsfw/$NsfwFilename" -TargetPath $TargetNsfwModel) {
            Write-Host "Downloaded MMAudio NSFW model from private asset repo."
        }
        else {
            Write-Host "Downloading MMAudio NSFW model -> $TargetNsfwModel"
            Invoke-WebRequest -Uri $MMAudioNsfwModelUrl -OutFile $TargetNsfwModel
        }
    }
    else {
        Write-Host "MMAudio NSFW model already present: $TargetNsfwModel"
    }
}

$StemSeparatorModelFilename = if ($env:STEM_SEPARATOR_MODEL_FILENAME) { $env:STEM_SEPARATOR_MODEL_FILENAME } else { "vocals_mel_band_roformer.ckpt" }
if ($Profile -eq "all") {
    $StemTarget = Join-Path $StemSeparatorModelsDir $StemSeparatorModelFilename
    $StemYaml = $StemSeparatorModelFilename -replace '\.ckpt$', '.yaml'
    if (Download-PrivateAsset -RepoPath "stem-separator-models/$StemSeparatorModelFilename" -TargetPath $StemTarget) {
        Download-PrivateAsset -RepoPath "stem-separator-models/$StemYaml" -TargetPath (Join-Path $StemSeparatorModelsDir $StemYaml) | Out-Null
        Write-Host "Downloaded Stem Separator model from private asset repo."
    }
    else {
        python -c "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('audio_separator') else 1)"
        if ($LASTEXITCODE -eq 0) {
        Write-Host "Downloading Stem Separator model -> $(Join-Path $StemSeparatorModelsDir $StemSeparatorModelFilename)"
        audio-separator --download_model_only --model_filename $StemSeparatorModelFilename --model_file_dir $StemSeparatorModelsDir
        }
        else {
            Write-Host "audio-separator is not installed. Run .\scripts\setup_backend.ps1, then rerun this script to fetch the Stem Separator model."
        }
    }
}
Write-Host "Suggested next step:"
Write-Host "  cd app\backend; ..\..\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
