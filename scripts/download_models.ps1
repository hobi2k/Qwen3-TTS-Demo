param(
    [ValidateSet("all", "core", "mmaudio", "s2pro", "ace-step", "vibevoice", "vibevoice-7b", "omnivoice", "cosyvoice", "voxcpm", "supertonic")]
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
$VibeVoiceDir = if ($env:VIBEVOICE_REPO_ROOT) { $env:VIBEVOICE_REPO_ROOT } else { Join-Path $VendorDir "VibeVoice" }
$VibeVoiceModelDir = if ($env:VIBEVOICE_MODEL_DIR) { $env:VIBEVOICE_MODEL_DIR } else { Join-Path $RootDir "data\models\vibevoice" }
$VibeVoiceVenv = if ($env:VIBEVOICE_VENV) { $env:VIBEVOICE_VENV } else { Join-Path $RootDir ".venv-vibevoice" }
$OmniVoiceDir = if ($env:OMNIVOICE_REPO_ROOT) { $env:OMNIVOICE_REPO_ROOT } else { Join-Path $VendorDir "OmniVoice" }
$OmniVoiceModelDir = if ($env:OMNIVOICE_MODEL_DIR) { $env:OMNIVOICE_MODEL_DIR } else { Join-Path $RootDir "data\models\omnivoice" }
$OmniVoiceVenv = if ($env:OMNIVOICE_VENV) { $env:OMNIVOICE_VENV } else { Join-Path $RootDir ".venv-omnivoice" }
$AceStepDir = if ($env:ACE_STEP_REPO_ROOT) { $env:ACE_STEP_REPO_ROOT } else { Join-Path $VendorDir "ACE-Step" }
$AceStepModelDir = if ($env:ACE_STEP_CHECKPOINT_PATH) { $env:ACE_STEP_CHECKPOINT_PATH } else { Join-Path $RootDir "data\models\ace-step" }
$AceStepVenv = if ($env:ACE_STEP_VENV) { $env:ACE_STEP_VENV } else { Join-Path $RootDir ".venv-ace-step" }
$CosyVoiceDir = if ($env:COSYVOICE_REPO_ROOT) { $env:COSYVOICE_REPO_ROOT } else { Join-Path $VendorDir "CosyVoice" }
$CosyVoiceModelDir = if ($env:COSYVOICE_MODEL_DIR) { $env:COSYVOICE_MODEL_DIR } else { Join-Path $RootDir "data\models\cosyvoice3" }
$CosyVoiceVenv = if ($env:COSYVOICE_VENV) { $env:COSYVOICE_VENV } else { Join-Path $RootDir ".venv-cosyvoice3" }
$VoxCPMDir = if ($env:VOXCPM_REPO_ROOT) { $env:VOXCPM_REPO_ROOT } else { Join-Path $VendorDir "VoxCPM" }
$VoxCPMModelDir = if ($env:VOXCPM_MODEL_DIR) { $env:VOXCPM_MODEL_DIR } else { Join-Path $RootDir "data\models\voxcpm2" }
$VoxCPMVenv = if ($env:VOXCPM_VENV) { $env:VOXCPM_VENV } else { Join-Path $RootDir ".venv-voxcpm2" }
$SupertonicDir = if ($env:SUPERTONIC_REPO_ROOT) { $env:SUPERTONIC_REPO_ROOT } else { Join-Path $VendorDir "Supertonic" }
$SupertonicModelDir = if ($env:SUPERTONIC_MODEL_DIR) { $env:SUPERTONIC_MODEL_DIR } else { Join-Path $RootDir "data\models\supertonic3" }
$InstallVendorRuntimes = if ($env:INSTALL_VENDOR_RUNTIMES) { $env:INSTALL_VENDOR_RUNTIMES } else { "0" }

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
New-Item -ItemType Directory -Force -Path $VibeVoiceModelDir | Out-Null
New-Item -ItemType Directory -Force -Path $OmniVoiceModelDir | Out-Null
New-Item -ItemType Directory -Force -Path $AceStepModelDir | Out-Null
New-Item -ItemType Directory -Force -Path $CosyVoiceModelDir | Out-Null
New-Item -ItemType Directory -Force -Path $VoxCPMModelDir | Out-Null
New-Item -ItemType Directory -Force -Path $SupertonicModelDir | Out-Null

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

function Assert-VendoredSource {
    param(
        [string]$Name,
        [string]$TargetDir
    )

    if (-not (Test-Path $TargetDir)) {
        throw "$Name vendor source is missing: $TargetDir. Restore the vendored repository contents instead of cloning during model download."
    }

    Write-Host "Using vendored $Name source: $TargetDir"
}

function Assert-NonEmptyModelDir {
    param(
        [string]$Name,
        [string]$TargetDir
    )
    if (-not (Test-Path $TargetDir)) {
        throw "$Name download produced no usable files: $TargetDir"
    }
    $file = Get-ChildItem -Path $TargetDir -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\.cache\\' } |
        Select-Object -First 1
    if (-not $file) {
        throw "$Name download produced no usable files: $TargetDir"
    }
}

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
    'mmaudio': [],
    's2pro': [],
    'ace-step': [],
    'vibevoice': [],
    'vibevoice-7b': [],
    'omnivoice': [],
    'cosyvoice': [],
    'voxcpm': [],
    'supertonic': [],
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
    Assert-VendoredSource -Name "Fish Speech" -TargetDir $FishSpeechDir

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

# --------------------------------------------------------------------------
# VibeVoice (Microsoft, MIT) — .venv-vibevoice + HF weight bundles
# --------------------------------------------------------------------------
$VibeVoiceInclude7B = if ($env:VIBEVOICE_INCLUDE_7B) { $env:VIBEVOICE_INCLUDE_7B } else { "0" }
if ($Profile -eq "vibevoice-7b") { $VibeVoiceInclude7B = "1" }
if (($Profile -eq "all") -or ($Profile -eq "vibevoice") -or ($Profile -eq "vibevoice-7b")) {
    Assert-VendoredSource -Name "VibeVoice" -TargetDir $VibeVoiceDir
    if (-not (Test-Path (Join-Path $VibeVoiceDir "pyproject.toml"))) {
        throw "VibeVoice vendored source is incomplete (missing pyproject.toml): $VibeVoiceDir"
    }
    if ($InstallVendorRuntimes -eq "1") {
        if (-not (Test-Path $VibeVoiceVenv)) {
            Write-Host "Creating VibeVoice venv -> $VibeVoiceVenv"
            python -m venv $VibeVoiceVenv
        }
        $VibeVoicePython = Join-Path $VibeVoiceVenv "Scripts\python.exe"
        & $VibeVoicePython -m pip install --upgrade pip wheel setuptools | Out-Host
        $VibeVoiceRequirements = Join-Path $VibeVoiceDir "requirements.txt"
        if (Test-Path $VibeVoiceRequirements) {
            & $VibeVoicePython -m pip install -r $VibeVoiceRequirements | Out-Host
        }
        & $VibeVoicePython -m pip install -e $VibeVoiceDir | Out-Host
        & $VibeVoicePython -m pip install librosa soundfile huggingface_hub transformers accelerate peft | Out-Host
    }
    else {
        Write-Host "Skipping VibeVoice runtime install during model download."
    }

    python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

target_root = Path(r'''$VibeVoiceModelDir''')
include_7b = r'''$VibeVoiceInclude7B''' == '1'

models = [
    ('microsoft/VibeVoice-ASR', 'VibeVoice-ASR'),
    ('microsoft/VibeVoice-Realtime-0.5B', 'VibeVoice-Realtime-0.5B'),
    ('vibevoice/VibeVoice-1.5B', 'VibeVoice-1.5B'),
]
if include_7b:
    models.append(('vibevoice/VibeVoice-7B', 'VibeVoice-7B'))

for repo_id, dirname in models:
    local_dir = target_root / dirname
    print(f'Downloading {repo_id} -> {local_dir}')
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        local_dir_use_symlinks=False,
        resume_download=True,
    )
suffix = ', and community 7B TTS' if include_7b else ''
print(f'VibeVoice ASR, Realtime 0.5B TTS, 1.5B TTS{suffix} model downloads completed.')
"@
    Assert-NonEmptyModelDir -Name "VibeVoice ASR" -TargetDir (Join-Path $VibeVoiceModelDir "VibeVoice-ASR")
    Assert-NonEmptyModelDir -Name "VibeVoice Realtime 0.5B" -TargetDir (Join-Path $VibeVoiceModelDir "VibeVoice-Realtime-0.5B")
    Assert-NonEmptyModelDir -Name "VibeVoice 1.5B" -TargetDir (Join-Path $VibeVoiceModelDir "VibeVoice-1.5B")
    if ($VibeVoiceInclude7B -eq "1") {
        Assert-NonEmptyModelDir -Name "VibeVoice 7B" -TargetDir (Join-Path $VibeVoiceModelDir "VibeVoice-7B")
    }
}

# --------------------------------------------------------------------------
# OmniVoice (k2-fsa, Apache 2.0) — .venv-omnivoice + HF weight bundle
# --------------------------------------------------------------------------
$OmniVoiceHfModelId = if ($env:OMNIVOICE_HF_MODEL_ID) { $env:OMNIVOICE_HF_MODEL_ID } else { "k2-fsa/OmniVoice" }
$OmniVoiceLocalDirname = if ($env:OMNIVOICE_LOCAL_DIRNAME) { $env:OMNIVOICE_LOCAL_DIRNAME } else { "OmniVoice" }
if (($Profile -eq "all") -or ($Profile -eq "omnivoice")) {
    Assert-VendoredSource -Name "OmniVoice" -TargetDir $OmniVoiceDir
    if (-not (Test-Path (Join-Path $OmniVoiceDir "pyproject.toml"))) {
        throw "OmniVoice vendored source is incomplete (missing pyproject.toml): $OmniVoiceDir"
    }
    if ($InstallVendorRuntimes -eq "1") {
        if (-not (Test-Path $OmniVoiceVenv)) {
            Write-Host "Creating OmniVoice venv -> $OmniVoiceVenv"
            python -m venv $OmniVoiceVenv
        }
        $OmniVoicePython = Join-Path $OmniVoiceVenv "Scripts\python.exe"
        & $OmniVoicePython -m pip install --upgrade pip wheel setuptools | Out-Host

        $OmniVoiceTorchProfile = if ($env:OMNIVOICE_TORCH_PROFILE) { $env:OMNIVOICE_TORCH_PROFILE } else { Detect-TorchProfileForWindows }
        if ($OmniVoiceTorchProfile -eq "cu121") { $OmniVoiceTorchProfile = "cu128" }
        Write-Host "Installing OmniVoice runtime into $OmniVoiceVenv (torch profile: $OmniVoiceTorchProfile)"
        $env:OMNIVOICE_TORCH_PROFILE = $OmniVoiceTorchProfile
        & $OmniVoicePython (Join-Path $RootDir "scripts\install_omnivoice_runtime.py") --repo-root $OmniVoiceDir --torch-profile $OmniVoiceTorchProfile | Out-Host
    }
    else {
        Write-Host "Skipping OmniVoice runtime install during model download."
    }

    python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

target = Path(r'''$OmniVoiceModelDir''') / r'''$OmniVoiceLocalDirname'''
print(f'Downloading $OmniVoiceHfModelId -> {target}')
snapshot_download(
    repo_id=r'''$OmniVoiceHfModelId''',
    local_dir=str(target),
    local_dir_use_symlinks=False,
    resume_download=True,
)
print('OmniVoice model download completed.')
"@
    Assert-NonEmptyModelDir -Name "OmniVoice" -TargetDir (Join-Path $OmniVoiceModelDir $OmniVoiceLocalDirname)
}

# --------------------------------------------------------------------------
# ACE-Step-1.5 (Alibaba, Apache 2.0) — .venv-ace-step + checkpoint cache
# --------------------------------------------------------------------------
$AceStepDownloadProfile = if ($env:ACE_STEP_DOWNLOAD_PROFILE) { $env:ACE_STEP_DOWNLOAD_PROFILE } else { "main" }
if (($Profile -eq "all") -or ($Profile -eq "ace-step")) {
    Assert-VendoredSource -Name "ACE-Step" -TargetDir $AceStepDir
    if (-not (Test-Path $AceStepVenv)) {
        Write-Host "Creating ACE-Step venv -> $AceStepVenv"
        python -m venv $AceStepVenv
    }
    $AceStepPython = Join-Path $AceStepVenv "Scripts\python.exe"
    & $AceStepPython -m pip install --upgrade pip wheel setuptools hatchling | Out-Host
    Write-Host "Installing ACE-Step-1.5 into $AceStepVenv (this may take a while)"
    Write-Host "Note: nano-vllm includes CUDA kernels. On Windows native this may fail without MSVC + CUDA toolkit installed; WSL2 is the most reliable path."

    $UseUv = $false
    try {
        $null = & uv --version 2>$null
        if ($LASTEXITCODE -eq 0) { $UseUv = $true }
    } catch { }

    if ($UseUv) {
        # ACE-Step 1.5 declares nano-vllm as a local source in pyproject.toml.
        # uv honors [tool.uv.sources]; plain pip does not.
        uv pip install --python $AceStepPython -e $AceStepDir | Out-Host
        if ($env:HF_HUB_ENABLE_HF_TRANSFER -eq "1") {
            uv pip install --python $AceStepPython hf_transfer | Out-Host
        }
    }
    else {
        Write-Host "uv not found; using pip fallback with local nano-vllm source."
        $NanoVllmDir = Join-Path $AceStepDir "acestep\third_parts\nano-vllm"
        if (Test-Path $NanoVllmDir) {
            & $AceStepPython -m pip install -e $NanoVllmDir | Out-Host
        }
        & $AceStepPython -m pip install --no-deps -e $AceStepDir | Out-Host
        if ($env:HF_HUB_ENABLE_HF_TRANSFER -eq "1") {
            & $AceStepPython -m pip install hf_transfer | Out-Host
        }
    }

    Write-Host "Downloading ACE-Step-1.5 checkpoints (profile: $AceStepDownloadProfile) -> $AceStepModelDir"
    $env:ACESTEP_CHECKPOINTS_DIR = $AceStepModelDir
    switch ($AceStepDownloadProfile) {
        { @("none", "skip") -contains $_ } {
            Write-Host ("ACE_STEP_DOWNLOAD_PROFILE={0}: skipping checkpoint download. Models will be fetched on first generation." -f $_)
        }
        "all" {
            & $AceStepPython -m acestep.model_downloader --all --dir $AceStepModelDir
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "ACE-Step --all download failed. Retry: $AceStepPython -m acestep.model_downloader --all --dir $AceStepModelDir"
            }
        }
        "main" {
            & $AceStepPython -m acestep.model_downloader --dir $AceStepModelDir
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "ACE-Step main download failed. Retry: $AceStepPython -m acestep.model_downloader --dir $AceStepModelDir"
            }
        }
        Default {
            & $AceStepPython -m acestep.model_downloader --model $AceStepDownloadProfile --dir $AceStepModelDir
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "ACE-Step download for model '$AceStepDownloadProfile' failed."
            }
        }
    }
}

if ($Profile -eq "s2pro") {
    Write-Host "S2-Pro-only profile completed."
    exit 0
}

$MMAudioDir = if ($env:MMAUDIO_REPO_ROOT) { $env:MMAUDIO_REPO_ROOT } else { Join-Path $VendorDir "MMAudio" }
$DefaultRvcModelUrl = if ($env:APPLIO_DEFAULT_RVC_MODEL_URL) { $env:APPLIO_DEFAULT_RVC_MODEL_URL } else { "https://huggingface.co/SmlCoke/rvc-yui/resolve/main/weights/yui-mix-pro-hq-40k.pth" }
$DefaultRvcIndexUrl = if ($env:APPLIO_DEFAULT_RVC_INDEX_URL) { $env:APPLIO_DEFAULT_RVC_INDEX_URL } else { "https://huggingface.co/SmlCoke/rvc-yui/resolve/main/index/added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index" }
$DefaultRvcModelFilename = if ($env:APPLIO_DEFAULT_RVC_MODEL_FILENAME) { $env:APPLIO_DEFAULT_RVC_MODEL_FILENAME } else { "yui-mix-pro-hq-40k.pth" }
$DefaultRvcIndexFilename = if ($env:APPLIO_DEFAULT_RVC_INDEX_FILENAME) { $env:APPLIO_DEFAULT_RVC_INDEX_FILENAME } else { "added_IVF1386_Flat_nprobe_1_yui-mix-pro-hq_v2.index" }
$SkipDefaultRvc = if ($env:APPLIO_SKIP_DEFAULT_RVC) { $env:APPLIO_SKIP_DEFAULT_RVC } else { "0" }
$ApplioContentvecModelUrl = if ($env:APPLIO_CONTENTVEC_MODEL_URL) { $env:APPLIO_CONTENTVEC_MODEL_URL } else { "https://huggingface.co/IAHispano/Applio/resolve/main/Resources/embedders/contentvec/pytorch_model.bin" }
$ApplioContentvecConfigUrl = if ($env:APPLIO_CONTENTVEC_CONFIG_URL) { $env:APPLIO_CONTENTVEC_CONFIG_URL } else { "https://huggingface.co/IAHispano/Applio/resolve/main/Resources/embedders/contentvec/config.json" }
$ApplioRmvpeUrl = if ($env:APPLIO_RMVPE_URL) { $env:APPLIO_RMVPE_URL } else { "https://huggingface.co/IAHispano/Applio/resolve/main/Resources/predictors/rmvpe.pt" }

Assert-VendoredSource -Name "Applio" -TargetDir $ApplioDir

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

Assert-VendoredSource -Name "MMAudio" -TargetDir $MMAudioDir

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

$MMAudioDefaultVariant = if ($env:MMAUDIO_DEFAULT_VARIANT) { $env:MMAUDIO_DEFAULT_VARIANT } else { "large_44k_v2" }
switch ($MMAudioDefaultVariant) {
    "small_16k" { $MMAudioDefaultModelFilename = "mmaudio_small_16k.pth" }
    "small_44k" { $MMAudioDefaultModelFilename = "mmaudio_small_44k.pth" }
    "medium_44k" { $MMAudioDefaultModelFilename = "mmaudio_medium_44k.pth" }
    "large_44k" { $MMAudioDefaultModelFilename = "mmaudio_large_44k.pth" }
    default {
        $MMAudioDefaultVariant = "large_44k_v2"
        $MMAudioDefaultModelFilename = "mmaudio_large_44k_v2.pth"
    }
}
$MMAudioDefaultModelUrl = if ($env:MMAUDIO_DEFAULT_MODEL_URL) { $env:MMAUDIO_DEFAULT_MODEL_URL } else { "https://huggingface.co/hkchengrex/MMAudio/resolve/main/weights/$MMAudioDefaultModelFilename" }
$MMAudioVae44kUrl = if ($env:MMAUDIO_VAE_44K_URL) { $env:MMAUDIO_VAE_44K_URL } else { "https://github.com/hkchengrex/MMAudio/releases/download/v0.1/v1-44.pth" }
$MMAudioSynchformerUrl = if ($env:MMAUDIO_SYNCHFORMER_URL) { $env:MMAUDIO_SYNCHFORMER_URL } else { "https://github.com/hkchengrex/MMAudio/releases/download/v0.1/synchformer_state_dict.pth" }
$MMAudioEmptyStringUrl = if ($env:MMAUDIO_EMPTY_STRING_URL) { $env:MMAUDIO_EMPTY_STRING_URL } else { "https://github.com/hkchengrex/MMAudio/releases/download/v0.1/empty_string.pth" }
if ((($Profile -eq "all") -or ($Profile -eq "mmaudio")) -and (Test-Path $MMAudioDir)) {
    $ExtWeightsDir = Join-Path $MMAudioDir "ext_weights"
    $WeightsDir = Join-Path $MMAudioDir "weights"
    New-Item -ItemType Directory -Force -Path $WeightsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $ExtWeightsDir | Out-Null
    $MMAudioAssets = @(
        @{ PrivatePath = "mmaudio/weights/$MMAudioDefaultModelFilename"; TargetPath = (Join-Path $WeightsDir $MMAudioDefaultModelFilename); Url = $MMAudioDefaultModelUrl },
        @{ PrivatePath = "mmaudio/ext_weights/v1-44.pth"; TargetPath = (Join-Path $ExtWeightsDir "v1-44.pth"); Url = $MMAudioVae44kUrl },
        @{ PrivatePath = "mmaudio/ext_weights/synchformer_state_dict.pth"; TargetPath = (Join-Path $ExtWeightsDir "synchformer_state_dict.pth"); Url = $MMAudioSynchformerUrl },
        @{ PrivatePath = "mmaudio/ext_weights/empty_string.pth"; TargetPath = (Join-Path $ExtWeightsDir "empty_string.pth"); Url = $MMAudioEmptyStringUrl }
    )
    foreach ($Asset in $MMAudioAssets) {
        if (Test-Path $Asset.TargetPath) {
            Write-Host "MMAudio asset already present: $($Asset.TargetPath)"
        }
        elseif (Download-PrivateAsset -RepoPath $Asset.PrivatePath -TargetPath $Asset.TargetPath) {
            Write-Host "Downloaded MMAudio asset from private asset repo: $($Asset.PrivatePath)"
        }
        else {
            Write-Host "Downloading MMAudio asset -> $($Asset.TargetPath)"
            Invoke-WebRequest -Uri $Asset.Url -OutFile $Asset.TargetPath
        }
    }
}

$MMAudioNsfwModelUrl = if ($env:MMAUDIO_NSFW_MODEL_URL) { $env:MMAUDIO_NSFW_MODEL_URL } else { "https://huggingface.co/phazei/NSFW_MMaudio/resolve/main/mmaudio_large_44k_nsfw_gold_8.5k_final_fp16.safetensors" }
if ((($Profile -eq "all") -or ($Profile -eq "mmaudio")) -and $MMAudioNsfwModelUrl) {
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
function Detect-TorchProfileForWindows {
    try {
        $null = & nvidia-smi 2>$null
        if ($LASTEXITCODE -eq 0) {
            return "cu121"
        }
    } catch { }
    return "cpu"
}

# --------------------------------------------------------------------------
# CosyVoice 3 (FunAudioLLM, Apache 2.0) — .venv-cosyvoice3 + HF weight bundle
# --------------------------------------------------------------------------
$CosyVoiceHfModelId = if ($env:COSYVOICE_HF_MODEL_ID) { $env:COSYVOICE_HF_MODEL_ID } else { "FunAudioLLM/CosyVoice2-0.5B" }
$CosyVoiceLocalDirname = if ($env:COSYVOICE_LOCAL_DIRNAME) { $env:COSYVOICE_LOCAL_DIRNAME } else { "CosyVoice2-0.5B" }
if (($Profile -eq "all") -or ($Profile -eq "cosyvoice")) {
    Assert-VendoredSource -Name "CosyVoice" -TargetDir $CosyVoiceDir
    if ($InstallVendorRuntimes -eq "1") {
        if (-not (Test-Path $CosyVoiceVenv)) {
            Write-Host "Creating CosyVoice venv -> $CosyVoiceVenv"
            python -m venv $CosyVoiceVenv
        }
        $CosyVoicePython = Join-Path $CosyVoiceVenv "Scripts\python.exe"
        & $CosyVoicePython -m pip install --upgrade pip wheel setuptools | Out-Host

        $CosyVoiceTorchProfile = if ($env:COSYVOICE_TORCH_PROFILE) { $env:COSYVOICE_TORCH_PROFILE } else { Detect-TorchProfileForWindows }
        Write-Host "Installing CosyVoice runtime into $CosyVoiceVenv (torch profile: $CosyVoiceTorchProfile)"
        $env:COSYVOICE_TORCH_PROFILE = $CosyVoiceTorchProfile
        & $CosyVoicePython (Join-Path $RootDir "scripts\install_cosyvoice_runtime.py") --repo-root $CosyVoiceDir --torch-profile $CosyVoiceTorchProfile | Out-Host
    }
    else {
        Write-Host "Skipping CosyVoice runtime install during model download."
    }

    python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

target = Path(r'''$CosyVoiceModelDir''') / r'''$CosyVoiceLocalDirname'''
print(f'Downloading $CosyVoiceHfModelId -> {target}')
snapshot_download(
    repo_id=r'''$CosyVoiceHfModelId''',
    local_dir=str(target),
    local_dir_use_symlinks=False,
    resume_download=True,
)
print('CosyVoice 3 model download completed.')
print('Note: Fun-CosyVoice3 official weights are on ModelScope (iic/Fun-CosyVoice3-0.5B). Override COSYVOICE_HF_MODEL_ID + COSYVOICE_LOCAL_DIRNAME to switch.')
"@
    Assert-NonEmptyModelDir -Name "CosyVoice" -TargetDir (Join-Path $CosyVoiceModelDir $CosyVoiceLocalDirname)
}

# --------------------------------------------------------------------------
# VoxCPM2 (OpenBMB, Apache 2.0) — .venv-voxcpm2 + HF weight bundle
# --------------------------------------------------------------------------
$VoxCPMHfModelId = if ($env:VOXCPM_HF_MODEL_ID) { $env:VOXCPM_HF_MODEL_ID } else { "openbmb/VoxCPM2" }
$VoxCPMLocalDirname = if ($env:VOXCPM_LOCAL_DIRNAME) { $env:VOXCPM_LOCAL_DIRNAME } else { "VoxCPM2" }
if (($Profile -eq "all") -or ($Profile -eq "voxcpm")) {
    Assert-VendoredSource -Name "VoxCPM" -TargetDir $VoxCPMDir
    if ($InstallVendorRuntimes -eq "1") {
        if (-not (Test-Path $VoxCPMVenv)) {
            Write-Host "Creating VoxCPM venv -> $VoxCPMVenv"
            python -m venv $VoxCPMVenv
        }
        $VoxCPMPython = Join-Path $VoxCPMVenv "Scripts\python.exe"
        & $VoxCPMPython -m pip install --upgrade pip wheel setuptools | Out-Host

        $VoxCPMTorchProfile = if ($env:VOXCPM_TORCH_PROFILE) { $env:VOXCPM_TORCH_PROFILE } else { Detect-TorchProfileForWindows }
        Write-Host "Installing VoxCPM runtime into $VoxCPMVenv (torch profile: $VoxCPMTorchProfile)"
        $env:VOXCPM_TORCH_PROFILE = $VoxCPMTorchProfile
        & $VoxCPMPython (Join-Path $RootDir "scripts\install_voxcpm_runtime.py") --repo-root $VoxCPMDir --torch-profile $VoxCPMTorchProfile | Out-Host
    }
    else {
        Write-Host "Skipping VoxCPM runtime install during model download."
    }

    python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

target = Path(r'''$VoxCPMModelDir''') / r'''$VoxCPMLocalDirname'''
print(f'Downloading $VoxCPMHfModelId -> {target}')
snapshot_download(
    repo_id=r'''$VoxCPMHfModelId''',
    local_dir=str(target),
    local_dir_use_symlinks=False,
    resume_download=True,
)
print('VoxCPM2 model download completed.')
"@
    Assert-NonEmptyModelDir -Name "VoxCPM2" -TargetDir (Join-Path $VoxCPMModelDir $VoxCPMLocalDirname)
}

# --------------------------------------------------------------------------
# Supertonic 3 (Supertone, BigScience Open RAIL-M) — ONNX bundle into main .venv
# --------------------------------------------------------------------------
$SupertonicHfModelId = if ($env:SUPERTONIC_HF_MODEL_ID) { $env:SUPERTONIC_HF_MODEL_ID } else { "Supertone/supertonic-3" }
if (($Profile -eq "all") -or ($Profile -eq "supertonic")) {
    Assert-VendoredSource -Name "Supertonic" -TargetDir $SupertonicDir
    Write-Host "Ensuring onnxruntime in main venv for Supertonic 3 in-process inference"
    python -c "import onnxruntime" 2>$null
    if ($LASTEXITCODE -ne 0) {
        uv pip install "onnxruntime>=1.23.0" soundfile librosa | Out-Host
    }

    python -c @"
from pathlib import Path
from huggingface_hub import snapshot_download

target = Path(r'''$SupertonicModelDir''')
print(f'Downloading $SupertonicHfModelId -> {target}')
snapshot_download(
    repo_id=r'''$SupertonicHfModelId''',
    local_dir=str(target),
    local_dir_use_symlinks=False,
    resume_download=True,
)
print('Supertonic 3 ONNX bundle download completed.')
"@
    Assert-NonEmptyModelDir -Name "Supertonic 3" -TargetDir $SupertonicModelDir
}

Write-Host "Suggested next step:"
Write-Host "  cd app\backend; ..\..\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
