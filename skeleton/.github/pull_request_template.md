## 요약

<무엇을 왜 바꿨는지 1~3줄>

## 변경 유형

- [ ] Structural (구조 변경, 동작 불변)
- [ ] Behavioral (기능·버그·로직 변경)

> 하나의 PR은 Structural · Behavioral 중 **하나만** 담는다.

## 테스트

- 추가/수정한 테스트와 결과 (pytest, 프론트 등)

## 체크리스트

- [ ] 모든 테스트 통과 + 린트 경고 0
- [ ] Structural / Behavioral 를 섞지 않음
- [ ] DB 변경 시 Alembic 마이그레이션 포함 (architecture.md §11)
- [ ] 설정 변경 시 `.env.example` 갱신 (architecture.md §5, §17)
