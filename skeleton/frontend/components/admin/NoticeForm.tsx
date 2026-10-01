"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { type FormEvent, useActionState, useCallback, useEffect, useId, useRef, useState, useTransition } from "react"
import PageHeader from "@/components/layout/PageHeader"
import Chip from "@/components/ui/Chip"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import { Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { uploadEditorImageAction } from "@/lib/actions/editor"
import { deleteNoticeAction, type NoticeFormState, saveNoticeAction } from "@/lib/actions/notices"
import { isRichTextEmpty } from "@/lib/editor/richText"
import type { UploadImageFn } from "@/lib/editor/upload"
import type { AdminNoticeDetail } from "@/lib/types"
import AttachmentsPanel from "./AttachmentsPanel"
import { useLeaveGuard } from "./useLeaveGuard"

// 공지 작성(/admin/notices/new)·수정(/admin/notices/<id>/edit) 폼 — 클라이언트 컴포넌트.
// - 저장: <form action={formAction}> + useActionState(saveNoticeAction). 에디터 본문은 hidden 필드(body_html)로 함께 간다.
//   처음 저장(POST)하면 액션이 수정 URL(?created=1)로 redirect 해 첨부 패널이 열린다.
// - 에디터는 비제어 컴포넌트라 공지가 바뀌면 key 로 다시 마운트한다(editor-spec §8).
// - 에디터는 **브라우저에서만** 그린다(next/dynamic ssr:false) — contentEditable·Selection·template 파싱 등
//   DOM 이 있어야 동작하는 컴포넌트라 서버 렌더에서는 document 가 없어 깨진다. 덤으로 에디터 코드가
//   별도 청크로 나뉘어 관리자 화면에서만 내려받는다.
// - 에디터 이미지 업로드는 Server Action(uploadEditorImageAction)을 감싼 uploadImage 로 넘긴다.
// - 저장하지 않은 변경이 있으면 새로고침·닫기(beforeunload)와 화면 안 링크 이동을 확인한다(useLeaveGuard).

const TITLE_MAX = 200

const RichTextEditor = dynamic(() => import("@/components/editor/RichTextEditor"), {
  ssr: false,
  loading: () => (
    <div role="status" className="flex min-h-64 items-center justify-center rounded border border-outline-variant text-sm text-on-surface-variant">
      편집기를 불러오는 중…
    </div>
  ),
})

// ⛔ "use server" 파일은 상수를 export 할 수 없어 폼 초기 상태를 여기 둔다.
const INITIAL_STATE: NoticeFormState = { error: null, message: null }

interface Values {
  title: string
  body: string
  pinned: boolean
  published: boolean
}

type Flash = { tone: "success" | "error"; text: string } | null

function valuesOf(notice: AdminNoticeDetail | null): Values {
  return {
    title: notice?.title ?? "",
    body: notice?.body_html ?? "",
    pinned: notice?.is_pinned ?? false,
    published: notice?.is_published ?? false,
  }
}

function sameValues(a: Values, b: Values): boolean {
  return a.title === b.title && a.body === b.body && a.pinned === b.pinned && a.published === b.published
}

/** 에디터 → Server Action 업로드. 계약대로 reject 하지 않는다(액션 자체가 실패해도 문구로). */
const uploadImage: UploadImageFn = async (file, filename) => {
  const form = new FormData()
  form.append("file", file, filename)
  try {
    return await uploadEditorImageAction(form)
  } catch {
    return { error: "이미지를 올리지 못했습니다. 5MB 이하인지, 연결 상태를 확인해 주세요." }
  }
}

export default function NoticeForm({ notice, created = false }: { notice: AdminNoticeDetail | null; created?: boolean }) {
  const [state, formAction, saving] = useActionState(saveNoticeAction, INITIAL_STATE)
  const [deleting, startDelete] = useTransition()
  const [values, setValues] = useState<Values>(() => valuesOf(notice))
  const [baseline, setBaseline] = useState<Values>(() => valuesOf(notice))
  // 제출한 순간의 값 — 저장 성공 응답이 오면 이것이 새 기준선이 된다.
  const [submitted, setSubmitted] = useState<Values | null>(null)
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({})
  const [flash, setFlash] = useState<Flash>(() =>
    created ? { tone: "success", text: "공지를 저장했습니다. 이제 첨부 파일을 올릴 수 있습니다." } : null,
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const ids = { title: useId(), titleErr: useId(), body: useId(), bodyErr: useId(), pubHelp: useId() }

  // 액션 결과가 바뀌면(렌더 중 비교 — effect 안 setState 대신) 알림과 기준선을 갱신한다.
  const [seenState, setSeenState] = useState(state)
  if (state !== seenState) {
    setSeenState(state)
    if (state.error) setFlash({ tone: "error", text: state.error })
    else if (state.message) {
      setFlash({ tone: "success", text: state.message })
      if (submitted) {
        setBaseline(submitted)
        setValues(submitted)
      }
    }
  }

  const dirty = !sameValues(values, baseline)
  const leave = useLeaveGuard(dirty)

  // 처음 저장 직후의 ?created=1 은 한 번 보여 줬으면 주소에서 지운다(새로고침해도 다시 뜨지 않게).
  // Next 의 라우터는 history.replaceState 를 그대로 받아들인다(서버 왕복 없음).
  useEffect(() => {
    if (created) window.history.replaceState(null, "", window.location.pathname)
  }, [created])

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }))
  const onBodyChange = useCallback((html: string) => setValues((v) => ({ ...v, body: html })), [])

  /** 제출 전 화면 검증 — 실패하면 액션을 부르지 않는다(preventDefault). */
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    setFlash(null)
    const next: typeof errors = {}
    const title = values.title.trim()
    if (!title) next.title = "제목을 입력하세요."
    else if (title.length > TITLE_MAX) next.title = `제목은 ${TITLE_MAX}자 이하로 입력하세요.`
    if (isRichTextEmpty(values.body)) next.body = "본문을 입력하세요."
    setErrors(next)
    if (next.title || next.body) {
      e.preventDefault()
      if (next.title) titleRef.current?.focus()
      else document.getElementById(ids.body)?.parentElement?.querySelector<HTMLElement>("[contenteditable]")?.focus()
      return
    }
    setSubmitted({ ...values, title })
  }

  const onDelete = () => {
    if (!notice) return
    startDelete(async () => {
      // 성공하면 액션이 목록으로 redirect 한다 — 돌아오는 값은 실패뿐이다.
      const result = await deleteNoticeAction(notice.id)
      if (!result.ok) {
        setConfirmDelete(false)
        setFlash({ tone: "error", text: result.error })
      }
    })
  }

  return (
    <>
      <PageHeader
        title={notice ? "공지 수정" : "새 공지"}
        description={
          notice ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {notice.is_published ? <Chip tone="success">게시</Chip> : <Chip>임시저장</Chip>}#{notice.id} · 작성자{" "}
              {notice.author_username ?? "-"} · 조회 {notice.view_count}
            </span>
          ) : (
            "제목과 본문을 쓰고 저장하세요. 첨부 파일은 처음 저장한 뒤 올릴 수 있습니다."
          )
        }
        actions={
          <>
            <Link href="/admin/notices" className={ui.btnNeutral}>
              목록으로
            </Link>
            {notice?.is_published && (
              <Link href={`/notices/${notice.id}`} prefetch={false} className={ui.btnNeutral}>
                사용자 화면에서 보기
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {flash && (
          <Notice tone={flash.tone} onClose={() => setFlash(null)}>
            {flash.text}
          </Notice>
        )}

        <form noValidate action={formAction} onSubmit={onSubmit} className={`${ui.card} flex flex-col gap-5 rounded-xl p-5`}>
          {notice && <input type="hidden" name="id" value={notice.id} />}
          <input type="hidden" name="body_html" value={values.body} />

          <div>
            <label htmlFor={ids.title} className={ui.label}>
              제목 <span className="text-error">*</span>
            </label>
            <input
              id={ids.title}
              ref={titleRef}
              name="title"
              value={values.title}
              maxLength={TITLE_MAX}
              onChange={(e) => set("title", e.target.value)}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? ids.titleErr : undefined}
              aria-required="true"
              className={ui.input}
            />
            {errors.title && (
              <p id={ids.titleErr} className={ui.fieldError}>
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <p id={ids.body} className={`${ui.label} mb-1`}>
              본문 <span className="text-error">*</span>
            </p>
            <RichTextEditor
              key={notice?.id ?? "new"}
              initialHtml={notice?.body_html ?? ""}
              onChange={onBodyChange}
              uploadImage={uploadImage}
              labelId={ids.body}
            />
            {errors.body && (
              <p id={ids.bodyErr} className={ui.fieldError} role="alert">
                {errors.body}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className={`${ui.label} mb-1`}>설정</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                name="is_pinned"
                checked={values.pinned}
                onChange={(e) => set("pinned", e.target.checked)}
                className="size-5 accent-primary"
              />
              상단 고정
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                name="is_published"
                checked={values.published}
                onChange={(e) => set("published", e.target.checked)}
                aria-describedby={ids.pubHelp}
                className="size-5 accent-primary"
              />
              게시
            </label>
            <p id={ids.pubHelp} className={`${ui.help} mt-0`}>
              게시하면 사용자 화면에 보입니다. 끄면 임시저장으로 관리자만 볼 수 있습니다.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 border-t border-surface-container pt-5">
            <button type="submit" className={ui.btnPrimary} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
            {dirty && <span className="text-sm text-on-surface-variant">저장하지 않은 변경 사항이 있습니다.</span>}
            {notice && (
              <button type="button" className={`${ui.btnDanger} ml-auto`} onClick={() => setConfirmDelete(true)}>
                삭제
              </button>
            )}
          </div>
        </form>

        {notice ? (
          <AttachmentsPanel noticeId={notice.id} attachments={notice.attachments} />
        ) : (
          <p className={`${ui.card} rounded-xl p-5 text-sm text-on-surface-variant`}>첨부 파일은 공지를 처음 저장한 뒤 올릴 수 있습니다.</p>
        )}
      </div>

      {confirmDelete && notice && (
        <ConfirmDialog
          title="공지를 삭제할까요?"
          confirmLabel="삭제"
          danger
          pending={deleting}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        >
          “{notice.title}” 과 첨부 파일 {notice.attachments.length}개가 삭제되며 되돌릴 수 없습니다.
        </ConfirmDialog>
      )}

      {leave.pendingHref && (
        <ConfirmDialog
          title="저장하지 않고 나갈까요?"
          confirmLabel="나가기"
          cancelLabel="계속 작성"
          danger
          onConfirm={leave.proceed}
          onCancel={leave.cancel}
        >
          저장하지 않은 변경 사항이 사라집니다.
        </ConfirmDialog>
      )}
    </>
  )
}
