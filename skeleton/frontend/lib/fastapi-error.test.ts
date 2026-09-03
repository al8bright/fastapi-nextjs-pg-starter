import { describe, expect, it } from "vitest"
import { FastapiError, fastapiErrorMessage, kindFor } from "./fastapi-error"

// 실패 분류·문구 회귀 테스트 (architecture.md §13).
// 여기가 깨지면 429(시도 제한)·네트워크 오류·500 이 전부 "아이디 또는 비밀번호" 로 오진된다.
describe("kindFor", () => {
  it("상태코드를 원인으로 분류한다", () => {
    expect(kindFor(401)).toBe("unauthorized")
    expect(kindFor(422)).toBe("validation")
    expect(kindFor(429)).toBe("throttled")
    expect(kindFor(500)).toBe("server")
    expect(kindFor(503)).toBe("server")
    expect(kindFor(404)).toBe("http")
  })
})

describe("fastapiErrorMessage", () => {
  it("429(시도 제한)는 자격증명 오류와 다른 문구를 보여준다", () => {
    const message = fastapiErrorMessage(new FastapiError("throttled", 429, null))
    expect(message).not.toBe(fastapiErrorMessage(new FastapiError("unauthorized", 401, null)))
    expect(message).toContain("잠시 후")
  })

  it("429 의 백엔드 detail(대기 시간 안내)이 있으면 우선한다", () => {
    const error = new FastapiError("throttled", 429, "60초 후 다시 시도하세요.")
    expect(fastapiErrorMessage(error)).toBe("60초 후 다시 시도하세요.")
  })

  it("401 문구는 detail 과 무관하게 고정이다 (계정 존재 여부 비노출)", () => {
    const error = new FastapiError("unauthorized", 401, "user not found")
    expect(fastapiErrorMessage(error)).toBe("아이디 또는 비밀번호가 올바르지 않습니다.")
  })

  it("네트워크 실패는 백엔드 확인을 안내한다", () => {
    expect(fastapiErrorMessage(new FastapiError("network", 0, null))).toContain("백엔드")
  })

  it("FastapiError 가 아니면 일반 오류 문구로 떨어진다", () => {
    expect(fastapiErrorMessage(new Error("boom"))).toBe("알 수 없는 오류가 발생했습니다.")
  })
})
