---
name: pr-workflow
description: __PROJECT_NAME__ 에서 변경을 커밋·push 할 때 사용. main 직접 커밋 기본 흐름, push 전 로컬 검증 게이트, 커밋 메시지 형식([Structural]/[Behavioral]), Structural·Behavioral 분리, 선택적 브랜치·PR 사용 기준을 architecture.md §19·§20 기준으로 안내한다.
---

# 커밋 · push (브랜치·PR은 선택)

> 기본 흐름은 **`main`에서 작업 → 로컬 검증 → 커밋 → push** 다. (architecture.md §20)

## ⛔ push 전 로컬 검증이 유일한 게이트다

PR 리뷰 단계가 없으므로 **검증을 건너뛰면 깨진 코드가 곧바로 `main`에 남는다.**
CI는 push 이후에 도는 **사후 안전망**이지 사전 게이트가 아니다.

```powershell
cd backend;  .\.venv\Scripts\python -m pytest -q;  .\.venv\Scripts\python -m ruff check .
cd ..\frontend;  pnpm lint;  pnpm typecheck;  pnpm test;  pnpm build
```

- 실패했거나 확인하지 않았으면 **push 하지 않는다.**
- push 후 CI가 실패하면 되돌리거나 즉시 고치는 커밋을 올린다. 실패 상태를 방치하지 않는다.
- 변경이 한쪽에만 있으면 그쪽만 돌려도 된다. 문서만 고쳤으면 생략 가능하다.

## 커밋 메시지 (§19)
- **형식**: `[Category] <type>: <요약(한글, 50자 이내, 현재형)>`
- **Category**: `[Structural]`(구조 변경, 로직 불변) / `[Behavioral]`(기능·버그·로직 변경)
- **type**: `feat` `fix` `refactor` `docs` `style` `test` `chore`
- 예: `[Behavioral] feat: 주문 생성 API 추가`, `[Structural] refactor: 의존성 dependencies.py로 이동`
- **Tidy First**: 구조 변경과 동작 변경을 **한 커밋에 섞지 않는다.** 브랜치가 없어도 이 분리는 유지한다.
- **작게 유지**: 한 커밋은 한 가지 목적. 나중에 되돌릴 수 있는 크기로.

## 기본 흐름 (PowerShell)
```powershell
git pull --ff-only
# ... 작업 ...
# ... 위 로컬 검증 통과 확인 ...
git add <파일>
git commit -m "[Behavioral] feat: 주문 생성 API 추가"
git push
```

## 브랜치·PR을 쓰는 경우 (선택)

아래에 해당할 때만. 그 외에는 `main` 직접 커밋으로 충분하다.
- 되돌리기 어렵거나 광범위한 변경 — 마이그레이션이 얽힌 리팩터링, 의존성 대량 상향
- 여러 커밋에 걸쳐 진행 중이라 중간 상태를 `main`에 두고 싶지 않을 때
- 리뷰를 받고 싶을 때

- 브랜치 명명(kebab-case): `feat/<요약>`, `fix/<요약>`, `refactor/<요약>`, `docs/<요약>`
- PR 제목은 커밋과 동일 형식. **하나의 PR도 Structural·Behavioral 중 하나만** 담는다.
- 본문은 `.github/pull_request_template.md` 사용. 머지 전 **본인 diff 셀프 리뷰**, 머지 후 브랜치 삭제.

```powershell
git switch -c feat/order-create
# ... 작업 + 검증 + 커밋 ...
git push -u origin feat/order-create
gh pr create --fill --base main
gh pr merge --squash --delete-branch
```

- `gh`가 없으면: `brew install gh`(macOS) 또는 `winget install GitHub.cli`(Windows) 후 `gh auth login`.
- 원격(remote)이 아직 없으면 먼저 연결한다(`git remote add origin <url>`).

## 협업자가 생기면
`main` 브랜치 보호와 필수 CI 검사를 켜고 **PR 흐름을 기본으로 되돌린다.** 위 규칙은 단독 개발을 전제로 한다.
