param(
    [string]$Python = ""
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "app\backend"
$VenvDir = Join-Path $RootDir ".venv"
$VendorDir = Join-Path $RootDir "vendor"
$UpstreamQwenDir = Join-Path $VendorDir "Qwen3-TTS"
$QwenExtensionsDir = Join-Path $RootDir "qwen_extensions"
$MMAudioRepoUrlDefault = "https://github.com/hkchengrex/MMAudio.git"
$ApplioRepoUrlDefault = "https://github.com/IAHispano/Applio.git"
$FlashAttnWheelUrl = "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.9.4/flash_attn-2.8.3+cu130torch2.11-cp311-cp311-linux_x86_64.whl"

function Resolve-Python {
    param([string]$Requested)

    if ($Requested) {
        return $Requested
    }

    foreach ($candidate in @("py -3.11", "python3.11", "python")) {
        try {
            if ($candidate -like "py *") {
                & py -3.11 --version | Out-Null
                return "py -3.11"
            }
            else {
                & $candidate --version | Out-Null
                return $candidate
            }
        }
        catch {
        }
    }

    throw "Python 3.11+ interpreter not found."
}

$PythonCmd = Resolve-Python -Requested $Python
Write-Host "Using Python: $PythonCmd"
Write-Host "Repo root: $RootDir"
New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null

if (-not (Test-Path $UpstreamQwenDir)) {
    throw "vendor\Qwen3-TTS is missing. This repository expects Qwen3-TTS to be vendored under $UpstreamQwenDir."
}

if (-not (Test-Path $QwenExtensionsDir)) {
    throw "qwen_extensions is missing. CustomVoice/VoiceBox fine-tuning scripts are expected under $QwenExtensionsDir."
}

if (-not $env:UV_CACHE_DIR) {
    $env:UV_CACHE_DIR = Join-Path $RootDir ".uv-cache"
}

try {
    & uv --version | Out-Null
}
catch {
    throw "uv is required but was not found in PATH."
}

try {
    & sox --version | Out-Null
}
catch {
    Write-Warning "sox is not installed. On Windows, install it with winget/choco/scoop and add it to PATH."
}

try {
    & ffmpeg -version | Out-Null
}
catch {
    Write-Warning "ffmpeg is not installed. Qwen3-ASR transcription can fail without ffmpeg in PATH."
    Write-Warning "On Windows, install ffmpeg with winget/choco/scoop and add it to PATH."
}

if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating virtual environment at $VenvDir"
    if ($PythonCmd -eq "py -3.11") {
        & uv venv --python "3.11" $VenvDir
    }
    else {
        & uv venv --python $PythonCmd $VenvDir
    }
}

$ActivatePath = Join-Path $VenvDir "Scripts\Activate.ps1"
. $ActivatePath

try {
    python -m pip --version | Out-Null
}
catch {
    python -m ensurepip --upgrade
}

uv sync
uv pip install hf_transfer certifi

$IsMac = $PSVersionTable.OS -match "Darwin|macOS"
$HasCuda = $false
try {
    & nvidia-smi | Out-Null
    $HasCuda = $true
}
catch {
}

if ($IsMac) {
    if (-not $env:QWEN_DEMO_ATTN_IMPL) {
        $env:QWEN_DEMO_ATTN_IMPL = "sdpa"
    }
    Write-Host "macOS detected: defaulting attention to sdpa."
}
elseif ($HasCuda) {
    $HasFlashAttn = $false
    try {
        python -c "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('flash_attn') else 1)"
        $HasFlashAttn = $true
    }
    catch {
    }

    if (-not $HasFlashAttn) {
        Write-Host "CUDA environment detected: attempting to install the validated flash-attn v2 wheel."
        try {
            uv pip install --no-cache-dir $FlashAttnWheelUrl
        }
        catch {
            Write-Warning "flash-attn installation failed. Falling back to sdpa."
        }
    }
}

$EnvExample = Join-Path $BackendDir ".env.example"
$EnvPath = Join-Path $BackendDir ".env"
if (-not (Test-Path $EnvPath)) {
    Copy-Item $EnvExample $EnvPath
    Write-Host "Created $EnvPath from template."
}

Get-Content $EnvPath | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') {
        return
    }
    $name, $value = $_ -split '=', 2
    [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}

function Clone-RepoIfMissing {
    param(
        [string]$RepoUrl,
        [string]$TargetDir
    )

    $GitDir = Join-Path $TargetDir ".git"
    if (Test-Path $GitDir) {
        Write-Host "Using existing repo: $TargetDir"
        return
    }

    if ((Test-Path $TargetDir) -and (Get-ChildItem -Force $TargetDir | Select-Object -First 1)) {
        Write-Warning "Skipping clone because target exists and is not empty: $TargetDir"
        return
    }

    Write-Host "Cloning $RepoUrl -> $TargetDir"
    git clone $RepoUrl $TargetDir
}

function Install-OptionalRepoRequirements {
    param([string]$RepoDir)

    foreach ($Candidate in @(
        (Join-Path $RepoDir "requirements.txt"),
        (Join-Path $RepoDir "requirements\main.txt"),
        (Join-Path $RepoDir "requirements\base.txt")
    )) {
        if (Test-Path $Candidate) {
            Write-Host "Installing optional requirements from $Candidate"
            try {
                uv pip install -r $Candidate
            }
            catch {
                Write-Warning "Failed to install $Candidate. Continue and configure manually if needed."
            }
            return
        }
    }
}

$MMAudioRepoRoot = if ($env:MMAUDIO_REPO_ROOT) { $env:MMAUDIO_REPO_ROOT } else { Join-Path $VendorDir "MMAudio" }
$ApplioRepoRoot = if ($env:APPLIO_REPO_ROOT) { $env:APPLIO_REPO_ROOT } else { Join-Path $VendorDir "Applio" }
$MMAudioRepoUrl = if ($env:MMAUDIO_REPO_URL) { $env:MMAUDIO_REPO_URL } else { $MMAudioRepoUrlDefault }
$ApplioRepoUrl = if ($env:APPLIO_REPO_URL) { $env:APPLIO_REPO_URL } else { $ApplioRepoUrlDefault }

Clone-RepoIfMissing -RepoUrl $MMAudioRepoUrl -TargetDir $MMAudioRepoRoot
Clone-RepoIfMissing -RepoUrl $ApplioRepoUrl -TargetDir $ApplioRepoRoot
Install-OptionalRepoRequirements -RepoDir $MMAudioRepoRoot
Install-OptionalRepoRequirements -RepoDir $ApplioRepoRoot

python -c "import importlib.util, platform, torch; device='cpu'; device='cuda:0' if torch.cuda.is_available() else ('mps' if getattr(torch.backends,'mps',None) is not None and torch.backends.mps.is_available() else 'cpu'); attn='sdpa'; attn='flash_attention_2' if platform.system() != 'Darwin' and device.startswith('cuda') and importlib.util.find_spec('flash_attn') else attn; print(f'Runtime summary: device={device}, attention={attn}, torch={torch.__version__}')"

Write-Host ""
Write-Host "Backend setup complete."
Write-Host "Next steps:"
Write-Host "  1. Edit $EnvPath if needed"
Write-Host "  2. Run .\scripts\download_models.ps1"
Write-Host "     For S2-Pro only: .\scripts\download_models.ps1 s2pro"
Write-Host "     S2-Pro local engine is started by the backend when first used."
Write-Host "  3. Start backend with:"
Write-Host "     cd app\backend; ..\..\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
