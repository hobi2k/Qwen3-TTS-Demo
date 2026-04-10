param(
    [string]$Python = ""
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "app\backend"
$VenvDir = Join-Path $RootDir ".venv"

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
    Write-Warning "ffmpeg is not installed. Whisper transcription can fail without ffmpeg in PATH."
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

$EnvExample = Join-Path $BackendDir ".env.example"
$EnvPath = Join-Path $BackendDir ".env"
if (-not (Test-Path $EnvPath)) {
    Copy-Item $EnvExample $EnvPath
    Write-Host "Created $EnvPath from template."
}

python -c "import importlib.util, torch; device='cpu'; device='cuda:0' if torch.cuda.is_available() else ('mps' if getattr(torch.backends,'mps',None) is not None and torch.backends.mps.is_available() else 'cpu'); attn='flash_attention_2' if importlib.util.find_spec('flash_attn') else 'sdpa'; print(f'Runtime summary: device={device}, attention={attn}, torch={torch.__version__}')"

Write-Host ""
Write-Host "Backend setup complete."
Write-Host "Next steps:"
Write-Host "  1. Edit $EnvPath if needed"
Write-Host "  2. Run .\scripts\download_models.ps1"
Write-Host "  3. Start backend with:"
Write-Host "     cd app\backend; ..\..\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
