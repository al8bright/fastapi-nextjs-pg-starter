#requires -Version 5.1
<#
.SYNOPSIS
  신규 개발 환경 부트스트랩 (Windows) — 최소 버전 검사 후 부족할 때만 설치.

.DESCRIPTION
  정책:
    - Python : pyenv-win 으로 버전 격리 관리. pyenv-win 자체는 사전 수동 설치 필요.
               MIN_PYTHON 계열 최신 패치를 pyenv install 후 .python-version 고정.
    - Node   : fnm 으로 버전 격리 관리. 없으면 winget 으로 설치.
               MIN_NODE 버전을 fnm install 후 .nvmrc 고정.
    - pnpm   : 최소 버전 "이상"이면 재사용, 미만이거나 없을 때만 corepack 으로 설치.
    - PostgreSQL : psql 이 있으면 유지, 없을 때만 (-WithPostgres) winget 으로 설치.

.EXAMPLE
  .\scripts\bootstrap.ps1
.EXAMPLE
  .\scripts\bootstrap.ps1 -WithPostgres
.EXAMPLE
  .\scripts\bootstrap.ps1 -ProjectRoot C:\Temp\pin   # 핀 파일을 다른 폴더에 기록
#>
[CmdletBinding()]
param(
  [switch]$WithPostgres,
  # 버전 고정 파일(.python-version/.nvmrc)을 쓸 위치. 미지정 시 이 스크립트의 상위 폴더.
  # scaffold.ps1 은 템플릿(skeleton\) 오염을 막기 위해 임시 폴더를 넘긴다.
  [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Info($m){ Write-Host "  [i]  $m" -ForegroundColor Cyan }
function Ok($m)  { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }

# psql 활성화 — Windows PostgreSQL 설치 관리자는 bin 을 PATH 에 넣지 않는다.
# 설치돼 있는데도 "없음"으로 판정해 중복 설치하는 일을 막는다. 여러 메이저면 최고 버전을 쓴다.
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
    Info "psql 을 PATH 에서 찾지 못해 설치 경로를 사용합니다: $($best.Bin)"
  }
}

function Require-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "이 설치 단계에는 winget 이 필요합니다. Microsoft Store 에서 'App Installer' 설치 후 다시 실행하세요."
  }
}

# Windows PowerShell 5.1 은 네이티브 명령의 비정상 종료를 자동으로 예외화하지 않는다.
# 그래서 종료 코드를 직접 검사한다. 단 stderr 를 2>&1 로 합칠 때는 주의가 필요하다 —
# PS 5.1 은 $ErrorActionPreference='Stop' 아래에서 네이티브 stderr 한 줄을
# NativeCommandError 로 종료 예외화하며, 이는 종료 코드가 0 일 때도 발생한다.
# 그대로 두면 진행 상황을 stderr 로 쓰는 성공 명령(예: fnm install)에서 부트스트랩이 죽는다.
# 따라서 함수 스코프에서만 Continue 로 낮춰 stderr 를 진단용으로 수집하고,
# 성공/실패 판정은 오직 $LASTEXITCODE 로 한다. 바깥 스코프의 Stop 은 보존된다.
function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory=$true)][string]$Command,
    [string[]]$Arguments = @(),
    [string]$Description = $Command
  )
  $ErrorActionPreference = 'Continue'
  $output = & $Command @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Description 실패 (종료 코드 $exitCode): $($output | Out-String)"
  }
  return $output
}

# winget 설치 직후 레지스트리(머신+유저) PATH 를 현재 세션 PATH 에 "병합"한다.
# 통째 교체하면 Enable-Pyenv·fnm env 가 세션에만 넣어 둔 경로가 소실되므로, 없는 항목만 뒤에 덧붙인다.
function Update-SessionPath {
  $reg = @([Environment]::GetEnvironmentVariable('Path','Machine'),
           [Environment]::GetEnvironmentVariable('Path','User')) |
    Where-Object { $_ } | ForEach-Object { $_ -split ';' } | Where-Object { $_ }
  $cur = $env:Path -split ';' | Where-Object { $_ }
  $add = @($reg | Where-Object { $cur -notcontains $_ })
  if ($add.Count -gt 0) { $env:Path = (@($cur) + $add) -join ';' }
}

# pyenv-win 을 현재 세션에 활성화
function Enable-Pyenv {
  $pyenvRoot = "$env:USERPROFILE\.pyenv\pyenv-win"
  if (Test-Path $pyenvRoot) {
    $env:PYENV      = $pyenvRoot
    $env:PYENV_ROOT = $pyenvRoot
    $env:PYENV_HOME = $pyenvRoot
    # PATH 선두에 추가 — 기존 항목은 위치(끝 항목 포함)와 무관하게 제거해 재실행 시 중복 누적 방지
    $rest = ($env:Path -split ';' | Where-Object { $_ -and $_ -ne "$pyenvRoot\bin" -and $_ -ne "$pyenvRoot\shims" }) -join ';'
    $env:Path = "$pyenvRoot\bin;$pyenvRoot\shims;" + $rest
  }
}

# "3.13.1" / "v24.3.0" 등에서 major.minor 추출
function Get-Ver([string]$raw){
  if ($raw -and ($raw -match '(\d+)\.(\d+)')) {
    return @{ Major = [int]$matches[1]; Minor = [int]$matches[2] }
  }
  return $null
}
# 설치본($have)이 최소버전($minStr) 이상인가
function Meets($have, [string]$minStr){
  if (-not $have) { return $false }
  $mm = $minStr.Split('.')
  $mj = [int]$mm[0]
  $mn = if ($mm.Count -gt 1) { [int]$mm[1] } else { 0 }
  if ($have.Major -gt $mj) { return $true }
  if ($have.Major -eq $mj -and $have.Minor -ge $mn) { return $true }
  return $false
}
# 명령 실행 결과(버전 문자열) 안전 취득
# Invoke-NativeChecked 와 같은 이유로 EAP 를 함수 스코프에서 낮춘다 — 그러지 않으면 성공 명령이
# stderr 에 한 줄만 써도 catch 로 떨어져 "도구 없음"("")으로 오판하고, 최종 확인이 헛되게 실패한다.
function Try-Cmd([string]$exe, [string]$arg){
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $exe $arg 2>&1
    if ($LASTEXITCODE -ne 0) { return "" }
    return ($output | Out-String)
  } catch { return "" }
}

Write-Host "`n=== 개발 환경 부트스트랩 (Windows) ===" -ForegroundColor Cyan

# 최소 버전 로드 (단일 출처)
$verFile = Join-Path $PSScriptRoot 'versions.env'
$min = @{}
if (Test-Path $verFile) {
  Get-Content $verFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*([0-9.]+)') { $min[$matches[1]] = $matches[2] }
  }
}
foreach ($k in 'MIN_PYTHON','MIN_NODE','MIN_PNPM') {
  if (-not $min[$k]) { throw "versions.env 에서 $k 를 읽지 못했습니다." }
}

if ($ProjectRoot) {
  New-Item -ItemType Directory -Force -Path $ProjectRoot | Out-Null
  $projectRoot = (Resolve-Path $ProjectRoot).Path
} else {
  $projectRoot = Split-Path $PSScriptRoot -Parent
}
$pyPinFile   = Join-Path $projectRoot '.python-version'
$nvmrcFile   = Join-Path $projectRoot '.nvmrc'

# 핀 파일과 실제 런타임이 어긋나면 알린다 — CI 는 핀 파일을 읽으므로 로컬만 통과하고
# CI 에서 깨지는 상황이 생긴다. 관리자(pyenv/fnm) 없이 기존 런타임을 재사용할 때만 발생한다.
function Warn-PinMismatch([string]$pinFile, [string]$actual, [string]$label) {
  if (-not (Test-Path $pinFile)) { return }
  $pin = "$(Get-Content $pinFile -TotalCount 1)".Trim().TrimStart('v')
  if (-not $pin -or -not $actual) { return }
  if ($actual -eq $pin -or $actual.StartsWith("$pin.")) { return }
  Warn "$label 핀($pin)과 설치본($actual)이 다릅니다 — CI 는 핀 파일을 읽으므로 로컬과 다른 버전을 씁니다."
  Write-Host "  일치시키려면 관리자를 설치해 핀 버전을 쓰거나, 핀 파일을 설치본에 맞추세요." -ForegroundColor Yellow
}

# ── 1·2. Python ─────────────────────────────────────────────────────────────
# 정책(versions.env): 하한 이상이면 기존 설치본을 재사용한다.
#   - pyenv-win 이 있으면 그것으로 관리한다(핀 존중).
#   - 없어도 Python 이 하한을 충족하면 그대로 쓴다. ⛔ 관리자가 없다는 이유만으로 중단하지 않는다.
#   - 둘 다 아니면 pyenv-win 수동 설치를 안내하고 중단한다(자동 설치하지 않는다).
$hasPyenv   = [bool](Get-Command pyenv -ErrorAction SilentlyContinue)
$pyHave     = Get-Ver (Try-Cmd 'python' '--version')
$pyMeetsMin = Meets $pyHave $min['MIN_PYTHON']

if (-not $hasPyenv) {
  if ($pyMeetsMin) {
    Ok ("Python {0}.{1} 재사용 (>= {2}) — pyenv-win 없이 진행" -f $pyHave.Major, $pyHave.Minor, $min['MIN_PYTHON'])
    Warn-PinMismatch $pyPinFile ((Try-Cmd 'python' '--version') -replace '[^0-9.]', '') 'Python'
  } else {
    Warn "Python $($min['MIN_PYTHON']) 이상이 없고 pyenv-win 도 없습니다. Windows bootstrap 은 pyenv-win 을 자동 설치하지 않습니다."
    Write-Host "  공식 설치 문서: https://pyenv-win.github.io/pyenv-win/docs/installation.html" -ForegroundColor Yellow
    Write-Host '  수동 설치 예: git clone https://github.com/pyenv-win/pyenv-win.git "$env:USERPROFILE\.pyenv"' -ForegroundColor Yellow
    Write-Host "  또는 Python $($min['MIN_PYTHON']) 이상을 직접 설치해도 됩니다." -ForegroundColor Yellow
    throw "Python $($min['MIN_PYTHON']) 이상 또는 pyenv-win 을 설치하고 새 PowerShell 터미널을 연 뒤 다시 실행하세요."
  }
}

if ($hasPyenv) {
Ok "pyenv-win $(Try-Cmd 'pyenv' '--version') 발견"
Enable-Pyenv

# 기존 .python-version 핀이 있으면(예: 템플릿의 체크인 파일) 그 값을 존중해 설치하고,
# 없을 때만 MIN_PYTHON 계열 최신 패치를 pyenv 목록에서 선택해 새로 핀한다.
$pyenvPython = $null
if (Test-Path $pyPinFile) {
  $pyenvPython = "$(Get-Content $pyPinFile -TotalCount 1)".Trim()
  if ($pyenvPython) { Ok "기존 .python-version 핀 존중: $pyenvPython" }
}

if (-not $pyenvPython) {
  $pyenvList   = Invoke-NativeChecked -Command 'pyenv' -Arguments @('install','--list') -Description 'pyenv 설치 가능 버전 조회'
  $minPyEsc    = [regex]::Escape($min['MIN_PYTHON'])
  $pyenvPython = $pyenvList |
    Where-Object { $_ -match "^\s*${minPyEsc}\.\d+\s*$" } |
    Select-Object -Last 1 |
    ForEach-Object { $_.Trim() }

  if (-not $pyenvPython) {
    Warn "pyenv 목록에서 Python $($min['MIN_PYTHON']).x 를 찾지 못했습니다. 'pyenv update' 후 재시도하세요."
    $pyenvPython = $min['MIN_PYTHON']
  }
}

$installed = (Invoke-NativeChecked -Command 'pyenv' -Arguments @('versions','--bare') -Description 'pyenv 설치 버전 조회' | Out-String)
$installedList = "$installed" -split '\r?\n' | ForEach-Object { $_.Trim() }
if ($installedList -contains $pyenvPython) {
  Ok "Python $pyenvPython 이미 pyenv 에 설치됨 — 재사용"
} else {
  Info "Python $pyenvPython 설치 (pyenv-win) …"
  try {
    Invoke-NativeChecked -Command 'pyenv' -Arguments @('install', $pyenvPython) -Description "Python $pyenvPython 설치" | Out-Null
  } catch {
    # 핀 버전이 pyenv 목록에 없을 수 있다(pyenv 버전 DB 가 오래됨, 또는 pyenv update 가 실패하는 환경).
    # 하한을 충족하는 Python 이 이미 있으면 그것으로 진행한다 — 설치 가능한 핀이 없다는 이유로
    # 이미 조건을 만족한 환경을 막지 않는다.
    if ($pyMeetsMin) {
      Warn "Python $pyenvPython 설치 실패 — pyenv 목록에 없거나 내려받지 못했습니다."
      Write-Host "  $($_.Exception.Message.Split([Environment]::NewLine)[0])" -ForegroundColor Yellow
      Ok ("기존 Python {0}.{1} 로 진행합니다 (>= {2})." -f $pyHave.Major, $pyHave.Minor, $min['MIN_PYTHON'])
      Warn-PinMismatch $pyPinFile ((Try-Cmd 'python' '--version') -replace '[^0-9.]', '') 'Python'
      Write-Host "  핀을 쓰려면 'pyenv update' 후 다시 실행하거나, .python-version 을 설치 가능한 버전으로 바꾸세요." -ForegroundColor Yellow
      $hasPyenv = $false   # 이후 pyenv 의존 단계(rehash 등)를 건너뛴다
    } else {
      throw
    }
  }
}
}  # end Python 설치 분기 — 아래는 pyenv 경로가 살아있을 때만
if ($hasPyenv) {

# 핀 파일이 없을 때만 .python-version 기록 (기존 핀은 덮어쓰지 않음)
# bash(echo) 와 동일하게 LF 개행 포함으로 기록 — OS 간 개행 유무 diff 방지
if (-not (Test-Path $pyPinFile)) {
  [System.IO.File]::WriteAllText($pyPinFile, "$pyenvPython`n")
  Ok "Python $pyenvPython → .python-version 고정"
}
Invoke-NativeChecked -Command 'pyenv' -Arguments @('rehash') -Description 'pyenv rehash' | Out-Null
}  # end if ($hasPyenv)

# ── 3·4. Node ───────────────────────────────────────────────────────────────
# Python 과 같은 정책: fnm 이 있으면 fnm 으로 관리하고, 없어도 Node 가 하한을 충족하면 재사용한다.
# fnm 은 winget 으로 자동 설치 가능하므로, Node 가 하한 미달일 때만 설치를 시도한다.
$hasFnm       = [bool](Get-Command fnm -ErrorAction SilentlyContinue)
$nodeHave     = Get-Ver (Try-Cmd 'node' '--version')
$nodeMeetsMin = Meets $nodeHave $min['MIN_NODE']

if (-not $hasFnm -and -not $nodeMeetsMin) {
  Info "Node $($min['MIN_NODE']) 이상이 없습니다. fnm 을 winget 으로 설치합니다 …"
  Require-Winget
  Invoke-NativeChecked -Command 'winget' -Arguments @('install','--id','Schniz.fnm','-e','--accept-package-agreements','--accept-source-agreements') -Description 'fnm winget 설치' | Out-Null
  Update-SessionPath
  $hasFnm = [bool](Get-Command fnm -ErrorAction SilentlyContinue)
  if (-not $hasFnm) { throw "fnm 설치 명령은 끝났지만 fnm 을 찾을 수 없습니다. 새 터미널에서 PATH 를 반영한 뒤 다시 실행하세요." }
}

if (-not $hasFnm) {
  Ok ("Node {0}.{1} 재사용 (>= {2}) — fnm 없이 진행" -f $nodeHave.Major, $nodeHave.Minor, $min['MIN_NODE'])
  Warn-PinMismatch $nvmrcFile ((Try-Cmd 'node' '--version') -replace '[^0-9.]', '') 'Node'
}

if ($hasFnm) {
Ok "fnm $(Try-Cmd 'fnm' '--version') 발견"
$fnmEnv = Invoke-NativeChecked -Command 'fnm' -Arguments @('env','--use-on-cd') -Description 'fnm 셸 환경 초기화' | Out-String
$fnmEnv | Invoke-Expression

# 기존 .nvmrc 핀이 있으면 그 값을 존중해 설치하고, 없을 때만 MIN_NODE 로 새로 핀한다.
$nodePin   = $null
if (Test-Path $nvmrcFile) {
  $nodePin = "$(Get-Content $nvmrcFile -TotalCount 1)".Trim().TrimStart('v')
  if ($nodePin) { Ok "기존 .nvmrc 핀 존중: $nodePin" }
}
if (-not $nodePin) { $nodePin = $min['MIN_NODE'] }

$fnmList = Invoke-NativeChecked -Command 'fnm' -Arguments @('list') -Description 'fnm 설치 버전 조회' | Out-String
if ($fnmList -match "v$([regex]::Escape($nodePin))([^0-9]|$)") {
  Ok "Node $nodePin 이미 fnm 에 설치됨 — 재사용"
} else {
  Info "Node $nodePin 설치 (fnm) …"
  Invoke-NativeChecked -Command 'fnm' -Arguments @('install', $nodePin) -Description "Node $nodePin 설치" | Out-Null
}
Invoke-NativeChecked -Command 'fnm' -Arguments @('use', $nodePin) -Description "Node $nodePin 활성화" | Out-Null
# 핀 파일이 없을 때만 .nvmrc 기록 (기존 핀은 덮어쓰지 않음)
# bash(echo) 와 동일하게 LF 개행 포함으로 기록 — OS 간 개행 유무 diff 방지
if (-not (Test-Path $nvmrcFile)) {
  [System.IO.File]::WriteAllText($nvmrcFile, "$nodePin`n")
  Ok "Node $nodePin → .nvmrc 고정"
}
}  # end if ($hasFnm)

# ── 5. pnpm (Node 내장 corepack 으로 활성화) ────────────────────────────────
$pnv = Get-Ver (Try-Cmd 'pnpm' '--version')
if (Meets $pnv $min['MIN_PNPM']) {
  Ok ("pnpm {0}.{1} 재사용 (>= {2})" -f $pnv.Major, $pnv.Minor, $min['MIN_PNPM'])
} else {
  Info "pnpm 활성화 (corepack) …"
  try {
    Invoke-NativeChecked -Command 'corepack' -Arguments @('enable') -Description 'corepack 활성화' | Out-Null
  } catch {
    # Node 가 C:\Program Files\nodejs 처럼 관리자 전용 위치에 있으면 corepack 이 그곳에 shim 을
    # 만들려다 EPERM 으로 실패한다. 사용자 쓰기 가능한 npm 전역 prefix 에 shim 을 설치해
    # 관리자 권한 없이 진행한다 (npm 기본 prefix 는 %APPDATA%\npm 이고 보통 PATH 에 이미 있다).
    $shimDir = ""
    try { $shimDir = (& npm config get prefix 2>$null | Out-String).Trim() } catch { }
    if (-not $shimDir -or $shimDir -match '^\s*$') { $shimDir = Join-Path $env:APPDATA 'npm' }
    Warn "corepack enable 실패 (관리자 권한 필요 위치) — 사용자 디렉터리에 shim 을 설치합니다."
    Write-Host "  shim 위치: $shimDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
    Invoke-NativeChecked -Command 'corepack' -Arguments @('enable','--install-directory', $shimDir) -Description 'corepack 활성화(사용자 디렉터리)' | Out-Null
    if (($env:Path -split ';') -notcontains $shimDir) {
      $env:Path = "$shimDir;$env:Path"
      Warn "$shimDir 가 PATH 에 없어 이번 세션에만 추가했습니다. 새 터미널에서도 쓰려면 사용자 PATH 에 추가하세요."
    }
  }
  Invoke-NativeChecked -Command 'corepack' -Arguments @('prepare', ("pnpm@{0}" -f $min['MIN_PNPM']), '--activate') -Description 'pnpm corepack 준비' | Out-Null
  Update-SessionPath
  Ok "pnpm 활성화 완료"
}

# ── 6. PostgreSQL (선택, 있으면 유지) ───────────────────────────────────────
if ($WithPostgres) {
  Enable-Psql
  if (Get-Command psql -ErrorAction SilentlyContinue) {
    Ok "PostgreSQL 이미 설치됨 (psql 발견) — 유지"
  } else {
    Info "PostgreSQL 16 설치 (winget: PostgreSQL.PostgreSQL.16) …"
    Require-Winget
    Invoke-NativeChecked -Command 'winget' -Arguments @('install','--id','PostgreSQL.PostgreSQL.16','-e','--accept-package-agreements','--accept-source-agreements') -Description 'PostgreSQL 16 winget 설치' | Out-Null
    Update-SessionPath
    Enable-Psql   # 설치 관리자가 PATH 에 넣지 않으므로 표준 경로를 직접 찾는다
    if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
      throw "PostgreSQL 설치 명령은 끝났지만 psql 을 찾을 수 없습니다. 새 터미널에서 PATH 를 반영하거나 PostgreSQL bin 디렉터리를 PATH 에 추가한 뒤 다시 실행하세요."
    }
    Ok "PostgreSQL 설치 완료 — superuser 비밀번호/포트(5432)를 backend\.env 의 DATABASE_URL 에 반영하세요."
  }
} else {
  Warn "PostgreSQL 은 건너뜀. 필요하면 '-WithPostgres' 로 설치하거나 원격 DB 를 사용하세요."
}

# 설치/활성화가 실제 현재 세션에 반영됐는지 최종 확인한다.
# fnm 을 쓰지 않는 경로(하한을 충족하는 기존 Node 재사용)에서는 fnm 관련 확인을 건너뛴다.
$fnmCurrent = $null
if ($hasFnm) {
  $fnmCurrent = (Invoke-NativeChecked -Command 'fnm' -Arguments @('current') -Description 'fnm 현재 Node 확인' | Out-String).Trim()
  $nodePinEsc = [regex]::Escape($nodePin)
  if ($fnmCurrent -notmatch "^v?${nodePinEsc}(\.|$)") {
    throw "최종 확인 실패: fnm current '$fnmCurrent' 이 .nvmrc 핀 '$nodePin' 과 일치하지 않습니다."
  }
}
$pyFinal = Get-Ver (Try-Cmd 'python' '--version')
if (-not (Meets $pyFinal $min['MIN_PYTHON'])) { throw "최종 확인 실패: Python 이 $($min['MIN_PYTHON']) 이상이 아닙니다." }
$nodeFinal = Get-Ver (Try-Cmd 'node' '--version')
if (-not (Meets $nodeFinal $min['MIN_NODE'])) { throw "최종 확인 실패: Node 가 $($min['MIN_NODE']) 이상이 아닙니다." }
$pnpmFinal = Get-Ver (Try-Cmd 'pnpm' '--version')
if (-not (Meets $pnpmFinal $min['MIN_PNPM'])) { throw "최종 확인 실패: pnpm 이 $($min['MIN_PNPM']) 이상이 아닙니다." }
$fnmLabel  = if ($fnmCurrent) { "fnm $fnmCurrent, " } else { "" }
# Try-Cmd 는 Out-String 결과라 끝에 개행이 붙는다 — 한 줄 요약이므로 정리한다.
$pyLabel   = (Try-Cmd 'python' '--version').Trim()
$nodeLabel = (Try-Cmd 'node' '--version').Trim()
$pnpmLabel = (Try-Cmd 'pnpm' '--version').Trim()
Ok "최종 확인 완료: ${fnmLabel}$pyLabel, Node $nodeLabel, pnpm $pnpmLabel"

Write-Host "`n=== 다음 단계 ===" -ForegroundColor Cyan
Write-Host @"
1) pyenv-win 을 수동 설치했거나 fnm 을 새로 설치했다면 새 터미널을 열어 PATH 를 반영하세요.
   PowerShell 프로파일(`$PROFILE)에 아래 줄을 추가하면 자동 활성화됩니다:
     # pyenv-win
     `$env:PYENV      = "`$env:USERPROFILE\.pyenv\pyenv-win"
     `$env:PYENV_ROOT = `$env:PYENV
     `$env:PYENV_HOME = `$env:PYENV
     `$env:Path = "`$env:PYENV\bin;`$env:PYENV\shims;`$env:Path"
     # fnm
     fnm env --use-on-cd | Out-String | Invoke-Expression
2) 백엔드 의존성:  cd backend; python -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt
3) 프론트 의존성:  cd frontend; pnpm install
4) DB 마이그레이션: backend\.env 의 DATABASE_URL 확인 후  .\.venv\Scripts\python -m alembic upgrade head
자세한 내용은 README.md 참조.
"@ -ForegroundColor White
