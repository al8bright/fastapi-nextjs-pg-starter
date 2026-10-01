"""리치 텍스트 HTML 서버 정화 (nh3).

에디터가 만든 본문 HTML 은 클라이언트를 믿지 않고 저장 직전에 서비스 계층에서 여기를 거친다.
⚠️ 프론트엔드 에디터와 이 허용 목록은 한 쌍이다 — 에디터에 서식·미디어를 추가하면
허용 목록과 tests/test_sanitize.py 를 같은 변경에서 고친다(허용 목록을 넓힐 땐 테스트를 먼저).

- 서식은 태그와 정해진 class 값으로만 표현한다. style 속성은 허용하지 않는다(nh3 는 CSS 값을 검사하지 않는다).
- iframe 은 유튜브 임베드(youtube-nocookie / www.youtube 의 /embed/<11자 ID>, 쿼리 금지)만 남긴다.
  src 가 걸러진 iframe 은 후처리로 내용째 지운다. 남는 iframe 에는 sandbox 등 보안 속성을 강제한다.
- a 에는 rel="noopener noreferrer" 를 강제한다. URL 스킴은 http·https·mailto·tel(+ 상대 경로)만 허용한다.
"""

import html as html_lib
import re

import nh3

ALLOWED_TAGS: frozenset[str] = frozenset(
    {
        "p", "div", "br", "hr", "span",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "mark", "small",
        "ul", "ol", "li", "blockquote", "pre", "code",
        "a", "img",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
        "iframe",
    }
)  # fmt: skip

ALLOWED_ATTRIBUTES: dict[str, set[str]] = {
    "*": {"class"},
    "a": {"href", "target", "title"},
    "img": {"src", "alt", "width", "height", "title"},
    "iframe": {"src", "width", "height", "title", "allowfullscreen"},
    "div": {"data-youtube-video"},
    "td": {"colspan", "rowspan", "scope"},
    "th": {"colspan", "rowspan", "scope"},
    "ol": {"start"},
    "col": {"span"},
}

# class 속성에 남길 수 있는 값 — 정렬 3종과 영상 래퍼. 그 외 값(예: 외부 에디터의 ql-*)은 버리고,
# 남는 값이 없으면 속성 자체를 지운다.
ALLOWED_CLASSES: frozenset[str] = frozenset({"align-left", "align-center", "align-right", "video"})

ALLOWED_URL_SCHEMES: frozenset[str] = frozenset({"http", "https", "mailto", "tel"})

# 내용째 제거하는 태그 (텍스트도 남기지 않는다).
CLEAN_CONTENT_TAGS: frozenset[str] = frozenset({"script", "style"})

# 남는 iframe 에 강제로 붙이는 속성 — 클라이언트가 보낸 값은 무시하고 항상 이 값이다.
IFRAME_FORCED_ATTRIBUTES: dict[str, str] = {
    "sandbox": "allow-scripts allow-same-origin allow-popups allow-presentation",
    "loading": "lazy",
    "referrerpolicy": "strict-origin-when-cross-origin",
}

YOUTUBE_EMBED_RE = re.compile(r"^https://www\.youtube(?:-nocookie)?\.com/embed/[A-Za-z0-9_-]{11}$")
DIMENSION_RE = re.compile(r"^\d{1,4}$")
# src 가 걸러진(=허용되지 않은 출처의) iframe 을 내용째 지운다.
SRCLESS_IFRAME_RE = re.compile(r"<iframe(?![^>]*\ssrc=)[^>]*>.*?</iframe>", re.IGNORECASE | re.DOTALL)
# 정화 결과에 src 가 남은 img·iframe 이 있으면 글자가 없어도 빈 본문이 아니다.
MEDIA_TAG_RE = re.compile(r"<(?:img|iframe)\b[^>]*\ssrc=", re.IGNORECASE)


def _attribute_filter(tag: str, attr: str, value: str) -> str | None:
    """속성 값 검사. None 을 돌려주면 그 속성을 지운다."""
    if attr == "class":
        kept = [c for c in value.split() if c in ALLOWED_CLASSES]
        return " ".join(dict.fromkeys(kept)) or None
    if attr in ("width", "height"):
        return value if DIMENSION_RE.fullmatch(value) else None
    if tag == "iframe" and attr == "src":
        return value if YOUTUBE_EMBED_RE.fullmatch(value) else None
    return value


def sanitize_html(html: str | None) -> str:
    """본문 HTML 을 허용 목록으로 정화한다. None·빈 문자열은 빈 문자열."""
    if not html:
        return ""
    cleaned = nh3.clean(
        html,
        tags=set(ALLOWED_TAGS),
        clean_content_tags=set(CLEAN_CONTENT_TAGS),
        attributes={tag: set(attrs) for tag, attrs in ALLOWED_ATTRIBUTES.items()},
        attribute_filter=_attribute_filter,
        strip_comments=True,
        link_rel="noopener noreferrer",
        url_schemes=set(ALLOWED_URL_SCHEMES),
        set_tag_attribute_values={"iframe": dict(IFRAME_FORCED_ATTRIBUTES)},
    )
    return SRCLESS_IFRAME_RE.sub("", cleaned)


def is_html_empty(html: str | None) -> bool:
    """정화된 HTML 에 글자·이미지·영상이 하나도 없으면 True (빈 본문 저장 거부용)."""
    if not html:
        return True
    if MEDIA_TAG_RE.search(html):
        return False
    text = html_lib.unescape(nh3.clean(html, tags=set()))
    return not text.replace("\xa0", " ").strip()
