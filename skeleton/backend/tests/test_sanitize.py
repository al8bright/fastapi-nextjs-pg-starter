"""본문 HTML 정화 테스트 — 에디터 명세 §7 정화 테스트 표를 그대로 고정한다.

⚠️ 에디터와 정화기는 한 쌍이다. 허용 목록을 넓히려면 이 표에 케이스를 먼저 추가한다(Red).
"""

import pytest

from app.core.sanitize import IFRAME_FORCED_ATTRIBUTES, is_html_empty, sanitize_html

NOCOOKIE = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
WWW = "https://www.youtube.com/embed/dQw4w9WgXcQ"


def _assert_forced_iframe_attrs(out: str) -> None:
    for name, value in IFRAME_FORCED_ATTRIBUTES.items():
        assert f'{name}="{value}"' in out


# ---------------------------------------------------------------------------
# 남아야 하는 것
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("src", [NOCOOKIE, WWW])
def test_youtube_embed_kept_with_forced_attributes(src):
    html = (
        '<div class="video" data-youtube-video>'
        f'<iframe src="{src}" width="640" height="360" title="YouTube 영상" allowfullscreen></iframe>'
        "</div>"
    )
    out = sanitize_html(html)
    assert f'src="{src}"' in out
    assert 'class="video"' in out
    assert "data-youtube-video" in out
    assert 'width="640"' in out and 'height="360"' in out
    assert 'title="YouTube 영상"' in out
    assert "allowfullscreen" in out
    _assert_forced_iframe_attrs(out)


def test_client_sandbox_is_overridden():
    out = sanitize_html(f'<iframe src="{WWW}" sandbox="allow-top-navigation" srcdoc="<b>x</b>"></iframe>')
    assert "allow-top-navigation" not in out
    assert "srcdoc" not in out
    _assert_forced_iframe_attrs(out)


def test_align_class_kept():
    assert sanitize_html('<p class="align-center">가운데</p>') == '<p class="align-center">가운데</p>'


def test_img_dimensions_kept():
    out = sanitize_html('<img src="/uploads/public/editor/a.webp" alt="설명" width="640" height="360">')
    assert out == '<img src="/uploads/public/editor/a.webp" alt="설명" width="640" height="360">'


def test_youtube_wrapper_div_kept():
    assert "data-youtube-video" in sanitize_html("<div data-youtube-video>x</div>")


def test_allowed_formatting_tags_kept():
    html = (
        "<h2>제목</h2><p><strong>굵게</strong><em>기울임</em><u>밑줄</u><s>취소</s><mark>형광</mark></p>"
        '<ul><li>a</li></ul><ol start="3"><li>b</li></ol><blockquote>인용</blockquote><hr>'
        '<table><tbody><tr><th scope="col">h</th><td colspan="2">d</td></tr></tbody></table>'
    )
    assert sanitize_html(html) == html


def test_links_get_forced_rel_and_keep_allowed_schemes():
    out = sanitize_html(
        '<a href="https://example.com" target="_blank" rel="opener">a</a>'
        '<a href="mailto:a@example.com">m</a><a href="tel:010">t</a><a href="/notices/1">r</a>'
    )
    assert out.count('rel="noopener noreferrer"') == 4
    assert 'rel="opener"' not in out
    for href in ("https://example.com", "mailto:a@example.com", "tel:010", "/notices/1"):
        assert f'href="{href}"' in out


# ---------------------------------------------------------------------------
# 지워져야 하는 것
# ---------------------------------------------------------------------------


def test_other_host_iframe_removed_entirely():
    out = sanitize_html('<iframe src="https://evil.example/embed/dQw4w9WgXcQ">대체</iframe><p>본문</p>')
    assert out == "<p>본문</p>"


def test_youtube_iframe_with_query_removed_entirely():
    assert sanitize_html(f'<iframe src="{WWW}?autoplay=1"></iframe>') == ""


def test_youtube_watch_url_iframe_removed():
    assert sanitize_html('<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe>') == ""


def test_srcless_iframe_removed():
    assert sanitize_html("<iframe>x</iframe><p>a</p>") == "<p>a</p>"


def test_unknown_class_attribute_removed():
    assert sanitize_html('<p class="ql-align-center">t</p>') == "<p>t</p>"


def test_mixed_class_keeps_only_allowed_values():
    assert sanitize_html('<p class="ql-align-center align-right">t</p>') == '<p class="align-right">t</p>'


@pytest.mark.parametrize("value", ["100%", "calc(100% - 1px)", "12345", "-1", "1e3"])
def test_non_integer_dimensions_removed(value):
    out = sanitize_html(f'<img src="/a.png" width="{value}" height="{value}">')
    assert out == '<img src="/a.png">'


def test_editor_only_and_style_attributes_removed():
    out = sanitize_html('<p contenteditable="true" data-selected="true" data-uploading style="color:red" id="x">t</p>')
    assert out == "<p>t</p>"


def test_javascript_href_removed():
    out = sanitize_html('<a href="javascript:alert(1)">x</a>')
    assert "javascript" not in out
    assert "href" not in out


def test_data_img_src_removed():
    out = sanitize_html('<img src="data:image/png;base64,iVBORw0KGgo=" alt="a">')
    assert "data:" not in out
    assert "src" not in out


def test_event_handlers_removed():
    out = sanitize_html('<img src="/a.png" onerror="alert(1)"><p onclick="x()">t</p>')
    assert "onerror" not in out and "onclick" not in out


def test_script_and_style_removed_with_content():
    assert sanitize_html("<script>alert(1)</script><style>p{color:red}</style><p>ok</p>") == "<p>ok</p>"


def test_disallowed_tags_unwrapped():
    assert sanitize_html("<section><font>글자</font></section>") == "글자"


@pytest.mark.parametrize("value", [None, ""])
def test_empty_input(value):
    assert sanitize_html(value) == ""


# ---------------------------------------------------------------------------
# 빈 본문 판정
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("html", [None, "", "<p><br></p>", "<p>&nbsp;</p><p> </p>", "<img>"])
def test_is_html_empty_true(html):
    assert is_html_empty(html) is True


@pytest.mark.parametrize(
    "html",
    ["<p>a</p>", '<p><img src="/uploads/public/a.png"></p>', f'<iframe src="{WWW}"></iframe>'],
)
def test_is_html_empty_false(html):
    assert is_html_empty(html) is False
