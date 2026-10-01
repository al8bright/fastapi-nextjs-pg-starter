"use client"

import Link from "next/link"
import { type ChangeEvent, type FormEvent, useActionState, useId, useState, useTransition } from "react"
import PageHeader from "@/components/layout/PageHeader"
import { Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { type BannerFormState, saveBannerAction, uploadBannerImageAction } from "@/lib/actions/banners"
import { type BannerErrors, type BannerValues, bannerValuesOf, validateBanner } from "@/lib/bannerForm"
import { editorImageProblem } from "@/lib/editor/richText"
import { LINK_URL_MAX_LENGTH } from "@/lib/linkUrl"
import type { BannerAdmin } from "@/lib/types"
import { MAX_IMAGE_MB } from "@/lib/uploadRules"

// 배너 작성(/admin/banners/new)·수정(/admin/banners/<id>/edit) 폼.
// 이미지를 먼저 올려(uploadBannerImageAction → POST /admin/banners/image) key 를 받고, 저장 때 image_key 로 참조한다.
// 노출 기간은 KST 기준 datetime-local 값(초 없이)이며 서버 액션이 KST naive 문자열로 바꿔 보낸다.
// 저장(saveBannerAction)은 useActionState — 성공하면 액션이 목록으로 redirect 한다.

// ⛔ "use server" 파일(lib/actions/banners.ts)은 상수를 export 할 수 없어 초기 상태를 여기 둔다.
const INITIAL_STATE: BannerFormState = { error: null }

export default function BannerForm({ banner }: { banner: BannerAdmin | null }) {
  const [state, formAction, saving] = useActionState(saveBannerAction, INITIAL_STATE)
  const [uploading, startUpload] = useTransition()
  const [values, setValues] = useState<BannerValues>(() => bannerValuesOf(banner))
  const [errors, setErrors] = useState<BannerErrors>({})
  const id = {
    image: useId(),
    imageErr: useId(),
    title: useId(),
    titleErr: useId(),
    alt: useId(),
    altErr: useId(),
    altHelp: useId(),
    link: useId(),
    linkErr: useId(),
    linkHelp: useId(),
    start: useId(),
    end: useId(),
    periodErr: useId(),
  }

  const set = <K extends keyof BannerValues>(key: K, value: BannerValues[K]) => setValues((v) => ({ ...v, [key]: value }))

  const onImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const problem = editorImageProblem(file)
    if (problem) {
      setErrors((er) => ({ ...er, image: problem }))
      return
    }
    setErrors((er) => ({ ...er, image: undefined }))
    const form = new FormData()
    form.append("file", file, file.name)
    startUpload(async () => {
      const result = await uploadBannerImageAction(form)
      if (result.ok) set("image", result.data)
      else setErrors((er) => ({ ...er, image: result.error }))
    })
  }

  // 제출 전 화면 검증 — 문제가 있으면 액션을 부르지 않고(preventDefault) 첫 오류 칸으로 포커스를 옮긴다.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const next = validateBanner(values)
    setErrors(next)
    const first = (["image", "title", "alt", "link", "period"] as const).find((k) => next[k])
    if (first) {
      e.preventDefault()
      const focusId = { image: id.image, title: id.title, alt: id.alt, link: id.link, period: id.start }[first]
      document.getElementById(focusId)?.focus()
    }
  }

  const describe = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined

  return (
    <>
      <PageHeader
        title={banner ? "배너 수정" : "새 배너"}
        description="권장 이미지 비율 3:1(예: 1440×480). 모바일에서는 16:9 로 가운데가 잘려 보입니다."
        actions={
          <Link href="/admin/banners" className={ui.btnNeutral}>
            목록으로
          </Link>
        }
      />
      <form noValidate action={formAction} onSubmit={onSubmit} className={`${ui.card} flex max-w-3xl flex-col gap-5 rounded-xl p-5`}>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        {banner && <input type="hidden" name="id" value={banner.id} />}
        <input type="hidden" name="image_key" value={values.image?.key ?? ""} />

        <div>
          <label htmlFor={id.image} className={ui.label}>
            배너 이미지 <span className="text-error">*</span>
          </label>
          {values.image && (
            // eslint-disable-next-line @next/next/no-img-element -- 업로드 직후 미리보기(백엔드 /uploads, rewrite).
            <img
              src={values.image.url}
              alt="업로드한 배너 미리보기"
              width={values.image.width}
              height={values.image.height}
              className="mt-2 aspect-[3/1] w-full rounded-lg border border-outline-variant bg-surface object-cover"
            />
          )}
          <input
            id={id.image}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onImage}
            disabled={uploading}
            aria-invalid={errors.image ? true : undefined}
            aria-describedby={describe(errors.image && id.imageErr)}
            className={`mt-2 block w-full rounded text-sm text-on-surface-variant file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-on-primary ${ui.focusRing}`}
          />
          <p className={ui.help}>
            {uploading
              ? "이미지를 올리는 중…"
              : `PNG·JPEG·WebP·GIF, ${MAX_IMAGE_MB}MB 이하. ${values.image ? "다른 파일을 고르면 교체됩니다." : ""}`}
          </p>
          {errors.image && (
            <p id={id.imageErr} className={ui.fieldError}>
              {errors.image}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={id.title} className={ui.label}>
            제목 <span className="text-error">*</span>
          </label>
          <input
            id={id.title}
            name="title"
            value={values.title}
            maxLength={200}
            onChange={(e) => set("title", e.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describe(errors.title && id.titleErr)}
            className={ui.input}
          />
          {errors.title && (
            <p id={id.titleErr} className={ui.fieldError}>
              {errors.title}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={id.alt} className={ui.label}>
            대체 텍스트 <span className="text-error">*</span>
          </label>
          <input
            id={id.alt}
            name="alt_text"
            value={values.alt}
            maxLength={200}
            onChange={(e) => set("alt", e.target.value)}
            aria-invalid={errors.alt ? true : undefined}
            aria-describedby={describe(id.altHelp, errors.alt && id.altErr)}
            className={ui.input}
          />
          <p id={id.altHelp} className={ui.help}>
            화면 낭독기 사용자에게 읽히는 설명입니다. 이미지 속 문구를 그대로 적어 주세요.
          </p>
          {errors.alt && (
            <p id={id.altErr} className={ui.fieldError}>
              {errors.alt}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={id.link} className={ui.label}>
            링크 URL
          </label>
          <input
            id={id.link}
            name="link_url"
            value={values.link}
            maxLength={LINK_URL_MAX_LENGTH}
            inputMode="url"
            placeholder="/notices/1 또는 https://example.com"
            onChange={(e) => set("link", e.target.value)}
            aria-invalid={errors.link ? true : undefined}
            aria-describedby={describe(id.linkHelp, errors.link && id.linkErr)}
            className={ui.input}
          />
          <p id={id.linkHelp} className={ui.help}>
            비우면 클릭할 수 없는 배너가 됩니다. / 로 시작하면 사이트 안에서, http(s) 주소는 새 창으로 엽니다.
          </p>
          {errors.link && (
            <p id={id.linkErr} className={ui.fieldError}>
              {errors.link}
            </p>
          )}
        </div>

        <fieldset>
          <legend className={ui.label}>노출 기간 (한국 시각)</legend>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={id.start} className="text-sm text-on-surface-variant">
                시작
              </label>
              <input
                id={id.start}
                name="starts_at"
                type="datetime-local"
                value={values.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                aria-invalid={errors.period ? true : undefined}
                aria-describedby={describe(errors.period && id.periodErr)}
                className={ui.input}
              />
            </div>
            <div>
              <label htmlFor={id.end} className="text-sm text-on-surface-variant">
                종료
              </label>
              <input
                id={id.end}
                name="ends_at"
                type="datetime-local"
                value={values.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                aria-invalid={errors.period ? true : undefined}
                aria-describedby={describe(errors.period && id.periodErr)}
                className={ui.input}
              />
            </div>
          </div>
          <p className={ui.help}>비우면 기간 제한 없이 노출합니다.</p>
          {errors.period && (
            <p id={id.periodErr} className={ui.fieldError}>
              {errors.period}
            </p>
          )}
        </fieldset>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            name="is_active"
            checked={values.active}
            onChange={(e) => set("active", e.target.checked)}
            className="size-5 accent-primary"
          />
          활성 (끄면 기간과 관계없이 숨김)
        </label>

        <div className="flex gap-2 border-t border-surface-container pt-5">
          <button type="submit" className={ui.btnPrimary} disabled={saving || uploading}>
            {saving ? "저장 중…" : "저장"}
          </button>
          <Link href="/admin/banners" className={ui.btnNeutral}>
            취소
          </Link>
        </div>
      </form>
    </>
  )
}
