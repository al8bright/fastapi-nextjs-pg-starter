"use server"

import { editorUploadErrorMessage } from "@/lib/api-error"
import type { EditorUploadResult } from "@/lib/editor/upload"
import { uploadEditorImage } from "@/lib/server/admin"

// 에디터 이미지 업로드 Server Action (editor-spec §0-7·§4 ⑤ — 원 가이드의 Next.js 서버 액션 설계 그대로).
//
//   RichTextEditor(브라우저) → uploadImage(file, name) → 이 액션(Next 서버)
//     → POST /api/v1/admin/editor/images (세션 쿠키의 access 토큰, multipart `file`)
//     → { url, width, height }   ← url 은 /uploads/public/editor/... (next.config.ts rewrite 로 같은 오리진에서 보인다)
//
// 에디터 계약대로 **reject 하지 않는다** — 실패는 `{ error }` 문구로 돌려주고 에디터가 하단에 보여 준다.
// 권한 판정은 백엔드(require_admin)다. 본문 상한은 next.config.ts 의 serverActions.bodySizeLimit.

export async function uploadEditorImageAction(formData: FormData): Promise<EditorUploadResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "이미지 파일을 찾을 수 없습니다. 다시 시도해 주세요." }
  try {
    const image = await uploadEditorImage(file, file.name || "image")
    return { url: image.url, width: image.width, height: image.height }
  } catch (error) {
    return { error: editorUploadErrorMessage(error) }
  }
}
