#!/usr/bin/env bash
# fastapi-nextjs-pg-starter 신규 프로젝트 스캐폴드 (macOS/Linux).
# Windows 는 scaffold.ps1 을 사용한다. 동작은 동일하다.
#
# 사용:
#   ./scaffold.sh --name project_test --target ~/work/project_test
#   ./scaffold.sh --name Demo --target ./Demo --skip-db --skip-install
#
# 사전 요구: python3, pnpm. psql 은 PATH 에 없어도 표준 설치 경로를 탐색한다.
#            찾지 못하면 DB 단계만 건너뛴다.

# ---------- 기본값 / 인자 ----------
NAME=""
TARGET=""
SKIP_DB=0
SKIP_INSTALL=0
DESIGN_FLAG=""        # "yes" | "no" | ""(질문)
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="postgres"
DB_PASSWORD=""
DB_NAME=""

# 값이 필요한 옵션의 값 누락 검사 (누락 시 무한 루프 방지)
_need_val() { [ "$2" -ge 2 ] || { echo "옵션 $1 에 값이 필요합니다" >&2; exit 1; }; }

while [ $# -gt 0 ]; do
  case "$1" in
    --name)         _need_val "$1" $#; NAME="$2"; shift 2 ;;
    --target)       _need_val "$1" $#; TARGET="$2"; shift 2 ;;
    --skip-db)      SKIP_DB=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --design)       DESIGN_FLAG="yes"; shift ;;
    --no-design)    DESIGN_FLAG="no"; shift ;;
    --db-host)      _need_val "$1" $#; DB_HOST="$2"; shift 2 ;;
    --db-port)      _need_val "$1" $#; DB_PORT="$2"; shift 2 ;;
    --db-user)      _need_val "$1" $#; DB_USER="$2"; shift 2 ;;
    --db-password)  _need_val "$1" $#; DB_PASSWORD="$2"; shift 2 ;;
    --db-name)      _need_val "$1" $#; DB_NAME="$2"; shift 2 ;;
    -h|--help)      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKELETON_DIR="$SCRIPT_DIR/skeleton"
DESIGN_FILE="$SCRIPT_DIR/DESIGN.md"

c_cyan='\033[36m'; c_green='\033[32m'; c_yellow='\033[33m'; c_reset='\033[0m'
step() { printf "\n${c_cyan}=== %s ===${c_reset}\n" "$1"; }
ok()   { printf "  ${c_green}[OK]${c_reset} %s\n" "$1"; }
warn() { printf "  ${c_yellow}[!]${c_reset}  %s\n" "$1"; }

# 최소 버전 로드 (단일 출처 versions.env — _activate_version_managers 의 fnm use 에서도 쓰므로 먼저 읽는다)
_BOOTSTRAP="$SCRIPT_DIR/skeleton/scripts/bootstrap.sh"
_VERSIONS_ENV="$SCRIPT_DIR/skeleton/scripts/versions.env"
if [ -f "$_VERSIONS_ENV" ]; then
  # shellcheck disable=SC1090
  . "$_VERSIONS_ENV"
fi

# 런타임 핀 로드 — ⚠️ 반드시 _activate_version_managers 보다 먼저 읽어야 한다.
# pyenv 는 "shim 이 PATH 에 있다"와 "어떤 버전을 쓴다"가 별개라, 활성화 시점에 핀 값이 필요하다.
_PY_PIN_FILE="$SKELETON_DIR/.python-version"
_PY_PIN=""
[ -f "$_PY_PIN_FILE" ] && _PY_PIN="$(head -n1 "$_PY_PIN_FILE" | tr -d '[:space:]')"
_NODE_PIN_FILE="$SKELETON_DIR/.nvmrc"
_NODE_PIN=""
[ -f "$_NODE_PIN_FILE" ] && _NODE_PIN="$(head -n1 "$_NODE_PIN_FILE" | tr -d '[:space:]' | sed 's/^v//')"

# pyenv / fnm 이 설치돼 있으면 셸 세션에 활성화 (시스템 Python/Node 대신 버전 관리 도구 우선)
_activate_version_managers() {
  if command -v pyenv >/dev/null 2>&1; then
    export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init --path 2>/dev/null || true)"
    eval "$(pyenv init - 2>/dev/null || true)"
    # ⛔ pyenv init 은 shim 을 PATH 에 올릴 뿐 버전을 고르지 않는다.
    #    pyenv global 이 system(예: 3.9.6)이면 python3 는 계속 system 을 가리켜
    #    bootstrap 이 3.13 을 설치·재사용한 뒤에도 검증 단계에서 실패한다.
    #    ⚠️ 설치돼 있지 않은 버전을 지정하면 모든 shim 호출이 깨지므로 반드시 설치 여부를 확인한다.
    if [ -n "${_PY_PIN:-}" ] && pyenv versions --bare 2>/dev/null | grep -qx "$_PY_PIN"; then
      export PYENV_VERSION="$_PY_PIN"
    else
      # 핀이 설치돼 있지 않으면 하한을 충족하는 설치본 중 가장 높은 것을 고른다 (system 폴백 방지)
      _pv="$(pyenv versions --bare 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
             | awk -v min="${MIN_PYTHON:-3.13}" 'index($0, min ".") == 1 || $0 == min' \
             | sort -V | tail -n1)"
      [ -n "$_pv" ] && export PYENV_VERSION="$_pv"
    fi
  fi
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --use-on-cd 2>/dev/null || true)"
    # .nvmrc 핀을 우선 존중하고, 실패하면 최소 Node 버전으로 활성화한다
    # (템플릿 루트에는 .nvmrc 가 없으므로 cd 훅만으로는 활성화되지 않는다)
    fnm use "${_NODE_PIN:-${MIN_NODE:-24}}" >/dev/null 2>&1 \
      || fnm use "${MIN_NODE:-24}" >/dev/null 2>&1 || true
  fi
}
_activate_version_managers

# 필수 도구 확인 — 미달이면 bootstrap.sh 자동 실행
_need_bootstrap=0

_ext_ver(){ printf '%s' "$1" | grep -oE '[0-9]+(\.[0-9]+){0,2}' | head -n1 || true; }
_meets(){
  [ -n "$2" ] || return 1
  awk -v min="$1" -v have="$2" 'BEGIN {
    min_n = split(min, min_parts, ".")
    have_n = split(have, have_parts, ".")
    n = min_n > have_n ? min_n : have_n
    for (i = 1; i <= n; i++) {
      min_part = (i <= min_n ? min_parts[i] : 0) + 0
      have_part = (i <= have_n ? have_parts[i] : 0) + 0
      if (have_part > min_part) exit 0
      if (have_part < min_part) exit 1
    }
    exit 0
  }'
}

# bootstrap 이 필요한 기준은 "런타임이 하한 미달"이다 (versions.env 정책: 이상이면 재사용).
# ⛔ pyenv/fnm 이 없다는 이유만으로 bootstrap 을 강제하지 않는다 — 이미 조건을 만족한 환경까지
# 골격 생성 전에 막아버린다.
_PY="$(_ext_ver "$(python3 --version 2>/dev/null || true)")"
_meets "${MIN_PYTHON:-3.13}" "$_PY" || _need_bootstrap=1
_NODE="$(_ext_ver "$(node --version 2>/dev/null || true)")"
_meets "${MIN_NODE:-24}" "$_NODE" || _need_bootstrap=1
_PNPM="$(_ext_ver "$(pnpm --version 2>/dev/null || true)")"
_meets "${MIN_PNPM:-11}" "$_PNPM" || _need_bootstrap=1
# skeleton/.python-version 핀 처리 (_PY_PIN 로드는 위 활성화 블록보다 앞에서 이미 끝났다)
#  - pyenv 가 있으면: 핀된 정확한 버전이 실제 설치돼 있어야 한다(없으면 bootstrap 이 설치 시도).
#  - pyenv 가 없으면: 핀을 강제할 수단이 없다. 하한을 충족하는 Python 을 쓰되 CI 와의 차이만 경고한다.
if [ -n "$_PY_PIN" ]; then
  if command -v pyenv >/dev/null 2>&1; then
    if [ "$_need_bootstrap" = "0" ] && ! pyenv versions --bare 2>/dev/null | grep -qx "$_PY_PIN"; then
      _need_bootstrap=1
    fi
  elif [ "$_need_bootstrap" = "0" ]; then
    case "$_PY" in
      "$_PY_PIN"|"$_PY_PIN".*) : ;;
      *)
        warn "Python 핀($_PY_PIN)과 설치본($_PY)이 다릅니다 — CI 는 .python-version 을 읽으므로 로컬과 다른 버전을 씁니다."
        printf '        일치시키려면 pyenv 를 설치해 핀 버전을 쓰거나, 생성 후 프로젝트의 .python-version 을 설치본에 맞추세요.\n'
        ;;
    esac
  fi
fi

# bootstrap 이 고정한 런타임 버전을 받아둘 임시 폴더.
# ⛔ --project-root 없이 실행하면 bootstrap 이 템플릿의 skeleton/.python-version·.nvmrc 를
#    덮어써 리포를 오염시킨다. 임시 폴더에 받아 두었다가 복사 단계에서 생성 프로젝트로 옮긴다.
_PIN_DIR=""
if [ "$_need_bootstrap" = "1" ]; then
  if [ -f "$_BOOTSTRAP" ]; then
    warn "필수 도구 또는 Python·Node·pnpm 버전이 기준 미달 — bootstrap.sh 를 먼저 실행합니다 …"
    _PIN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/scaffold-pin.XXXXXX")"
    # 골격의 핀을 미리 심어 bootstrap 이 "기존 .python-version 핀 존중" 경로를 타게 한다.
    # ⛔ 빈 폴더를 넘기면 bootstrap 이 핀을 못 읽고 임의의 최신 패치를 골라, 생성 프로젝트의
    #    런타임 버전이 "스캐폴드를 돌린 날"에 따라 달라진다(재현 불가).
    [ -f "$_PY_PIN_FILE" ]   && cp "$_PY_PIN_FILE"   "$_PIN_DIR/.python-version"
    [ -f "$_NODE_PIN_FILE" ] && cp "$_NODE_PIN_FILE" "$_PIN_DIR/.nvmrc"
    bash "$_BOOTSTRAP" --project-root "$_PIN_DIR"
    _rc=$?
    if [ "$_rc" -ne 0 ]; then
      warn "bootstrap.sh 실패 (종료 코드 $_rc) — 스캐폴드를 중단합니다. 위 로그의 오류를 해결한 뒤 다시 실행하세요."
      rm -rf "$_PIN_DIR"
      exit 1
    fi
    # bootstrap 이 실제로 고정한 버전을 핀으로 재채택한 뒤 활성화한다.
    # (핀이 pyenv 에 없어 bootstrap 이 다른 패치로 폴백했을 수 있다)
    [ -f "$_PIN_DIR/.python-version" ] && _PY_PIN="$(head -n1 "$_PIN_DIR/.python-version" | tr -d '[:space:]')"
    [ -f "$_PIN_DIR/.nvmrc" ] && _NODE_PIN="$(head -n1 "$_PIN_DIR/.nvmrc" | tr -d '[:space:]' | sed 's/^v//')"
    _activate_version_managers                                    # bootstrap 후 현재 프로세스에 재적용
                                                                  # (fnm use 는 이 함수 안에서 핀 기준으로 수행된다)

    # 검증 기준은 "런타임이 하한을 충족하는가"이지 "pyenv·fnm 이 설치됐는가"가 아니다 —
    # 관리자 없이 기존 설치본을 재사용하는 경로가 정상 경로이기 때문이다.
    _bootstrap_ok=1
    _PY="$(_ext_ver "$(python3 --version 2>/dev/null || true)")"
    _meets "${MIN_PYTHON:-3.13}" "$_PY" || { warn "bootstrap 후에도 Python 이 ${MIN_PYTHON:-3.13} 이상이 아닙니다."; _bootstrap_ok=0; }
    _NODE="$(_ext_ver "$(node --version 2>/dev/null || true)")"
    _meets "${MIN_NODE:-24}" "$_NODE" || { warn "bootstrap 후에도 Node 가 ${MIN_NODE:-24} 이상이 아닙니다."; _bootstrap_ok=0; }
    _PNPM="$(_ext_ver "$(pnpm --version 2>/dev/null || true)")"
    _meets "${MIN_PNPM:-11}" "$_PNPM" || { warn "bootstrap 후에도 pnpm 이 ${MIN_PNPM:-11} 이상이 아닙니다."; _bootstrap_ok=0; }
    # 핀이 pyenv 에 설치됐는지는 경고 대상이지 중단 사유가 아니다. bootstrap 이 핀을 설치하지
    # 못해도 하한을 충족하는 Python 으로 폴백했을 수 있고, 위 런타임 검증을 이미 통과했다.
    if [ -n "$_PY_PIN" ] && command -v pyenv >/dev/null 2>&1; then
      if ! pyenv versions --bare 2>/dev/null | grep -qx "$_PY_PIN"; then
        warn "Python 핀 $_PY_PIN 이 pyenv 에 없습니다 — 하한을 충족하는 설치본으로 진행합니다. CI 는 핀을 사용합니다."
      fi
    fi
    if [ "$_bootstrap_ok" != "1" ]; then
      warn "bootstrap 후 필수 도구 검증 실패 — 스캐폴드를 중단합니다."
      rm -rf "$_PIN_DIR"
      exit 1
    fi
  else
    warn "bootstrap.sh 를 찾을 수 없습니다 ($_BOOTSTRAP). 수동으로 먼저 실행하세요."
    exit 1
  fi
fi

# ---------- 테마 ----------
default_theme() {
  cat <<'EOF'
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
EOF
}

parse_design() {
  local file="$1" in_front=0 section="" font="" colors=""
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*---[[:space:]]*$ ]]; then
      if [ $in_front -eq 0 ]; then in_front=1; continue; else break; fi
    fi
    [ $in_front -eq 0 ] && continue
    if [[ "$line" =~ ^[A-Za-z] ]]; then
      if   [[ "$line" =~ ^colors: ]];     then section="colors"
      elif [[ "$line" =~ ^typography: ]]; then section="typography"
      else section=""; fi
      continue
    fi
    if [ "$section" = "colors" ] && [[ "$line" =~ ^[[:space:]]+([a-z0-9-]+):[[:space:]]*\'?(#[0-9a-fA-F]{3,8})\'? ]]; then
      colors+="  --color-${BASH_REMATCH[1]}: ${BASH_REMATCH[2]};"$'\n'
    fi
    if [ "$section" = "typography" ] && [ -z "$font" ] && [[ "$line" =~ fontFamily:[[:space:]]*\'?([^\'$'\r']+)\'?[[:space:]]*$ ]]; then
      font="${BASH_REMATCH[1]}"
      font="${font%"${font##*[![:space:]]}"}"   # 후행 공백 제거 (scaffold.ps1 의 Trim() 과 일치)
    fi
  done < "$file"
  if [ -z "$colors" ]; then default_theme; return; fi
  printf '@theme {\n'
  printf "  --font-sans: '%s', 'Noto Sans KR', system-ui, sans-serif;\n" "${font:-Inter}"
  printf '%s' "$colors"
  printf '}\n'
}

# ---------- 1. 입력 ----------
step "신규 프로젝트 스캐폴드"
[ -z "$NAME" ]   && read -r -p "프로젝트 이름 (예: project_test): " NAME
[ -z "$NAME" ]   && { echo "프로젝트 이름이 필요합니다." >&2; exit 1; }
# --target 미지정 시 기본값: _project-template 의 부모 폴더에 <이름> 으로 생성
if [ -z "$TARGET" ]; then
  DEFAULT_TARGET="$(dirname "$SCRIPT_DIR")/$NAME"
  [ -t 0 ] && read -r -p "생성 위치 [$DEFAULT_TARGET]: " TARGET
  [ -z "$TARGET" ] && TARGET="$DEFAULT_TARGET"
fi

# ~ 확장 + 상대경로는 현재 위치 기준 절대경로화 (드라이브 문자 경로도 절대로 인식)
# '~' 단독 / '~/...' 만 확장한다 ('~user' 를 $HOME+user 로 오확장하지 않도록)
case "$TARGET" in
  "~")   TARGET="$HOME" ;;
  "~/"*) TARGET="$HOME${TARGET#\~}" ;;
  "~"*)  echo "'~사용자' 형태 경로는 지원하지 않습니다 — 절대 경로를 사용하세요: $TARGET" >&2; exit 1 ;;
esac
case "$TARGET" in
  /*) ;;                # unix 절대경로
  [A-Za-z]:[\\/]*) ;;   # windows 드라이브 경로 (wsl/git-bash)
  *) TARGET="$PWD/$TARGET" ;;
esac

SNAKE=$(printf '%s' "$NAME" | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g' | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')
# ⛔ ASCII 영숫자가 하나도 없으면(예: --name "내앱") SNAKE 가 빈 문자열이 된다.
#    그대로 두면 DATABASE_URL 에 DB 이름이 없고, 쿠키가 "_session", npm 이름이 "-frontend" 가 되며
#    CREATE DATABASE "" 로 실패한다 — 게다가 종료 코드 0 이라 조용히 깨진 프로젝트가 나온다.
if [ -z "$SNAKE" ]; then
  echo "프로젝트 이름에서 식별자를 만들 수 없습니다: $NAME" >&2
  echo "  ASCII 영문자·숫자를 1자 이상 포함하세요 (DB 이름·npm 패키지명·쿠키명에 쓰입니다)." >&2
  exit 1
fi
[ -z "$DB_NAME" ] && DB_NAME="$SNAKE"
ok "이름=$NAME  snake=$SNAKE  위치=$TARGET"

# DESIGN.md 사용 여부
USE_DESIGN=0
if [ "$DESIGN_FLAG" = "no" ] || [ ! -f "$DESIGN_FILE" ]; then
  USE_DESIGN=0
elif [ "$DESIGN_FLAG" = "yes" ]; then
  USE_DESIGN=1
elif [ -t 0 ]; then
  read -r -p "DESIGN.md 의 색상/타이포그래피를 적용할까요? (Y/n): " ans
  case "$ans" in ""|[Yy]*) USE_DESIGN=1 ;; *) USE_DESIGN=0 ;; esac
else
  USE_DESIGN=1
fi
if [ $USE_DESIGN -eq 1 ]; then THEME="$(parse_design "$DESIGN_FILE")"; ok "DESIGN.md 테마 적용"
else THEME="$(default_theme)"; ok "기본 테마 적용"; fi

# DB 입력
if [ $SKIP_DB -eq 0 ]; then
  step "PostgreSQL 접속 정보 (psql 로 DB 생성)"
  if [ -t 0 ]; then
    read -r -p "DB host [$DB_HOST]: " i; [ -n "$i" ] && DB_HOST="$i"
    read -r -p "DB port [$DB_PORT]: " i; [ -n "$i" ] && DB_PORT="$i"
    read -r -p "DB user [$DB_USER]: " i; [ -n "$i" ] && DB_USER="$i"
    [ -z "$DB_PASSWORD" ] && { read -r -s -p "DB password: " DB_PASSWORD; echo; }
    read -r -p "DB name [$DB_NAME]: " i; [ -n "$i" ] && DB_NAME="$i"
  fi
fi

# DB 사전 접속 검사 (psql 로 SELECT 1) — 접속 정보 입력 직후 1회 가볍게 확인한다.
# 실패하면 접속 실패 요지를 경고하고, 대화형이면 1회 재입력, 비대화형이면 DB 단계 전체를 건너뛴다.
# 여기서 DB_UNREACHABLE=1 이면 아래 6단계에서 CREATE DATABASE·alembic 을 모두 생략한다.
# psql 이 없으면 검사 불가 → 아래 DB 단계에서 'psql 없음' 으로 안내한다.
# psql 활성화 — 배포판·설치 방식에 따라 psql 이 PATH 에 없을 수 있다
# (macOS Postgres.app, Debian/Ubuntu 의 /usr/lib/postgresql/<ver>/bin, keg-only Homebrew formula).
# 설치돼 있는데도 DB 단계를 건너뛰지 않도록 표준 경로를 탐색해 PATH 에 추가한다.
enable_psql(){
  command -v psql >/dev/null 2>&1 && return 0
  _best=""; _best_ver=-1
  for _d in /Applications/Postgres.app/Contents/Versions/*/bin \
            /usr/lib/postgresql/*/bin \
            /usr/pgsql-*/bin \
            /opt/homebrew/opt/postgresql@*/bin \
            /usr/local/opt/postgresql@*/bin; do
    [ -x "$_d/psql" ] || continue
    # 경로에서 첫 번째 숫자 덩어리를 메이저 버전으로 본다 (없으면 0)
    _v=$(printf '%s' "$_d" | grep -oE '[0-9]+' | head -n1)
    [ -n "$_v" ] || _v=0
    if [ "$_v" -gt "$_best_ver" ]; then _best_ver="$_v"; _best="$_d"; fi
  done
  if [ -n "$_best" ]; then
    PATH="$_best:$PATH"; export PATH
    ok "psql 을 PATH 에서 찾지 못해 설치 경로를 사용합니다: $_best"
  fi
}

DB_UNREACHABLE=0
[ $SKIP_DB -eq 0 ] && enable_psql
if [ $SKIP_DB -eq 0 ] && command -v psql >/dev/null 2>&1; then
  _db_retried=0
  while :; do
    export PGPASSWORD="$DB_PASSWORD"
    # stderr 만 캡처(2>&1 >/dev/null): 성공 출력은 버리고 실패 메시지 요지만 취한다.
    _pc_err=$(psql -w -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1" 2>&1 >/dev/null)
    _pc_rc=$?
    unset PGPASSWORD
    [ "$_pc_rc" -eq 0 ] && break
    _pc_summary=$(printf '%s\n' "$_pc_err" | grep -v '^[[:space:]]*$' | tail -n1)
    warn "접속 실패: ${_pc_summary:-psql 연결에 실패했습니다}"
    if [ -t 0 ] && [ "$_db_retried" -eq 0 ]; then
      _db_retried=1
      printf "  ${c_yellow}[!]${c_reset}  접속정보를 다시 입력하세요 (1회 재시도, Enter 는 기존값 유지)\n"
      read -r -p "DB host [$DB_HOST]: " i; [ -n "$i" ] && DB_HOST="$i"
      read -r -p "DB port [$DB_PORT]: " i; [ -n "$i" ] && DB_PORT="$i"
      read -r -p "DB user [$DB_USER]: " i; [ -n "$i" ] && DB_USER="$i"
      read -r -s -p "DB password [기존값 유지]: " i; echo; [ -n "$i" ] && DB_PASSWORD="$i"
      read -r -p "DB name [$DB_NAME]: " i; [ -n "$i" ] && DB_NAME="$i"
      continue
    fi
    warn "DB 접속 불가로 판단 — DB 생성/마이그레이션 단계를 건너뜁니다"
    DB_UNREACHABLE=1
    break
  done
fi

# DB 이름 따옴표 검사 (SQL 구문 오류를 난해한 메시지 대신 명확한 에러로)
case "$DB_NAME" in
  *"'"*|*'"'*) echo "DB 이름에 따옴표(' \")는 사용할 수 없습니다: $DB_NAME" >&2; exit 1 ;;
esac
# 비밀번호는 URL 인코딩해 DATABASE_URL 에 넣는다 (@ : / # ? % 등 특수문자 안전).
# ⛔ 인코딩 실패 시 원문 폴백을 두지 않는다 — 특수문자 비밀번호가 인코딩 없이 URL 에 들어가면
#    "생성은 성공했는데 DB 접속만 조용히 실패"하는 프로젝트가 나온다. 런타임 사전 검사(위)가
#    python3 를 보장하므로 이 실패는 비정상 상황이고, 즉시 중단이 맞다.
_urlenc() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}
DB_PASSWORD_ENC="$(_urlenc "$DB_PASSWORD")" \
  || { echo "DB 비밀번호 URL 인코딩에 실패했습니다 (python3 확인) — 중단합니다." >&2; exit 1; }
DATABASE_URL="postgresql+psycopg2://${DB_USER}:${DB_PASSWORD_ENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
# SECRET_KEY 는 JWT 서명키이므로 반드시 암호학적 난수여야 한다.
# ⛔ 타임스탬프 폴백(change-me-<epoch>)은 생성 시각만 추측하면 서명키가 복원되어 토큰 위조로
#    직결된다 — 난수를 만들 수 없으면 약한 키로 진행하지 말고 즉시 중단한다.
if command -v openssl >/dev/null 2>&1; then SECRET=$(openssl rand -hex 24)
elif command -v python3 >/dev/null 2>&1; then SECRET=$(python3 -c 'import secrets;print(secrets.token_hex(24))')
else
  echo "SECRET_KEY 를 생성할 수 없습니다: openssl 또는 python3 가 필요합니다." >&2
  echo "  둘 중 하나를 설치한 뒤 다시 실행하세요 (JWT 서명키는 암호학적 난수여야 합니다)." >&2
  exit 1
fi

# 초기 관리자 비밀번호도 무작위로 생성한다.
# ⛔ 하드코딩된 기본값(admin123)을 쓰면 이 템플릿으로 만든 모든 프로젝트가 같은 자격증명을 갖는다.
#    타임스탬프 폴백(admin-<epoch>)도 같은 이유로 두지 않는다 — 위 SECRET 생성에서 openssl/python3
#    부재 시 이미 중단했으므로 여기서는 둘 중 하나가 반드시 존재한다.
if command -v openssl >/dev/null 2>&1; then SEED_ADMIN_PW=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-16)
else SEED_ADMIN_PW=$(python3 -c 'import secrets;print(secrets.token_urlsafe(12))'); fi

# ---------- 2. 복사 ----------
step "골격 복사 → $TARGET"
if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  warn "대상 디렉토리가 비어있지 않습니다 — 기존 파일 위에 골격을 덮어씁니다: $TARGET"
  # ⛔ 재실행은 파괴적이다(사용자가 고친 골격 파일이 원본으로 되돌아간다).
  #    대화형이면 확인을 받고, 비대화형(CI·스크립트)이면 중단한다.
  if [ -t 0 ]; then
    printf "  계속할까요? 기존 파일을 덮어씁니다 (y/N): "
    read -r _overwrite_ans
    case "$_overwrite_ans" in
      [Yy]*) : ;;
      *) echo "중단합니다." >&2; exit 1 ;;
    esac
  else
    warn "비대화형 실행이므로 중단합니다. 덮어쓰려면 대상 디렉터리를 비우거나 대화형으로 실행하세요."
    exit 1
  fi
fi
mkdir -p "$TARGET" || { warn "대상 디렉토리 생성 실패: $TARGET"; exit 1; }
# ⛔ cp -R 로 통째 복사하지 않는다 — 템플릿 저장소에서 개발/검증을 하면 skeleton/ 안에
#    node_modules(수백 MB)·.venv·.next 같은 gitignore 산출물이 남는데, 그대로 복사되면
#    생성 프로젝트가 수백 MB 로 부풀고 아래 토큰 치환이 빌드 산출물을 붙잡고 사실상 멈춘다.
#    실제 .env 가 복사되면 템플릿의 SECRET_KEY 가 새 프로젝트로 새는 보안 문제도 된다.
#    tar 는 GNU/bsdtar 모두 --exclude 를 지원하므로 산출물·비밀을 원천 제외하고 복사한다.
_COPY_EXCLUDES="node_modules .venv .next .ruff_cache .pytest_cache __pycache__ .DS_Store .env"
_tar_ex=""
for _e in $_COPY_EXCLUDES; do _tar_ex="$_tar_ex --exclude $_e"; done
# shellcheck disable=SC2086  # $_tar_ex 는 공백으로 나뉘어야 하는 옵션 나열이다
if ! (cd "$SKELETON_DIR" && tar cf - $_tar_ex .) | (cd "$TARGET" && tar xf -); then
  warn "골격 복사 실패 (권한/디스크 확인) — 중단합니다"; exit 1
fi
[ $USE_DESIGN -eq 1 ] && cp "$DESIGN_FILE" "$TARGET/docs/DESIGN.md"
# bootstrap 이 실제로 설치·고정한 런타임 버전을 생성 프로젝트에 반영 (골격의 값은 덮어쓴다)
if [ -n "$_PIN_DIR" ]; then
  for _pin in .python-version .nvmrc; do
    [ -f "$_PIN_DIR/$_pin" ] && cp "$_PIN_DIR/$_pin" "$TARGET/$_pin"
  done
  rm -rf "$_PIN_DIR"
  _PIN_DIR=""
fi
ok "복사 완료"

# ---------- 3. 토큰 치환 ----------
step "토큰 치환"
# ⛔ bash 의 ${var//…} 로 치환하지 않는다 — macOS 기본 bash 3.2 의 패턴 치환은 문자열 길이에
#    사실상 제곱으로 느려져(특히 UTF-8 한국어 문서, LC_ALL=C 로도 부족) 75KB 문서 하나에
#    수십 초가 걸린다. python3 는 이 스크립트의 사전 요구이므로 단일 프로세스로 처리한다.
#    바이트 치환(토큰은 ASCII)이라 인코딩·줄바꿈이 원본 그대로 보존된다.
# 복사 단계가 산출물을 제외하지만, 기존 디렉토리 위에 덮어쓴 재실행(이미 install/build 된
# 프로젝트)에서는 node_modules·.next 등이 남아 있다 — 여기서도 반드시 걸러야 수 MB 빌드
# 산출물을 붙잡지 않는다(방어 이중화). 변경된 파일만 재기록한다(재실행 시 불필요한 mtime
# 변경 방지 — scaffold.ps1 과 동일).
SCAFFOLD_NAME="$NAME" SCAFFOLD_SNAKE="$SNAKE" SCAFFOLD_THEME="$THEME" \
SCAFFOLD_TARGET="$TARGET" python3 - <<'PYEOF' || { warn "토큰 치환 실패 — 중단합니다"; exit 1; }
import os

env = os.environ
target = env["SCAFFOLD_TARGET"]
tokens = [
    (b"__PROJECT_NAME__", env["SCAFFOLD_NAME"].encode()),
    (b"__PROJECT_SNAKE__", env["SCAFFOLD_SNAKE"].encode()),
    (b"__THEME_CSS__", env["SCAFFOLD_THEME"].encode()),
]
PRUNE = {"node_modules", ".venv", ".next", ".ruff_cache", ".pytest_cache", "__pycache__", ".git"}
EXTS = {".ts", ".tsx", ".py", ".css", ".html", ".json", ".md", ".ini", ".mako",
        ".js", ".mjs", ".example", ".txt"}

for root, dirs, files in os.walk(target):
    dirs[:] = [d for d in dirs if d not in PRUNE]
    for fn in files:
        if os.path.splitext(fn)[1] not in EXTS:
            continue
        path = os.path.join(root, fn)
        with open(path, "rb") as fh:
            content = fh.read()
        new = content
        for token, value in tokens:
            new = new.replace(token, value)
        if new != content:
            with open(path, "wb") as fh:
                fh.write(new)
PYEOF
ok "치환 완료"

# ---------- 4. .env ----------
step ".env 생성 (OS 무관 주입 — architecture.md §5)"
# ⛔ 기존 .env 를 덮어쓰면 SECRET_KEY 가 재발급되어 발급된 JWT 가 전부 무효가 되고,
#    손으로 채운 DB 비밀번호도 사라진다. 백업을 남긴 뒤 새로 쓴다.
if [ -f "$TARGET/backend/.env" ]; then
  _env_bak="$TARGET/backend/.env.bak.$(date +%Y%m%d%H%M%S)"
  cp "$TARGET/backend/.env" "$_env_bak" && warn "기존 backend/.env 를 백업했습니다: $(basename "$_env_bak")"
fi
cat > "$TARGET/backend/.env" <<EOF || { warn "backend/.env 생성 실패 — 중단합니다"; exit 1; }
DATABASE_URL=$DATABASE_URL
SECRET_KEY=$SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=15
# 인증 세션·로그인 스로틀 (architecture.md §9) — 코드 기본값과 같지만, 운영자가 .env 만 보고도
# 조절 지점을 알 수 있도록 명시한다.
REFRESH_TOKEN_EXPIRE_DAYS=14
LOGIN_MAX_FAILURES=5
LOGIN_LOCKOUT_MINUTES=15
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://localhost:8000
TZ=Asia/Seoul
APP_ENV=development
# 초기 관리자 시드 — 코드 기본값은 꺼져 있고(backend/app/config.py) 개발 편의를 위해 여기서만 켠다.
# ⛔ 배포 전 SEED_DEFAULT_ADMIN=false 로 끄고 APP_ENV=production 으로 바꾼다.
SEED_DEFAULT_ADMIN=true
DEFAULT_ADMIN_PASSWORD=$SEED_ADMIN_PW
EOF
chmod 600 "$TARGET/backend/.env" 2>/dev/null || warn "backend/.env 권한 설정 실패 — 수동으로 chmod 600 하세요"
printf 'FASTAPI_URL=http://localhost:8000\n' > "$TARGET/frontend/.env" \
  || { warn "frontend/.env 생성 실패 — 중단합니다"; exit 1; }
ok "backend/.env, frontend/.env 생성 (DATABASE_URL, SECRET_KEY 주입)"

BACKEND="$TARGET/backend"
FRONTEND="$TARGET/frontend"

# ---------- 5. 백엔드 설치 ----------
if [ $SKIP_INSTALL -eq 0 ]; then
  step "백엔드: venv + 의존성 설치"
  if command -v python3 >/dev/null 2>&1; then
    ( cd "$BACKEND" && python3 -m venv .venv && .venv/bin/python -m pip install --upgrade pip -q && .venv/bin/python -m pip install -r requirements.txt ) \
      && ok "백엔드 의존성 설치 완료" || warn "백엔드 설치 중 오류"
  else warn "python3 없음 — 백엔드 설치 건너뜀"; fi
else warn "skip-install: 백엔드 설치 건너뜀"; fi

# ---------- 6. DB + 테이블(Alembic) ----------
# DB 접속 불가 시 안내(한 블록만) — CREATE DATABASE·alembic 을 모두 건너뛰고 수동 실행법만 보여준다.
_db_unreachable_guide() {
  warn "DB 접속 불가 — 접속정보(host/port/user/password) 확인 후 다음을 수동 실행:"
  printf "        1) DB 생성:     psql -h %s -p %s -U %s -d postgres -c 'CREATE DATABASE \"%s\"'\n" "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_NAME"
  printf "        2) 테이블 생성:  cd backend && .venv/bin/python -m alembic upgrade head\n"
}
# alembic upgrade — 실패해도 traceback 전체를 쏟지 않고 마지막 몇 줄(핵심 에러) + 임시 로그 경로만 안내.
_run_alembic() {
  if [ $SKIP_INSTALL -eq 0 ] && [ -x "$BACKEND/.venv/bin/python" ]; then
    step "Alembic: 테이블 생성 (upgrade head) — DB는 항상 Alembic으로 관리 §11"
    _alembic_log="$(mktemp 2>/dev/null || printf '%s' "${TMPDIR:-/tmp}/scaffold-alembic.$$.log")"
    if ( cd "$BACKEND" && .venv/bin/python -m alembic upgrade head ) >"$_alembic_log" 2>&1; then
      ok "테이블 생성 완료 (app_meta)"
      rm -f "$_alembic_log"
    else
      warn "alembic 실패 — 핵심 오류(마지막 6줄):"
      tail -n 6 "$_alembic_log" 2>/dev/null | sed 's/^/        /'
      warn "전체 로그: $_alembic_log"
      warn "수동 재실행: cd backend && .venv/bin/python -m alembic upgrade head"
    fi
  else warn "venv 미설치 — 'cd backend && .venv/bin/python -m alembic upgrade head' 수동 실행"; fi
}
if [ $SKIP_DB -eq 0 ]; then
  step "PostgreSQL: 데이터베이스 생성"
  enable_psql
  if ! command -v psql >/dev/null 2>&1; then
    warn "psql 을 찾을 수 없습니다 (PATH·표준 설치 경로 모두) — DB 생성 건너뜀."
    warn "PostgreSQL 이 설치돼 있다면 bin 디렉터리를 PATH 에 추가하세요. 수동 생성 후 alembic upgrade head"
  elif [ "$DB_UNREACHABLE" = "1" ]; then
    # 사전 검사에서 이미 접속 불가로 판정 — 조회/생성/alembic 모두 생략하고 안내만.
    _db_unreachable_guide
  else
    export PGPASSWORD="$DB_PASSWORD"
    exists=$(psql -w -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null)
    _q_rc=$?
    unset PGPASSWORD
    if [ "$_q_rc" -ne 0 ]; then
      # 사전 검사 이후 접속이 끊긴 경우 — 접속 실패로 보고 CREATE·alembic 모두 건너뛴다.
      _db_unreachable_guide
    elif [ "$exists" = "1" ]; then
      warn "DB 이미 존재: $DB_NAME"
      _run_alembic
    else
      export PGPASSWORD="$DB_PASSWORD"
      if psql -w -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\""; then
        ok "DB 생성: $DB_NAME"
        unset PGPASSWORD
        _run_alembic
      else
        unset PGPASSWORD
        warn "DB 생성 실패 — 접속정보 확인 후 수동으로 DB 생성/alembic 실행"
      fi
    fi
  fi
else warn "skip-db: DB 생성/마이그레이션 건너뜀"; fi

# ---------- 7. 프론트 설치 ----------
if [ $SKIP_INSTALL -eq 0 ]; then
  step "프론트엔드: pnpm install"
  if command -v pnpm >/dev/null 2>&1; then
    if ( cd "$FRONTEND" && pnpm install ); then
      ok "프론트 의존성 설치 완료"
    else
      # 흔한 원인: 빌드 스크립트 차단(ERR_PNPM_IGNORED_BUILDS). 승인 후 재시도.
      warn "pnpm install 1차 비정상 종료 — 빌드 스크립트 승인 후 재시도"
      if ( cd "$FRONTEND" && { pnpm approve-builds --all >/dev/null 2>&1; pnpm install; } ); then
        ok "프론트 의존성 설치 완료(재시도)"
      else warn "pnpm install 미완료 — 'cd frontend && pnpm install' 로 직접 확인하세요 (백엔드/DB는 정상)"; fi
    fi
  else warn "pnpm 없음 — 'npm i -g pnpm' 후 'cd frontend && pnpm install'"; fi
else warn "skip-install: 프론트 설치 건너뜀"; fi

# ---------- 8. 안내 ----------
step "완료! 실행 방법"
cat <<EOF
[백엔드]  새 터미널에서:
  cd "$BACKEND"
  source .venv/bin/activate
  uvicorn app.main:app --reload --port 8000

[프론트]  또 다른 터미널에서:
  cd "$FRONTEND"
  pnpm dev              # 개발 서버
  pnpm typecheck        # 타입 검사 (tsc --noEmit)

[로그인]  초기 관리자 계정 (backend/.env 의 DEFAULT_ADMIN_PASSWORD):
  아이디: admin
  비밀번호: $SEED_ADMIN_PW
  ⛔ 배포 전 이 계정의 비밀번호를 바꾸고 SEED_DEFAULT_ADMIN=false, APP_ENV=production 으로 설정하세요.

[확인]    브라우저: http://localhost:3000
          → '백엔드 API'와 '데이터베이스'가 모두 '정상'이면 성공입니다.

[DB 변경] 모델 수정 시 (architecture.md §11):
  cd "$BACKEND"
  .venv/bin/python -m alembic revision --autogenerate -m "변경요약"
  .venv/bin/python -m alembic upgrade head
EOF
