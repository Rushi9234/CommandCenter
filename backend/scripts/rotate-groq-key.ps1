[CmdletBinding()]
param(
  [string]$ProjectName = 'commandcenter-backend',
  [string]$ProductionUrl = 'https://commandcenter-backend.vercel.app',
  [string]$Model = 'openai/gpt-oss-20b'
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "Required command '$Name' was not found."
  }
}

function Convert-SecureStringToPlainText([Security.SecureString]$SecureValue) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Update-LocalEnvValue([string]$Path, [string]$Name, [string]$Value) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "Local environment file not found: $Path"
  }

  $lines = @(Get-Content -LiteralPath $Path)
  $pattern = '^\s*' + [regex]::Escape($Name) + '\s*='
  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $found = $true
      "$Name=$Value"
    }
    else {
      $line
    }
  }

  if (-not $found) {
    $updated += "$Name=$Value"
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllLines($Path, $updated, $utf8NoBom)
}

function Test-GroqKey([string]$Key, [string]$ExpectedModel) {
  $env:CC_ROTATE_GROQ_KEY = $Key
  $env:CC_ROTATE_GROQ_MODEL = $ExpectedModel

  try {
    $probe = @'
const key = process.env.CC_ROTATE_GROQ_KEY;
const model = process.env.CC_ROTATE_GROQ_MODEL;
if (!key) process.exit(2);
fetch('https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ${key}` }
})
  .then(async (r) => {
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const models = Array.isArray(data?.data) ? data.data : [];
    const found = models.some((m) => m?.id === model && m?.active !== false);
    console.log(JSON.stringify({ status: r.status, configured: true, modelAvailable: found }));
    process.exit(r.ok && found ? 0 : 1);
  })
  .catch((error) => {
    console.log(JSON.stringify({ status: 0, configured: true, modelAvailable: false }));
    process.exit(1);
  });
'@
    $result = node -e $probe 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Groq validation failed: $result" -ForegroundColor Red
      return $false
    }

    Write-Host "Groq key validated; target model is available." -ForegroundColor Green
    return $true
  }
  finally {
    Remove-Item Env:CC_ROTATE_GROQ_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CC_ROTATE_GROQ_MODEL -ErrorAction SilentlyContinue
  }
}

function Get-VercelProjectContext([string]$BackendDir) {
  $projectFile = Join-Path $BackendDir '.vercel/project.json'
  if (-not (Test-Path -LiteralPath $projectFile)) {
    Fail "Vercel project is not linked. Run 'vercel link' from $BackendDir once."
  }

  try {
    return Get-Content -Raw -LiteralPath $projectFile | ConvertFrom-Json
  }
  catch {
    Fail "Could not read $projectFile."
  }
}

function Update-VercelGroqKey([string]$Project, [string]$Key, $ProjectContext) {
  $token = $env:VERCEL_TOKEN
  if (-not $token) {
    $secureToken = Read-Host 'Enter your Vercel Access Token (stored only in memory for this run)' -AsSecureString
    if (-not $secureToken) {
      Fail 'A Vercel Access Token is required for automated rotation.'
    }
    $token = Convert-SecureStringToPlainText $secureToken
  }

  $uri = "https://api.vercel.com/v10/projects/$Project/env?upsert=true"
  if ($ProjectContext.orgId -and [string]$ProjectContext.orgId -like 'team_*') {
    $uri += '&teamId=' + [uri]::EscapeDataString([string]$ProjectContext.orgId)
  }

  $payload = @(
    @{
      key = 'GROQ_API_KEY'
      value = $Key
      type = 'sensitive'
      target = @('production')
    }
  ) | ConvertTo-Json -Depth 5

  $headers = @{ Authorization = "Bearer $token" }

  try {
    $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $payload
    if (-not $response) {
      Fail 'Vercel returned an empty response while updating GROQ_API_KEY.'
    }
    Write-Host 'Vercel Production GROQ_API_KEY updated.' -ForegroundColor Green
  }
  catch {
    $message = $_.ErrorDetails.Message
    if (-not $message) { $message = $_.Exception.Message }
    Fail "Vercel environment update failed: $message"
  }
}

function Verify-VercelProductionGroq([string]$ExpectedModel) {
  $probe = @"
const expectedModel = '$ExpectedModel';
fetch('https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ` + process.env.GROQ_API_KEY }
})
  .then(async (r) => {
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const models = Array.isArray(data?.data) ? data.data : [];
    const configured = Boolean(process.env.GROQ_API_KEY);
    const found = models.some((m) => m?.id === expectedModel && m?.active !== false);
    console.log(JSON.stringify({ configured, keyLength: process.env.GROQ_API_KEY?.length || 0, modelAvailable: found, status: r.status }));
    process.exit(configured && r.ok && found ? 0 : 1);
  })
  .catch(() => process.exit(1));
"@

  Push-Location $script:BackendDir
  try {
    $output = & vercel env run -e production -- node -e $probe 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host ($output -join [Environment]::NewLine) -ForegroundColor Red
      Fail 'Vercel Production environment verification failed.'
    }

    $jsonLine = $output | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
    if (-not $jsonLine) {
      Write-Host ($output -join [Environment]::NewLine)
      Fail 'Could not read the Vercel Production verification result.'
    }

    $result = $jsonLine | ConvertFrom-Json
    if (-not $result.configured -or -not $result.modelAvailable -or [int]$result.status -ne 200) {
      Write-Host ($output -join [Environment]::NewLine) -ForegroundColor Red
      Fail 'Vercel Production GROQ_API_KEY is missing, empty, invalid, or cannot access the expected model.'
    }

    Write-Host "Vercel Production key verified (length $($result.keyLength)); model '$ExpectedModel' is available." -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}

function Deploy-Production([string]$BackendDir) {
  Write-Host 'Running backend build...' -ForegroundColor Cyan
  Push-Location $BackendDir
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      Fail 'Backend build failed. Production was not deployed.'
    }

    Write-Host 'Deploying current committed backend to Vercel Production...' -ForegroundColor Cyan
    vercel deploy --prod
    if ($LASTEXITCODE -ne 0) {
      Fail 'Vercel production deployment failed.'
    }
  }
  finally {
    Pop-Location
  }
}

function Verify-ProductionHealth([string]$Url) {
  $healthUrl = "$Url/health"
  try {
    $response = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 30
    $json = $response | ConvertTo-Json -Compress
    Write-Host "Production health: $json" -ForegroundColor Green

    if ($response.status -ne 'ok') {
      Fail 'Production health check did not return status=ok.'
    }

    if (-not ($response.message -match 'PostgreSQL Mode')) {
      Fail 'Production health check did not confirm PostgreSQL Mode.'
    }
  }
  catch {
    Fail "Production health check failed: $($_.Exception.Message)"
  }
}

# --- Main ---
Require-Command 'git'
Require-Command 'node'
Require-Command 'npm'
Require-Command 'vercel'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:BackendDir = Join-Path $repoRoot 'backend'
$localEnv = Join-Path $script:BackendDir '.env'

if (-not (Test-Path -LiteralPath $script:BackendDir)) {
  Fail "Backend directory not found: $script:BackendDir"
}

$gitStatus = git -C $repoRoot status --porcelain
if ($gitStatus) {
  Write-Host ($gitStatus -join [Environment]::NewLine) -ForegroundColor Yellow
  Fail 'Working tree is not clean. Commit or stash code changes before rotating a production secret.'
}

if (-not (git -C $repoRoot check-ignore -q -- backend/.env)) {
  Fail 'backend/.env is not ignored by Git. Refusing to continue so the new secret cannot accidentally be committed.'
}

$projectContext = Get-VercelProjectContext $script:BackendDir

Write-Host ''
Write-Host '=== CommandCenter Groq Key Rotation ===' -ForegroundColor Cyan
Write-Host "Project: $ProjectName"
Write-Host "Production URL: $ProductionUrl"
Write-Host "Model: $Model"
Write-Host ''

$secureGroqKey = Read-Host 'Enter the NEW Groq API key' -AsSecureString
$groqKey = Convert-SecureStringToPlainText $secureGroqKey
if ([string]::IsNullOrWhiteSpace($groqKey)) {
  Fail 'Groq API key cannot be empty.'
}

Write-Host '1/5 Validating new Groq key...' -ForegroundColor Cyan
if (-not (Test-GroqKey -Key $groqKey -ExpectedModel $Model)) {
  Fail 'New Groq key was not accepted or cannot access the configured model. No local or Vercel changes were made.'
}

Write-Host '2/5 Updating local backend/.env...' -ForegroundColor Cyan
Update-LocalEnvValue -Path $localEnv -Name 'GROQ_API_KEY' -Value $groqKey
Write-Host 'Local GROQ_API_KEY updated.' -ForegroundColor Green

Write-Host '3/5 Updating Vercel Production environment...' -ForegroundColor Cyan
Update-VercelGroqKey -Project $ProjectName -Key $groqKey -ProjectContext $projectContext

# Do not print the secret. Verify through Vercel's injected runtime environment.
Write-Host '4/5 Verifying Vercel Production environment...' -ForegroundColor Cyan
Verify-VercelProductionGroq -ExpectedModel $Model

# The old deployment keeps using its captured environment until a new deployment is created.
# That is intentional: update the Vercel variable first, verify it, then deploy.
Write-Host '5/5 Deploying and checking Production...' -ForegroundColor Cyan
Deploy-Production -BackendDir $script:BackendDir
Verify-ProductionHealth -Url $ProductionUrl

Remove-Variable groqKey -ErrorAction SilentlyContinue
Remove-Variable secureGroqKey -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Rotation complete.' -ForegroundColor Green
Write-Host 'Next: revoke the OLD Groq key only after confirming the production AI chat works.' -ForegroundColor Yellow
Write-Host 'GitHub was intentionally NOT given the secret; the repository remains secret-free.' -ForegroundColor Cyan
