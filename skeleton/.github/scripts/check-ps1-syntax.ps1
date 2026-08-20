#requires -Version 5.1
# .ps1 구문 검사 (Template CI 전용).
#
# ⛔ 이 로직을 워크플로 YAML 의 `run:` 안에 인라인으로 두지 마라.
#    GitHub Actions 는 `shell: powershell` 스텝을 **BOM 없는 UTF-8** 임시 파일로 쓰는데,
#    Windows PowerShell 5.1 은 BOM 이 없으면 ANSI(CP949/1252)로 읽는다. 그러면 한글 메시지가
#    깨지면서 따옴표 짝이 무너져 "The string is missing the terminator" 로 스텝이 통째로 죽는다.
#    이 파일은 BOM 을 달아 커밋하므로 5.1 도 UTF-8 로 정확히 읽는다.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$failed = $false
$files = @(Get-ChildItem -Path . -Recurse -File -Force -Filter *.ps1)
if ($files.Count -eq 0) { Write-Host "검사할 .ps1 없음"; exit 0 }

# ── 1. 파싱 검사 — 5.1 이 못 읽는 파일은 사용자 환경에서도 즉사한다 ──────────
foreach ($f in $files) {
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$errors)
  if ($errors.Count -gt 0) {
    $failed = $true
    Write-Host "::error file=$($f.FullName)::구문 오류 $($errors.Count)건"
    foreach ($e in $errors) {
      Write-Host ("  L{0}:{1} {2}" -f $e.Extent.StartLineNumber, $e.Extent.StartColumnNumber, $e.Message)
    }
  } else {
    Write-Host "OK  $($f.FullName)"
  }
}

# ── 2. 파싱은 되지만 5.1 에서 실행이 깨지는 패턴 ────────────────────────────
# PS7 전용 토큰과, 문(statement)을 인자 자리에 쓴 곳을 AST 로 찾는다.
$ps7Kinds = @('QuestionQuestion','QuestionQuestionEquals','AndAnd','OrOr','QuestionDot','QuestionLBracket')
foreach ($f in $files) {
  $tokens = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$null)
  foreach ($t in $tokens) {
    if ($ps7Kinds -contains "$($t.Kind)") {
      $failed = $true
      $msg = "토큰 [" + $t.Text + "] 은 PowerShell 7 전용이다. Windows PowerShell 5.1 은 파싱 단계에서 실패한다."
      Write-Host "::error file=$($f.FullName),line=$($t.Extent.StartLineNumber)::$msg"
    }
  }
  $bad = $ast.FindAll({
    param($n)
    $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and
    $n.StringConstantType -eq 'BareWord' -and
    $n.Value -in @('try', 'if', 'foreach', 'while', 'switch') -and
    $n.Parent -is [System.Management.Automation.Language.CommandAst]
  }, $true)
  foreach ($b in $bad) {
    $failed = $true
    $msg = "문 [" + $b.Value + "] 을 인자 자리에 사용했다. 명령어로 해석되어 실행 시 실패한다."
    Write-Host "::error file=$($f.FullName),line=$($b.Extent.StartLineNumber)::$msg"
  }
}

if ($failed) { exit 1 }
Write-Host "모든 .ps1 검사 통과 ($($files.Count)개)"
