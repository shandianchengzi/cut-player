#!/usr/bin/env python3
"""Fetch real article screenshots from a published CSDN post for GitHub documentation.

Only images embedded by the article and served by the CSDN blog-image CDN are
accepted. This deliberately avoids page banners, avatars, and third-party ads.
"""
from __future__ import annotations
import html
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
ARTICLE = "https://shandianchengzi.blog.csdn.net/article/details/167817483"
ARTICLE_ALTERNATIVE = "https://blog.csdn.net/shandianchengzi/article/details/167817483"
IMAGES = ROOT / "docs" / "images"
BLOG = ROOT / "docs" / "CUT_PLAYER_BLOG.md"
PREFIX = "https://raw.githubusercontent.com/shandianchengzi/cut-player/main/docs/images/"
IMAGE_HOSTS = {"i-blog.csdnimg.cn", "img-blog.csdnimg.cn", "img-blog.csdn.net"}
START = "<!-- cutplayer-screenshots:start -->"
END = "<!-- cutplayer-screenshots:end -->"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": ARTICLE,
}

class ArticleImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.urls = []
        self.article_found = False
        self.in_article = False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in {"div", "article", "section"}:
            if self.in_article:
                self.depth += 1
            elif attrs.get("id") in {"content_views", "article_content"}:
                self.in_article = True
                self.article_found = True
                self.depth = 1
        if tag == "img" and self.in_article:
            for k in ("data-src", "data-original", "data-actualsrc", "src"):
                if attrs.get(k):
                    self.urls.append(attrs[k])

    def handle_endtag(self, tag):
        if tag in {"div", "article", "section"} and self.in_article:
            self.depth -= 1
            if self.depth == 0:
                self.in_article = False

def read(url, headers=HEADERS):
    req = Request(url, headers=headers)
    with urlopen(req, timeout=35) as response:
        return response.read(), response.headers.get("Content-Type", "")

def collect_urls(page):
    parser = ArticleImages()
    parser.feed(page)
    urls = parser.urls
    if not urls and parser.article_found:
        # Some CSDN versions render images within pre-rendered markdown strings.
        match = re.search(r'id=["\']content_views["\']', page)
        if match:
            chunk = page[match.end():match.end()+250000]
            urls += re.findall(r'https?://(?:i-blog|img-blog)\.csdnimg\.cn/[^"\'\s<>\\]+', chunk)
    result, seen = [], set()
    for value in urls:
        value = html.unescape(value).replace("\\/", "/").strip()
        if value.startswith("//"):
            value = "https:" + value
        if urlparse(value).hostname not in IMAGE_HOSTS:
            continue
        if value not in seen:
            result.append(value)
            seen.add(value)
    return result

def extension(content, kind):
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return ".webp"
    if content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        return ".gif"
    return None

def update_markdown(paths, origin):
    if not paths:
        raise ValueError("No valid screenshots")
    body = BLOG.read_text(encoding="utf-8")
    if START in body:
        body = re.sub(re.escape(START)+r".*?"+re.escape(END)+r"\n*", "", body, flags=re.S)
    lines = [
        START,
        "",
        "## 软件实际运行界面",
        "",
        ("下面是 CSDN 发布文章中的 Cut Player 实际截图。" if origin == "csdn"
         else "下面是 Cut Player 在 Windows 桌面自动化测试中生成的实际应用截图；使用的是测试素材。"),
        "",
    ]
    for i, path in enumerate(paths, start=1):
        lines.append(f"![Cut Player 运行界面截图 {i}]({PREFIX}{path.name})")
        lines.append("")
    lines.append(END)
    block = "\n".join(lines) + "\n\n"
    anchor = "- **源代码与问题反馈：**[GitHub 仓库](https://github.com/shandianchengzi/cut-player)\n"
    if anchor not in body:
        raise ValueError("Missing blog insertion anchor")
    body = body.replace(anchor, anchor+"\n"+block, 1)
    BLOG.write_text(body, encoding="utf-8")

def main():
    output = []
    for link in (ARTICLE, ARTICLE_ALTERNATIVE):
        try:
            contents, mime = read(link)
            page = contents.decode("utf-8", "replace")
            urls = collect_urls(page)
            print(f"Fetched {len(contents)} bytes from {link}, {len(urls)} eligible article images.")
            for url in urls[:8]:
                if len(output) >= 4:
                    break
                try:
                    data, kind = read(url, {**HEADERS, "Accept":"image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"})
                    ext = extension(data, kind)
                    if not ext or len(data) < 4000:
                        print(f"Skipping nonimage or tiny response: {url}")
                        continue
                    IMAGES.mkdir(parents=True, exist_ok=True)
                    target = IMAGES / f"cut-player-csdn-{len(output)+1:02d}{ext}"
                    target.write_bytes(data)
                    output.append(target)
                    print(f"Saved {target.relative_to(ROOT)} ({len(data)} bytes)")
                except Exception as exc:
                    print(f"Image retrieval failed: {url} ({exc})")
            if output:
                break
        except Exception as exc:
            print(f"Article retrieval failed: {link} ({exc})")
    if not output:
        print("No published CSDN images could be retrieved; CI artifact fallback required.")
        return 2
    update_markdown(output, "csdn")
    return 0

if __name__ == "__main__":
    sys.exit(main())
