import Link from "next/link"
import { ui } from "@/components/ui/styles"

// 홈 히어로 (디자인 A 목업) — 게시 중인 배너가 없을 때 보여 주는 기본 첫 화면.
// [대괄호] 문구는 자리표시다. 프로젝트에 맞게 바꾼다.
export default function HomeHero() {
  return (
    <section aria-labelledby="home-hero-title" className="bg-primary text-on-primary">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-[72px]">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold tracking-wider text-inverse-primary">[서비스 한 줄 소개]</p>
          <h1 id="home-hero-title" className="text-3xl leading-tight font-bold tracking-tight md:text-[44px] md:leading-[54px]">
            [핵심 메시지 헤드라인]
            <br />
            두 줄까지 들어갑니다
          </h1>
          <p className="text-lg leading-7 text-primary-fixed">
            [서비스 설명 문장 — 로그인 없이도 보이는 공개 첫 화면입니다.]
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/notices"
              className={`inline-flex min-h-11 items-center rounded-lg bg-surface-container-lowest px-5 text-[15px] font-semibold text-primary hover:bg-primary-fixed ${ui.focusRing} focus-visible:ring-on-primary focus-visible:ring-offset-primary`}
            >
              시작하기
            </Link>
            <Link
              href="/#services"
              className={`inline-flex min-h-11 items-center rounded-lg border border-inverse-primary px-5 text-[15px] font-semibold text-on-primary hover:bg-primary-container ${ui.focusRing} focus-visible:ring-on-primary focus-visible:ring-offset-primary`}
            >
              자세히 보기
            </Link>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="flex h-56 items-center justify-center rounded-2xl bg-primary-container text-[15px] text-on-primary-container md:h-[300px]"
        >
          [대표 이미지 / 일러스트 자리]
        </div>
      </div>
    </section>
  )
}
