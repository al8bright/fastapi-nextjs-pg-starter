# docs/

프로젝트 고유 문서를 두는 곳이다. 템플릿이 제공하는 기준 문서는 저장소 루트에 있다.

| 루트 문서 | 역할 |
|---|---|
| [`README.md`](../README.md) | 개요·실행 방법 |
| [`AGENTS.md`](../AGENTS.md) / [`CLAUDE.md`](../CLAUDE.md) | AI 에이전트 지침 (CLAUDE.md 는 AGENTS.md 를 import) |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) | 아키텍처 기준(SSOT)·벗어난 결정 기록 |
| [`DESIGN.md`](../DESIGN.md) | 디자인 토큰(색상/타이포그래피) |
| [`PLAN.md`](../PLAN.md) | TDD 작업 순서 |

## 여기에 두는 문서 (예시)

- `prd.md` — 제품 요구사항
- `user-flow.md` — 유저 플로우·화면 흐름
- `spec-<기능>.md` — 기능 기획서
- `<연동>-가이드.md` — SSO·ERP 등 외부 연동 가이드
- `adr/` — 개별 의사결정 기록(필요 시)

기준(규칙)이 바뀌는 결정은 여기 대신 `ARCHITECTURE.md`·`AGENTS.md`에 반영한다.
