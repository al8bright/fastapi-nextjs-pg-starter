# __PROJECT_NAME__ 작업 계획 (PLAN.md)

> TDD 순서대로 진행한다. **한 번에 실패하는 테스트 하나**(Red) → 최소 구현(Green) → 정리(Refactor).
> 구조 변경(Structural)과 동작 변경(Behavioral)을 분리한다.

## 0. 부트스트랩 (architecture.md §21 체크리스트)

- [ ] 저장소 구조 생성 (`backend/`, `frontend/`, `docs/`, 각 하위 `.env.example`, `.gitignore`)
- [ ] 백엔드 `app/` 골격: `main.py`, `config.py`, `dependencies.py`, `db/`, `core/security.py`
- [ ] `Settings` + `get_settings()`, CORS, KST 설정(Unix `TZ=Asia/Seoul`, Windows OS 서울 시각대)
- [ ] PostgreSQL `connect_args` KST 고정
- [ ] Alembic 초기화 + 초기 마이그레이션
- [ ] `pytest` + SQLite in-memory + `conftest.py` 픽스처
- [ ] 프론트 골격: `app/` App Router, `lib/server/fastapi.ts` 서버 fetch 래퍼, `lib/session.ts` 쿠키
- [ ] `middleware.ts` 쿠키 기반 인증 가드 + 오픈 리다이렉트 방지
- [ ] Tailwind v4 `@theme`, `@tailwindcss/postcss` + `app/globals.css`, pnpm, ESLint
- [ ] TypeScript 타입 검사 (`tsc --noEmit`)
- [ ] `.github/workflows/ci.yml` 동작 확인 (push 이후 사후 안전망 — 게이트는 push 전 로컬 검증)

## 1. <첫 기능>

- [ ] (Red) 실패 테스트: <테스트명>
- [ ] (Green) 최소 구현
- [ ] (Refactor) 정리

## 2. <다음 기능>

- [ ] ...
