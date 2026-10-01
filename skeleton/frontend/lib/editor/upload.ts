// 에디터 이미지 업로드 계약 (editor-spec §0-7·§4 ⑤·§8).
//
// 에디터(RichTextEditor)는 백엔드를 직접 부르지 않고 `uploadImage` prop 으로 받은 함수만 쓴다.
// 이 템플릿(BFF)에서 그 함수의 실체는 **Server Action**(lib/actions/editor.ts 의 uploadEditorImageAction)이다 —
// 브라우저 → Next 서버(액션) → `POST /api/v1/admin/editor/images`(세션의 access 토큰, multipart `file`).
// 관리자 화면은 FormData 로 감싸 넘긴다: components/admin/NoticeForm.tsx 의 uploadImage.
//
// 이 파일은 타입만 둔다 — 액션 파일("use server")은 async 함수 외의 값을 export 할 수 없고,
// 에디터(클라이언트)는 서버 전용 모듈을 import 할 수 없기 때문이다.

/** 업로드 성공 — 본문 `<img>` 에 넣을 공개 URL 과 서버가 재인코딩한 실제 크기. */
export interface EditorUploadSuccess {
  url: string
  width: number
  height: number
}

/** 업로드 실패 — 에디터 하단에 그대로 보여 줄 한국어 문구. */
export interface EditorUploadFailure {
  error: string
}

export type EditorUploadResult = EditorUploadSuccess | EditorUploadFailure

/** 에디터가 받는 업로드 함수 계약 — reject 하지 않고 실패는 `{ error }` 로 돌려준다. */
export type UploadImageFn = (file: Blob, filename: string) => Promise<EditorUploadResult>
