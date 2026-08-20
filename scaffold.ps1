#requires -Version 5.1
<#
.SYNOPSIS
  fastapi-nextjs-pg-starter 신규 프로젝트 스캐폴드 (architecture.md 준수).

.DESCRIPTION
  skeleton/ 골격을 복사하고 토큰을 치환한 뒤,
  DESIGN.md(선택) → Tailwind 테마, .env 생성, psql 로 DB 생성,
  Alembic 으로 테이블 생성(upgrade head), 의존성 설치까지 한 번에 수행한다.
  마지막에 uvicorn / pnpm dev 실행 방법을 출력한다.

.EXAMPLE
  .\scaffold.ps1 -Name project_test -Target P:\fastapi\project_test

.EXAMPLE
  .\scaffold.ps1 -Name Demo -Target P:\tmp\Demo -SkipDb -SkipInstall
#>
[CmdletBinding()]
param(
  [string]$Name,
  [string]$Target,
  [switch]$SkipDb,
  [switch]$SkipInstall,
  [switch]$Design,
  [switch]$NoDesign,
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$DbUser = "postgres",
  [string]$DbPassword,
  [string]$DbName
)

$ErrorActionPreference = "Stop"
# 한글 메시지가 콘솔에서 깨지지 않도록 출력 인코딩을 UTF-8 로 (Windows PowerShell 5.1 대응)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$TemplateDir = $PSScriptRoot
$SkeletonDir = Join-Path $TemplateDir "skeleton"
$DesignFile  = Join-Path $TemplateDir "DESIGN.md"
$Enc = [System.Text.UTF8Encoding]::new($false)

function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }

# 비대화형 호스트(CI·-NonInteractive)에서 Read-Host 예외로 즉사하지 않도록 감싼다 (scaffold.sh 의 [ -t 0 ] 대응)
function Read-HostSafe([string]$prompt) {
  try { return Read-Host $prompt } catch { return "" }
}

# 대화형 여부 판정 (scaffold.sh 의 [ -t 0 ] 대응) — 입력이 리다이렉트/파이프면 비대화형으로 본다.
# 판정 불가 시 안전하게 비대화형($false)으로 처리해 재입력 프롬프트에서 멈추지 않도록 한다.
function Test-Interactive {
  try { return ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) } catch { return $false }
}

# 최소 버전 로드 (단일 출처 versions.env — Enable-VersionManagers 의 fnm use 에서도 쓰므로 먼저 읽는다)
$_Bootstrap   = Join-Path $TemplateDir 'skeleton\scripts\bootstrap.ps1'
$_VersionsEnv = Join-Path $TemplateDir 'skeleton\scripts\versions.env'
$_min = @{}
if (Test-Path $_VersionsEnv) {
  Get-Content $_VersionsEnv | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*([0-9.]+)') { $_min[$matches[1]] = $matches[2] }
  }
}

# psql 활성화 — Windows PostgreSQL 설치 관리자는 bin 을 PATH 에 넣지 않는다.
# 설치돼 있는데도 "psql 없음"으로 DB 단계를 건너뛰는 일을 막기 위해 표준 경로를 탐색해
# 현재 세션 PATH 에 추가한다. 여러 메이저가 설치돼 있으면 가장 높은 버전을 쓴다.
function Enable-Psql {
  if (Get-Command psql -ErrorAction SilentlyContinue) { return }
  $roots = @(
    "$env:ProgramFiles\PostgreSQL",
    "${env:ProgramFiles(x86)}\PostgreSQL",
    "$env:LOCALAPPDATA\Programs\PostgreSQL"
  ) | Where-Object { $_ -and (Test-Path $_) }
  $cand = foreach ($r in $roots) {
    Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $exe = Join-Path $_.FullName 'bin\psql.exe'
      if (Test-Path $exe) {
        $n = 0; [void][int]::TryParse(($_.Name -replace '[^0-9].*$',''), [ref]$n)
        [pscustomobject]@{ Ver = $n; Bin = (Split-Path $exe -Parent) }
      }
    }
  }
  $best = $cand | Sort-Object Ver -Descending | Select-Object -First 1
  if ($best) {
    $env:Path = "$($best.Bin);$env:Path"
    Write-Host "  [i]  psql 을 PATH 에서 찾지 못해 설치 경로를 사용합니다: $($best.Bin)" -ForegroundColor Cyan
  }
}

# 런타임 핀 로드 — ⚠️ 반드시 Enable-VersionManagers 보다 먼저 읽어야 한다.
# pyenv 는 "shim 이 PATH 에 있다"와 "어떤 버전을 쓴다"가 별개라, 활성화 시점에 핀 값이 필요하다.
$_pyPinFile   = Join-Path $SkeletonDir '.python-version'
$_pyPin       = if (Test-Path $_pyPinFile) { "$(Get-Content $_pyPinFile -TotalCount 1)".Trim() } else { "" }
$_nodePinFile = Join-Path $SkeletonDir '.nvmrc'
$_nodePin     = if (Test-Path $_nodePinFile) { "$(Get-Content $_nodePinFile -TotalCount 1)".Trim() -replace '^v', '' } else { "" }

# pyenv-win / fnm 활성화 (설치돼 있으면 현재 세션에 적용)
function Enable-VersionManagers {
  $pyenvRoot = "$env:USERPROFILE\.pyenv\pyenv-win"
  if (Test-Path $pyenvRoot) {
    $env:PYENV      = $pyenvRoot
    $env:PYENV_ROOT = $pyenvRoot
    $env:PYENV_HOME = $pyenvRoot
    # PATH 선두에 추가 — 기존 항목은 위치(끝 항목 포함)와 무관하게 제거해 재실행 시 중복 누적 방지
    $rest = ($env:Path -split ';' | Where-Object { $_ -and $_ -ne "$pyenvRoot\bin" -and $_ -ne "$pyenvRoot\shims" }) -join ';'
    $env:Path = "$pyenvRoot\bin;$pyenvRoot\shims;" + $rest
    # ⛔ PATH 에 shim 을 올리는 것과 "어떤 버전을 쓸지" 는 별개다. 전역 버전이 핀보다 낮으면
    #    bootstrap 이 핀을 설치·재사용한 뒤에도 python 이 옛 버전을 가리켜 검증 단계에서 실패한다.
    #    ⚠️ 설치돼 있지 않은 버전을 지정하면 모든 shim 호출이 깨지므로 반드시 설치 여부를 확인한다.
    $_installedNow = @($(try { pyenv versions --bare 2>&1 | Out-String } catch { "" }) -split '\r?\n' |
      ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($_pyPin -and ($_installedNow -contains $_pyPin)) {
      $env:PYENV_VERSION = $_pyPin
    } else {
      # 핀이 설치돼 있지 않으면 하한을 충족하는 설치본 중 가장 높은 것을 고른다 (옛 전역 버전 폴백 방지)
      $_minPy = if ($_min['MIN_PYTHON']) { $_min['MIN_PYTHON'] } else { '3.13' }
      $_cand = $_installedNow | Where-Object { $_ -match '^\d+\.\d+\.\d+$' -and $_.StartsWith("$_minPy.") } |
        Sort-Object { [version]$_ } | Select-Object -Last 1
      if ($_cand) { $env:PYENV_VERSION = $_cand }
    }
  }
  if (Get-Command fnm -ErrorAction SilentlyContinue) {
    # PS 5.1 은 EAP=Stop 아래에서 네이티브 stderr 한 줄을 NativeCommandError 로 종료 예외화한다
    # (종료 코드 0 일 때도). 그대로 두면 fnm 이 진행 상황을 stderr 로 쓰는 순간 catch 로 떨어져
    # Invoke-Expression 이 실행되지 않고 fnm 환경이 조용히 적용되지 않는다 — 이후 pnpm 을 못 찾는다.
    # 함수 스코프에서만 Continue 로 낮추고 성공/실패는 $LASTEXITCODE 로만 판정한다.
    $ErrorActionPreference = 'Continue'
    try {
      $_fnmEnv = fnm env --use-on-cd 2>&1
      if ($LASTEXITCODE -eq 0) { $_fnmEnv | Out-String | Invoke-Expression }
    } catch {}
    # .nvmrc 핀을 우선 존중하고, 실패하면 최소 Node 버전으로 활성화한다
    # (템플릿 루트에는 .nvmrc 가 없으므로 cd 훅만으로는 활성화되지 않는다)
    $_nodeDefault = if ($_min['MIN_NODE']) { $_min['MIN_NODE'] } else { '24' }
    $_nodeWanted  = if ($_nodePin) { $_nodePin } else { $_nodeDefault }
    try {
      fnm use $_nodeWanted 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { fnm use $_nodeDefault 2>&1 | Out-Null }
    } catch {}
  }
}
Enable-VersionManagers

# 필수 도구 확인 — 미달이면 bootstrap.ps1 자동 실행
function _Get-SemVer([string]$raw) {
  if ($raw -and ($raw -match '(\d+)\.(\d+)')) { return @{ Major=[int]$matches[1]; Minor=[int]$matches[2] } }
  return $null
}
function _Meets($have, [string]$minStr) {
  if (-not $have) { return $false }
  $mm = $minStr.Split('.'); $mj = [int]$mm[0]; $mn = if ($mm.Count -gt 1) { [int]$mm[1] } else { 0 }
  return ($have.Major -gt $mj -or ($have.Major -eq $mj -and $have.Minor -ge $mn))
}

# bootstrap 이 필요한 기준은 "런타임이 하한 미달"이다 (versions.env 정책: 이상이면 재사용).
# ⛔ pyenv/fnm 이 없다는 이유만으로 bootstrap 을 강제하지 않는다 — Windows 에서 pyenv-win 은
# 자동 설치 대상이 아니라, 이미 조건을 만족한 환경까지 골격 생성 전에 막아버린다.
$_needBootstrap = $false
$_pyVer = _Get-SemVer $(try { python --version 2>&1 | Out-String } catch { "" })
# PS 5.1 호환: '??'(null 병합, PS7+) 대신 if 식 사용. 폴백은 versions.env 와 동일한 3.13.
$_minPython = if ($_min['MIN_PYTHON']) { $_min['MIN_PYTHON'] } else { '3.13' }
if (-not (_Meets $_pyVer $_minPython)) { $_needBootstrap = $true }
$_nodeHave = _Get-SemVer $(try { node --version 2>&1 | Out-String } catch { "" })
$_minNode = if ($_min['MIN_NODE']) { $_min['MIN_NODE'] } else { '24' }
if (-not (_Meets $_nodeHave $_minNode)) { $_needBootstrap = $true }
$_pnpmHave = _Get-SemVer $(try { pnpm --version 2>&1 | Out-String } catch { "" })
$_minPnpm = if ($_min['MIN_PNPM']) { $_min['MIN_PNPM'] } else { '11' }
if (-not (_Meets $_pnpmHave $_minPnpm)) { $_needBootstrap = $true }
# skeleton\.python-version 핀 처리
#  - pyenv 가 있으면: 핀된 정확한 버전이 실제 설치돼 있어야 한다(없으면 bootstrap 이 설치).
#  - pyenv 가 없으면: 핀을 강제할 수단이 없다. 하한을 충족하는 Python 을 그대로 쓰되,
#    CI 는 .python-version 을 읽으므로 버전이 다르면 경고만 남긴다.
# ($_pyPin 로드는 위 활성화 블록보다 앞에서 이미 끝났다)
if ($_pyPin) {
  if (Get-Command pyenv -ErrorAction SilentlyContinue) {
    if (-not $_needBootstrap) {
      $_pyenvInstalled = $(try { pyenv versions --bare 2>&1 | Out-String } catch { "" })
      $_installedList = "$_pyenvInstalled" -split '\r?\n' | ForEach-Object { $_.Trim() }
      if ($_installedList -notcontains $_pyPin) { $_needBootstrap = $true }
    }
  } elseif (-not $_needBootstrap) {
    $_pyActual = ($(try { python --version 2>&1 | Out-String } catch { "" }) -replace '[^0-9.]', '').Trim()
    if ($_pyActual -and $_pyActual -ne $_pyPin -and -not $_pyActual.StartsWith("$_pyPin.")) {
      Write-Warn2 "Python 핀($_pyPin)과 설치본($_pyActual)이 다릅니다 — CI 는 .python-version 을 읽으므로 로컬과 다른 버전을 씁니다."
      Write-Host "        일치시키려면 pyenv-win 을 설치해 핀 버전을 쓰거나, 생성 후 프로젝트의 .python-version 을 설치본에 맞추세요." -ForegroundColor Yellow
    }
  }
}

# bootstrap 이 고정한 런타임 버전을 받아둘 임시 폴더.
# ⛔ -ProjectRoot 없이 실행하면 bootstrap 이 템플릿의 skeleton\.python-version·.nvmrc 를
#    덮어써 리포를 오염시킨다. 임시 폴더에 받아 둔 뒤 복사 단계에서 생성 프로젝트로 옮긴다.
$_PinDir = $null
if ($_needBootstrap) {
  if (Test-Path $_Bootstrap) {
    Write-Warn2 "필수 도구 또는 Python·Node·pnpm 버전이 기준 미달 — bootstrap.ps1 을 먼저 실행합니다 …"
    $_PinDir = Join-Path ([System.IO.Path]::GetTempPath()) ("scaffold-pin-" + [guid]::NewGuid().ToString("N").Substring(0,8))
    New-Item -ItemType Directory -Force -Path $_PinDir | Out-Null
    # 골격의 핀을 미리 심어 bootstrap 이 "기존 .python-version 핀 존중" 경로를 타게 한다.
    # ⛔ 빈 폴더를 넘기면 bootstrap 이 핀을 못 읽고 임의의 최신 패치를 골라, 생성 프로젝트의
    #    런타임 버전이 "스캐폴드를 돌린 날"에 따라 달라진다(재현 불가).
    if (Test-Path $_pyPinFile)   { Copy-Item $_pyPinFile   (Join-Path $_PinDir '.python-version') -Force }
    if (Test-Path $_nodePinFile) { Copy-Item $_nodePinFile (Join-Path $_PinDir '.nvmrc') -Force }
    # PS 5.1 은 스크립트/네이티브 명령 실패를 자동 예외화하지 않고, in-process 호출의
    # $LASTEXITCODE 는 내부 마지막 네이티브 명령의 잔존값이라 신뢰할 수 없다.
    # → 예외 포착 + bootstrap 결과(실제 런타임 버전) 검증으로 실패를 감지한다 (scaffold.sh 와 동일하게 실패 시 중단).
    # 검증 기준은 "런타임이 하한을 충족하는가"이지 "pyenv·fnm 이 설치됐는가"가 아니다 —
    # 관리자 없이 기존 설치본을 재사용하는 경로가 정상 경로이기 때문이다.
    $_bootstrapOk = $true
    try { & $_Bootstrap -ProjectRoot $_PinDir } catch {
      Write-Warn2 "bootstrap.ps1 실행 중 오류: $($_.Exception.Message)"
      $_bootstrapOk = $false
    }
    # bootstrap 이 실제로 고정한 버전을 핀으로 재채택한 뒤 활성화한다.
    # (핀이 pyenv 에 없어 bootstrap 이 다른 패치로 폴백했을 수 있다)
    if (Test-Path (Join-Path $_PinDir '.python-version')) {
      $_pyPin = "$(Get-Content (Join-Path $_PinDir '.python-version') -TotalCount 1)".Trim()
    }
    if (Test-Path (Join-Path $_PinDir '.nvmrc')) {
      $_nodePin = "$(Get-Content (Join-Path $_PinDir '.nvmrc') -TotalCount 1)".Trim() -replace '^v', ''
    }
    # fnm use 는 이 함수 안에서 핀 기준으로 수행된다.
    # ⛔ 활성화 실패를 곧바로 중단 사유로 삼지 않는다 — 관리자 없이 기존 설치본을 재사용하는
    #    정상 경로까지 막아버린다(scaffold.sh 와 동일). 판정은 아래 런타임 재검증이 한다.
    Enable-VersionManagers
    $_pyAfter = _Get-SemVer $(try { python --version 2>&1 | Out-String } catch { "" })
    if ($_bootstrapOk -and -not (_Meets $_pyAfter $_minPython)) {
      Write-Warn2 "bootstrap 후에도 Python 이 $_minPython 이상이 아닙니다."
      $_bootstrapOk = $false
    }
    $_nodeAfter = _Get-SemVer $(try { node --version 2>&1 | Out-String } catch { "" })
    if ($_bootstrapOk -and -not (_Meets $_nodeAfter $_minNode)) {
      Write-Warn2 "bootstrap 후에도 Node 가 $_minNode 이상이 아닙니다."
      $_bootstrapOk = $false
    }
    $_pnpmAfter = _Get-SemVer $(try { pnpm --version 2>&1 | Out-String } catch { "" })
    if ($_bootstrapOk -and -not (_Meets $_pnpmAfter $_minPnpm)) {
      Write-Warn2 "bootstrap 후에도 pnpm 이 $_minPnpm 이상이 아닙니다."
      $_bootstrapOk = $false
    }
    # 핀이 pyenv 에 설치됐는지는 경고 대상이지 중단 사유가 아니다.
    # bootstrap 이 핀을 설치하지 못해도 하한을 충족하는 Python 으로 폴백했을 수 있고, 그 경우
    # 위의 런타임 검증을 이미 통과했다. 여기서 중단하면 폴백 경로가 의미를 잃는다.
    if ($_bootstrapOk -and (Get-Command pyenv -ErrorAction SilentlyContinue)) {
      $_pyPinFile2 = Join-Path $SkeletonDir '.python-version'
      if (Test-Path $_pyPinFile2) {
        $_pyPin2 = "$(Get-Content $_pyPinFile2 -TotalCount 1)".Trim()
        if ($_pyPin2) {
          $_installed2 = $(try { pyenv versions --bare 2>&1 | Out-String } catch { "" })
          $_installedList2 = "$_installed2" -split '\r?\n' | ForEach-Object { $_.Trim() }
          if ($_installedList2 -notcontains $_pyPin2) {
            Write-Warn2 "Python 핀 $_pyPin2 이 pyenv 에 없습니다 — 하한을 충족하는 설치본으로 진행합니다. CI 는 핀을 사용합니다."
          }
        }
      }
    }
    if (-not $_bootstrapOk) {
      Write-Warn2 "bootstrap.ps1 실패 — 스캐폴드를 중단합니다. 위 로그의 오류를 해결한 뒤 다시 실행하세요."
      Remove-Item -Recurse -Force $_PinDir -ErrorAction SilentlyContinue
      exit 1
    }
  } else {
    Write-Warn2 "bootstrap.ps1 을 찾을 수 없습니다 ($_Bootstrap). 수동으로 먼저 실행하세요."
    exit 1
  }
}

# ---------- 테마(@theme) 생성 ----------
function Get-DefaultTheme {
@'
@theme {
  --font-sans: 'Inter', 'Noto Sans KR', system-ui, sans-serif;
  --color-surface: #f8f9fa;
  --color-on-surface: #191c1d;
  --color-on-surface-variant: #424752;
  --color-surface-container: #edeeef;
  --color-surface-container-lowest: #ffffff;
  --color-outline-variant: #c2c6d4;
  --color-primary: #00478d;
  --color-on-primary: #ffffff;
  --color-tertiary-container: #c6f6d5;
  --color-on-tertiary-container: #14532d;
  --color-error-container: #ffdad6;
  --color-on-error-container: #93000a;
}
'@
}

function Get-ThemeFromDesign([string]$path) {
  $lines = Get-Content -LiteralPath $path
  $inFront = $false; $section = ""; $colors = [ordered]@{}; $font = $null
  foreach ($line in $lines) {
    if ($line.Trim() -eq "---") {
      if (-not $inFront) { $inFront = $true; continue } else { break }
    }
    if (-not $inFront) { continue }
    if ($line -match '^[A-Za-z]') {
      if ($line -match '^colors:')          { $section = "colors" }
      elseif ($line -match '^typography:')  { $section = "typography" }
      else                                  { $section = "" }
      continue
    }
    if ($section -eq "colors" -and $line -match "^\s+([a-z0-9-]+):\s*'?(#[0-9a-fA-F]{3,8})'?") {
      $colors[$matches[1]] = $matches[2]
    }
    if ($section -eq "typography" -and -not $font -and $line -match "fontFamily:\s*'?([^'\r\n]+?)'?\s*$") {
      $font = $matches[1].Trim()
    }
  }
  if ($colors.Count -eq 0) { return Get-DefaultTheme }
  $fam = if ($font) { $font } else { "Inter" }
  $sb = [System.Text.StringBuilder]::new()
  [void]$sb.AppendLine("@theme {")
  [void]$sb.AppendLine("  --font-sans: '$fam', 'Noto Sans KR', system-ui, sans-serif;")
  foreach ($k in $colors.Keys) { [void]$sb.AppendLine("  --color-$($k): $($colors[$k]);") }
  [void]$sb.AppendLine("}")
  return $sb.ToString()
}

# ---------- 1. 입력 수집 ----------
Write-Step "신규 프로젝트 스캐폴드"
if (-not $Name)   { $Name = Read-HostSafe "프로젝트 이름 (예: project_test)" }
if (-not $Name)   { throw "프로젝트 이름이 필요합니다." }
# -Target 미지정 시 기본값: _project-template 의 부모 폴더에 <이름> 으로 생성
if (-not $Target) {
  $defaultTarget = Join-Path (Split-Path $TemplateDir -Parent) $Name
  try { $i = Read-Host "생성 위치 [$defaultTarget]" } catch { $i = "" }
  $Target = if ($i) { $i } else { $defaultTarget }
}

$snake = ($Name -creplace '([a-z0-9])([A-Z])', '$1_$2') -replace '[^A-Za-z0-9]+', '_'
$snake = $snake.Trim('_').ToLower()
# ⛔ ASCII 영숫자가 하나도 없으면(예: -Name "내앱") $snake 가 빈 문자열이 된다.
#    그대로 두면 DATABASE_URL 에 DB 이름이 없고, 쿠키가 "_session", npm 이름이 "-frontend" 가 된다.
if (-not $snake) {
  Write-Warn2 "프로젝트 이름에서 식별자를 만들 수 없습니다: $Name"
  Write-Host "        ASCII 영문자·숫자를 1자 이상 포함하세요 (DB 이름·npm 패키지명·쿠키명에 쓰입니다)." -ForegroundColor Yellow
  exit 1
}
if (-not $DbName) { $DbName = $snake }
# 상대 경로는 .NET 프로세스 디렉토리가 아니라 현재 PowerShell 위치 기준으로 해석한다.
# (PS 5.1 호환: 2-인자 GetFullPath 오버로드가 없으므로 직접 결합 후 정규화)
if (-not [System.IO.Path]::IsPathRooted($Target)) {
  $Target = Join-Path (Get-Location).Path $Target
}
$Target = [System.IO.Path]::GetFullPath($Target)
Write-Ok "이름=$Name  snake=$snake  위치=$Target"

# DESIGN.md 사용 여부 (-Design / -NoDesign 우선, 없으면 질문, 비대화형이면 기본 적용)
if ($NoDesign -or -not (Test-Path $DesignFile)) {
  $useDesign = $false
} elseif ($Design) {
  $useDesign = $true
} else {
  try {
    $ans = Read-Host "DESIGN.md 의 색상/타이포그래피를 적용할까요? (Y/n)"
    $useDesign = ($ans -eq "" -or $ans -match '^[Yy]')
  } catch { $useDesign = $true }
}
$themeCss = if ($useDesign) { Get-ThemeFromDesign $DesignFile } else { Get-DefaultTheme }
if ($useDesign) { Write-Ok "DESIGN.md 테마 적용" } else { Write-Ok "기본 테마 적용" }

# DB 접속 정보
if (-not $SkipDb) {
  Write-Step "PostgreSQL 접속 정보 (psql 로 DB 생성)"
  $i = Read-HostSafe "DB host [$DbHost]"; if ($i) { $DbHost = $i }
  $i = Read-HostSafe "DB port [$DbPort]"
  if ($i) {
    $_port = 0
    if ([int]::TryParse($i, [ref]$_port)) { $DbPort = $_port }
    else { Write-Warn2 "포트가 숫자가 아닙니다: '$i' — 기존 값 $DbPort 유지" }
  }
  $i = Read-HostSafe "DB user [$DbUser]"; if ($i) { $DbUser = $i }
  if (-not $DbPassword) {
    # 비밀번호는 화면에 표시하지 않는다 (scaffold.sh 의 read -s 대응)
    try {
      $_sec  = Read-Host "DB password" -AsSecureString
      $_bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($_sec)
      try     { $DbPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($_bstr) }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($_bstr) }
    } catch { $DbPassword = "" }
  }
  $i = Read-HostSafe "DB name [$DbName]"; if ($i) { $DbName = $i }
}

# DB 사전 접속 검사 (psql 로 SELECT 1) — 접속 정보 입력 직후 1회 가볍게 확인한다.
# 실패하면 접속 실패 요지를 경고하고, 대화형이면 1회 재입력, 비대화형이면 DB 단계 전체를 건너뛴다.
# $DbUnreachable = $true 이면 아래 6단계에서 CREATE DATABASE·alembic 을 모두 생략한다.
# psql 이 없으면 검사 불가 → 아래 DB 단계에서 'psql 없음' 으로 안내한다.
$DbUnreachable = $false
if (-not $SkipDb) {
  Enable-Psql   # PATH 에 없으면 표준 설치 경로를 찾아 세션 PATH 에 추가
  $_psqlPre = Get-Command psql -ErrorAction SilentlyContinue
  if ($_psqlPre) {
    $_dbRetried = $false
    while ($true) {
      $env:PGPASSWORD = $DbPassword
      $_pcRc = 1; $_pcErr = ""
      try {
        # 성공/실패 출력을 모두 캡처(2>&1). PS 5.1 은 EAP=Stop + 네이티브 stderr 조합에서 예외화될 수 있어 감싼다.
        $_pcOut = & psql -w -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1" 2>&1
        $_pcRc  = $LASTEXITCODE
        $_pcErr = ($_pcOut | Out-String)
      } catch {
        $_pcErr = $_.Exception.Message
        $_pcRc  = 1
      } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
      }
      if ($_pcRc -eq 0) { break }
      $_pcSummary = ("$_pcErr" -split "\r?\n" | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 1)
      Write-Warn2 "접속 실패: $(if ($_pcSummary) { $_pcSummary } else { 'psql 연결에 실패했습니다' })"
      if ((Test-Interactive) -and -not $_dbRetried) {
        $_dbRetried = $true
        Write-Warn2 "접속정보를 다시 입력하세요 (1회 재시도, Enter 는 기존값 유지)"
        $i = Read-HostSafe "DB host [$DbHost]"; if ($i) { $DbHost = $i }
        $i = Read-HostSafe "DB port [$DbPort]"
        if ($i) {
          $_p = 0
          if ([int]::TryParse($i, [ref]$_p)) { $DbPort = $_p }
          else { Write-Warn2 "포트가 숫자가 아닙니다: '$i' — 기존 값 $DbPort 유지" }
        }
        $i = Read-HostSafe "DB user [$DbUser]"; if ($i) { $DbUser = $i }
        try {
          $_sec  = Read-Host "DB password [기존값 유지]" -AsSecureString
          $_bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($_sec)
          try     { $_pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($_bstr) }
          finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($_bstr) }
          if ($_pw) { $DbPassword = $_pw }
        } catch {}
        $i = Read-HostSafe "DB name [$DbName]"; if ($i) { $DbName = $i }
        continue
      }
      Write-Warn2 "DB 접속 불가로 판단 — DB 생성/마이그레이션 단계를 건너뜁니다"
      $DbUnreachable = $true
      break
    }
  }
}

# DB 이름 따옴표 검사 (SQL 구문 오류를 난해한 메시지 대신 명확한 에러로)
if ($DbName -match "['`"]") {
  Write-Warn2 "DB 이름에 따옴표(' `")는 사용할 수 없습니다: $DbName"
  exit 1
}
# 비밀번호는 URL 인코딩해 DATABASE_URL 에 넣는다 (@ : / # ? % 등 특수문자 안전)
$databaseUrl = "postgresql+psycopg2://${DbUser}:$([uri]::EscapeDataString("$DbPassword"))@${DbHost}:${DbPort}/${DbName}"
# SECRET_KEY 는 JWT 서명키이므로 암호학적 난수 사용 (scaffold.sh 의 openssl rand 대응)
$_rngBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($_rngBytes)
$secret = ([System.BitConverter]::ToString($_rngBytes) -replace '-', '').ToLower()
# 초기 관리자 비밀번호도 무작위로 생성한다.
# ⛔ 하드코딩된 기본값(admin123)을 쓰면 이 템플릿으로 만든 모든 프로젝트가 같은 자격증명을 갖는다.
$_pwBytes = New-Object byte[] 12
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($_pwBytes)
$seedAdminPw = [Convert]::ToBase64String($_pwBytes) -replace '[/+=]', ''

# ---------- 2. 골격 복사 ----------
Write-Step "골격 복사 → $Target"
if ((Test-Path $Target) -and (Get-ChildItem -Path $Target -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
  Write-Warn2 "대상 디렉토리가 비어있지 않습니다 — 기존 파일 위에 골격을 덮어씁니다: $Target"
  # ⛔ 재실행은 파괴적이다. 대화형이면 확인을 받고, 비대화형(CI·스크립트)이면 중단한다.
  if (Test-Interactive) {
    $_ans = Read-Host "  계속할까요? 기존 파일을 덮어씁니다 (y/N)"
    if ($_ans -notmatch '^[Yy]') { Write-Host "중단합니다."; exit 1 }
  } else {
    Write-Warn2 "비대화형 실행이므로 중단합니다. 덮어쓰려면 대상 디렉터리를 비우거나 대화형으로 실행하세요."
    exit 1
  }
}
New-Item -ItemType Directory -Force -Path $Target | Out-Null
# 닷파일(.gitignore·.python-version·.nvmrc·.github·.claude 등) 포함 전체 복사 —
# 와일드카드('*')는 hidden 속성 항목을 놓칠 수 있으므로 -Force 열거로 복사한다 (scaffold.sh 의 'cp -R skeleton/.' 과 동일 결과)
Get-ChildItem -Path $SkeletonDir -Force | Copy-Item -Destination $Target -Recurse -Force
if ($useDesign) { Copy-Item $DesignFile (Join-Path $Target 'docs\DESIGN.md') -Force }
# bootstrap 이 실제로 설치·고정한 런타임 버전을 생성 프로젝트에 반영 (골격의 값은 덮어쓴다)
if ($_PinDir) {
  foreach ($pin in '.python-version', '.nvmrc') {
    $srcPin = Join-Path $_PinDir $pin
    if (Test-Path $srcPin) { Copy-Item $srcPin (Join-Path $Target $pin) -Force }
  }
  Remove-Item -Recurse -Force $_PinDir -ErrorAction SilentlyContinue
  $_PinDir = $null
}
Write-Ok "복사 완료"

# ---------- 3. 토큰 치환 ----------
Write-Step "토큰 치환"
$inc = '*.ts','*.tsx','*.py','*.css','*.html','*.json','*.md','*.ini','*.mako','*.js','*.mjs','*.example','*.txt'
# -Force: 숨김 속성 파일도 치환 대상에 포함 (bash find 와 일치). node_modules/.venv 는 제외 (재실행 성능·안전)
$files = Get-ChildItem -Path $Target -Recurse -File -Include $inc -Force |
  Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.venv)[\\/]' }
foreach ($f in $files) {
  $t = [System.IO.File]::ReadAllText($f.FullName)
  $o = $t
  $t = $t.Replace('__PROJECT_NAME__', $Name).Replace('__PROJECT_SNAKE__', $snake).Replace('__THEME_CSS__', $themeCss)
  if ($t -ne $o) { [System.IO.File]::WriteAllText($f.FullName, $t, $Enc) }
}
Write-Ok "치환 완료"

# ---------- 4. .env 생성 ----------
Write-Step ".env 생성 (OS 무관 주입 — architecture.md §5)"
$backendEnv = @"
DATABASE_URL=$databaseUrl
SECRET_KEY=$secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://localhost:8000
TZ=Asia/Seoul
APP_ENV=development
# 초기 관리자 시드 — 코드 기본값은 꺼져 있고(backend/app/config.py) 개발 편의를 위해 여기서만 켠다.
# ⛔ 배포 전 SEED_DEFAULT_ADMIN=false 로 끄고 APP_ENV=production 으로 바꾼다.
SEED_DEFAULT_ADMIN=true
DEFAULT_ADMIN_PASSWORD=$seedAdminPw
"@
# ⛔ .env 는 DB 비밀번호와 JWT 서명키를 담는다. 상속 ACL 을 끊고 현재 사용자에게만 허용한다
#    (scaffold.sh 의 chmod 600 대응).
$_backendEnvPath = Join-Path $Target 'backend\.env'
# ⛔ 기존 .env 를 덮어쓰면 SECRET_KEY 가 재발급되어 발급된 JWT 가 전부 무효가 된다. 백업을 남긴다.
if (Test-Path $_backendEnvPath) {
  $_envBak = "$_backendEnvPath.bak." + (Get-Date -Format 'yyyyMMddHHmmss')
  Copy-Item $_backendEnvPath $_envBak -Force
  Write-Warn2 "기존 backend\.env 를 백업했습니다: $(Split-Path $_envBak -Leaf)"
}
[System.IO.File]::WriteAllText($_backendEnvPath, $backendEnv, $Enc)
try {
  $_acl = Get-Acl $_backendEnvPath
  $_acl.SetAccessRuleProtection($true, $false)
  # 열거 중 컬렉션을 수정하지 않도록 스냅샷(@())을 뜬 뒤 제거한다
  @($_acl.Access) | ForEach-Object { [void]$_acl.RemoveAccessRule($_) }
  [void]$_acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')))
  Set-Acl -Path $_backendEnvPath -AclObject $_acl
} catch {
  Write-Warn2 "backend\.env 권한 설정 실패 — 파일 접근 권한을 직접 제한하세요: $($_.Exception.Message)"
}
$frontendEnv = "FASTAPI_URL=http://localhost:8000`n"
[System.IO.File]::WriteAllText((Join-Path $Target 'frontend\.env'), $frontendEnv, $Enc)
Write-Ok "backend\.env, frontend\.env 생성 (DATABASE_URL, SECRET_KEY 주입)"

$backend  = Join-Path $Target 'backend'
$frontend = Join-Path $Target 'frontend'

# ---------- 5. 백엔드 설치 ----------
if (-not $SkipInstall) {
  Write-Step "백엔드: venv + 의존성 설치"
  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    # bash 와 동일하게 warn 후 계속 (다음 단계에서 venv 부재를 다시 안내)
    Write-Warn2 "python 없음 — 백엔드 설치 건너뜀"
  } else {
    Push-Location $backend
    try {
      python -m venv .venv
      if (-not (Test-Path '.\.venv\Scripts\python.exe')) {
        Write-Warn2 "venv 생성 실패 — 'cd backend; python -m venv .venv' 로 직접 확인하세요"
      } else {
        & .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
        & .\.venv\Scripts\python.exe -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { Write-Warn2 "pip install 미완료 — 'cd backend; .\.venv\Scripts\python -m pip install -r requirements.txt'" }
        else { Write-Ok "백엔드 의존성 설치 완료" }
      }
    } finally { Pop-Location }
  }
} else { Write-Warn2 "SkipInstall: 백엔드 설치 건너뜀" }

# ---------- 6. DB 생성 + 테이블(Alembic) ----------
# DB 접속 불가 안내(한 블록만) — CREATE DATABASE·alembic 을 모두 건너뛰고 수동 실행법만 보여준다.
function Show-DbUnreachableGuide {
  Write-Warn2 "DB 접속 불가 — 접속정보(host/port/user/password) 확인 후 다음을 수동 실행:"
  Write-Host "        1) DB 생성:     psql -h $DbHost -p $DbPort -U $DbUser -d postgres -c `"CREATE DATABASE $DbName`"" -ForegroundColor White
  Write-Host "        2) 테이블 생성:  cd backend; .\.venv\Scripts\python -m alembic upgrade head" -ForegroundColor White
}
# alembic upgrade — 실패해도 traceback 전체를 쏟지 않고 마지막 몇 줄(핵심 에러) + 임시 로그 경로만 안내.
function Invoke-AlembicUpgrade {
  if ($SkipInstall) {
    Write-Warn2 "SkipInstall: alembic 미실행. 'cd backend; .\.venv\Scripts\python -m alembic upgrade head'"
    return
  }
  if (-not (Test-Path (Join-Path $backend '.venv\Scripts\python.exe'))) {
    Write-Warn2 "venv 미설치 — 'cd backend; .\.venv\Scripts\python -m alembic upgrade head' 수동 실행"
    return
  }
  Write-Step "Alembic: 테이블 생성 (upgrade head) — DB는 항상 Alembic으로 관리 §11"
  $_alembicLog = [System.IO.Path]::GetTempFileName()
  $_rc = 1
  Push-Location $backend
  try {
    # 모든 스트림(*>)을 로그 파일로 — 성공 시 조용히, 실패 시에만 마지막 몇 줄을 보여준다.
    & .\.venv\Scripts\python.exe -m alembic upgrade head *> $_alembicLog
    $_rc = $LASTEXITCODE
  } catch {
    Add-Content -LiteralPath $_alembicLog -Value $_.Exception.Message
    $_rc = 1
  } finally { Pop-Location }
  if ($_rc -eq 0) {
    Write-Ok "테이블 생성 완료 (app_meta)"
    Remove-Item -LiteralPath $_alembicLog -ErrorAction SilentlyContinue
  } else {
    Write-Warn2 "alembic 실패 — 핵심 오류(마지막 6줄):"
    Get-Content -LiteralPath $_alembicLog -Tail 6 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "        $_" }
    Write-Warn2 "전체 로그: $_alembicLog"
    Write-Warn2 "수동 재실행: cd backend; .\.venv\Scripts\python -m alembic upgrade head"
  }
}
if (-not $SkipDb) {
  Write-Step "PostgreSQL: 데이터베이스 생성"
  Enable-Psql
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) {
    Write-Warn2 "psql 을 찾을 수 없습니다 (PATH·표준 설치 경로 모두). DB 생성을 건너뜁니다."
    Write-Warn2 "PostgreSQL 이 설치돼 있다면 bin 디렉터리를 PATH 에 추가하세요 (예: C:\Program Files\PostgreSQL\<버전>\bin)."
    Write-Warn2 "수동: psql -U $DbUser -c `"CREATE DATABASE $DbName`" 후 alembic upgrade head"
  } elseif ($DbUnreachable) {
    # 사전 검사에서 이미 접속 불가로 판정 — 조회/생성/alembic 모두 생략하고 안내만.
    Show-DbUnreachableGuide
  } else {
    $env:PGPASSWORD = $DbPassword
    $_qRc = 1; $_qErr = $false
    try {
      $exists = & psql -w -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
      $_qRc = $LASTEXITCODE
    } catch {
      $_qErr = $true; $_qRc = 1
    } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

    if ($_qErr -or $_qRc -ne 0) {
      # 사전 검사 이후 접속이 끊긴 경우 — 접속 실패로 보고 CREATE·alembic 모두 건너뛴다.
      Show-DbUnreachableGuide
    } elseif ("$exists".Trim() -eq "1") {
      Write-Warn2 "DB 이미 존재: $DbName"
      Invoke-AlembicUpgrade
    } else {
      $env:PGPASSWORD = $DbPassword
      $_createOk = $true
      try {
        & psql -w -h $DbHost -p $DbPort -U $DbUser -d postgres -c "CREATE DATABASE `"$DbName`""
        if ($LASTEXITCODE -ne 0) { $_createOk = $false }
      } catch {
        $_createOk = $false
      } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
      if ($_createOk) {
        Write-Ok "DB 생성: $DbName"
        Invoke-AlembicUpgrade
      } else {
        Write-Warn2 "DB 생성 실패 — 접속정보 확인 후 수동으로 DB 생성/alembic 실행"
      }
    }
  }
} else { Write-Warn2 "SkipDb: DB 생성/마이그레이션 건너뜀" }

# ---------- 7. 프론트엔드 설치 ----------
if (-not $SkipInstall) {
  Write-Step "프론트엔드: pnpm install"
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if (-not $pnpm) {
    Write-Warn2 "pnpm 이 없습니다. 'npm i -g pnpm' 후 'cd frontend; pnpm install'"
  } else {
    Push-Location $frontend
    try {
      pnpm install
      if ($LASTEXITCODE -ne 0) {
        # 흔한 원인: 빌드 스크립트 차단(ERR_PNPM_IGNORED_BUILDS, esbuild 등). 승인 후 재시도.
        Write-Warn2 "pnpm install 1차 비정상 종료 — 빌드 스크립트 승인 후 재시도"
        # PS 5.1 은 EAP=Stop + stderr 리다이렉트 조합에서 NativeCommandError 로 죽을 수 있어 try/catch 로 감싼다
        try { pnpm approve-builds --all 2>&1 | Out-Null } catch {}
        pnpm install
      }
      if ($LASTEXITCODE -eq 0) { Write-Ok "프론트 의존성 설치 완료" }
      else { Write-Warn2 "pnpm install 미완료 — 'cd frontend; pnpm install' 로 직접 확인하세요 (백엔드/DB는 정상)" }
    } finally { Pop-Location }
  }
} else { Write-Warn2 "SkipInstall: 프론트 설치 건너뜀" }

# ---------- 8. 실행 안내 ----------
Write-Step "완료! 실행 방법"
Write-Host @"
[백엔드]  새 PowerShell 터미널에서:
  cd "$backend"
  .\.venv\Scripts\Activate.ps1
  uvicorn app.main:app --reload --port 8000

[프론트]  또 다른 터미널에서:
  cd "$frontend"
  pnpm dev              # 개발 서버
  pnpm typecheck        # 타입 검사 (tsc --noEmit)

[로그인]  초기 관리자 계정 (backend\.env 의 DEFAULT_ADMIN_PASSWORD):
  아이디: admin
  비밀번호: $seedAdminPw
  ⛔ 배포 전 이 계정의 비밀번호를 바꾸고 SEED_DEFAULT_ADMIN=false, APP_ENV=production 으로 설정하세요.

[확인]    브라우저: http://localhost:3000
          → '백엔드 API'와 '데이터베이스'가 모두 '정상'이면 성공입니다.

[DB 변경] 모델 수정 시 (architecture.md §11):
  cd "$backend"
  .\.venv\Scripts\python -m alembic revision --autogenerate -m "변경요약"
  .\.venv\Scripts\python -m alembic upgrade head
"@ -ForegroundColor White
