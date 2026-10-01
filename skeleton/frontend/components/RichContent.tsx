// 리치 텍스트 보기 컴포넌트 (editor-spec §2-5·§3).
//
// ⛔ html 에는 **서버가 sanitize_html 로 정화해 돌려준 본문만** 넣는다. 에디터 onChange 값이나
//    사용자 입력을 그대로 넣으면 XSS 다 — 정화는 백엔드 서비스 계층의 책임이고 여기서는 하지 않는다.
// 본문 스타일(목록 점·번호·정렬·미디어 반응형)은 전역 CSS 의 `.rich-text` 가 담당한다(index.css).

interface Props {
  /** 서버가 정화한 HTML. */
  html: string
  className?: string
}

export default function RichContent({ html, className = "" }: Props) {
  return <div className={`rich-text ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />
}
