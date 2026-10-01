import { describe, expect, it } from "vitest"
import { apiErrorMessage, editorUploadErrorMessage } from "./api-error"
import { FastapiError, parseErrorBody } from "./fastapi-error"

// 관리자 작업 오류 문구 — 409 가드 코드·413·422 배열·네트워크를 구분하는지 고정한다.
// Server Action 이 이 문구를 그대로 상태로 돌려주므로, 여기가 깨지면 화면이 엉뚱한 안내를 한다.

function err(status: number, body: unknown = null): FastapiError {
  const { detail, code, validation } = parseErrorBody(body)
  const kind = status === 401 ? "unauthorized" : status === 422 ? "validation" : status >= 500 ? "server" : "http"
  return new FastapiError(kind, status, detail, { code, validation })
}

describe("apiErrorMessage", () => {
  it("도메인 오류 코드를 한국어 문구로 바꾼다", () => {
    expect(apiErrorMessage(err(409, { detail: "x", code: "self_modification" }))).toBe(
      "자기 자신의 권한이나 활성 상태는 바꿀 수 없습니다.",
    )
    expect(apiErrorMessage(err(409, { detail: "x", code: "last_admin" }))).toContain("마지막 활성 관리자")
    expect(apiErrorMessage(err(409, { detail: "x", code: "too_many_attachments" }))).toContain("10개")
  })

  it("형식 오류는 서버가 준 허용 목록(detail)을 우선한다", () => {
    const e = err(422, { detail: "허용 형식: pdf, hwp", code: "unsupported_file_type" })
    expect(apiErrorMessage(e)).toBe("허용 형식: pdf, hwp")
  })

  it("413 은 상한(MB)을 넣어 안내한다", () => {
    expect(apiErrorMessage(err(413), { maxMb: 20 })).toBe("파일이 너무 큽니다. 20MB 이하만 올릴 수 있습니다.")
    expect(apiErrorMessage(err(413))).toBe("파일이 너무 큽니다.")
  })

  it("422 배열 detail 은 첫 메시지에서 'Value error, ' 를 뗀다", () => {
    const e = err(422, { detail: [{ msg: "Value error, 종료 시각은 시작 시각보다 뒤여야 합니다." }] })
    expect(apiErrorMessage(e)).toBe("종료 시각은 시작 시각보다 뒤여야 합니다.")
  })

  it("401·403·404·5xx·네트워크를 구분한다", () => {
    expect(apiErrorMessage(err(401))).toContain("로그인이 만료")
    expect(apiErrorMessage(err(403))).toBe("이 작업을 할 권한이 없습니다.")
    expect(apiErrorMessage(err(404))).toContain("찾을 수 없습니다")
    expect(apiErrorMessage(err(500))).toContain("서버 오류")
    expect(apiErrorMessage(new FastapiError("network", 0, null))).toContain("백엔드")
  })

  it("FastapiError 가 아니면 fallback", () => {
    expect(apiErrorMessage(new Error("boom"), { fallback: "대체 문구" })).toBe("대체 문구")
  })
})

describe("editorUploadErrorMessage", () => {
  it("상태코드별 문구", () => {
    expect(editorUploadErrorMessage(err(413))).toBe("이미지는 5MB 이하만 올릴 수 있습니다.")
    expect(editorUploadErrorMessage(err(415))).toContain("PNG·JPEG·WebP·GIF")
    expect(editorUploadErrorMessage(err(422, { detail: "이미지를 열 수 없습니다." }))).toBe("이미지를 열 수 없습니다.")
    expect(editorUploadErrorMessage(err(422, { detail: [{ msg: "bad" }] }))).toContain("다른 파일")
    expect(editorUploadErrorMessage(err(401))).toContain("로그인이 만료")
    expect(editorUploadErrorMessage(err(403))).toContain("권한")
    expect(editorUploadErrorMessage(new FastapiError("network", 0, null))).toContain("네트워크")
    expect(editorUploadErrorMessage(new Error("x"))).toContain("올리지 못했습니다")
  })
})

describe("parseErrorBody", () => {
  it("문자열 detail·code 를 뽑고, 배열 detail 은 validation 으로", () => {
    expect(parseErrorBody({ detail: "없음", code: "not_found" })).toEqual({ detail: "없음", code: "not_found", validation: null })
    expect(parseErrorBody({ detail: [{ msg: "Value error, 잘못됨" }] })).toEqual({ detail: null, code: null, validation: "잘못됨" })
    expect(parseErrorBody(null)).toEqual({ detail: null, code: null, validation: null })
    expect(parseErrorBody("<html>")).toEqual({ detail: null, code: null, validation: null })
  })
})
