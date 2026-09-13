"""Public legal pages served from markdown in backend/legal/."""

from __future__ import annotations

import html
import re
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.http import Http404
from django.shortcuts import render
from django.views import View

LEGAL_DIR = Path(settings.BASE_DIR) / "legal"

PAGES = {
    "privacy": {
        "slug": "privacy",
        "title": "Privacy Policy",
        "filename": "PRIVACY_POLICY.md",
    },
    "terms": {
        "slug": "terms",
        "title": "Terms of Service",
        "filename": "TERMS_OF_SERVICE.md",
    },
    "support": {
        "slug": "support",
        "title": "Support",
        "filename": "SUPPORT.md",
    },
}


def _inline(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', escaped)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)


def markdown_to_html(source: str) -> str:
    blocks: list[str] = []
    for raw in source.replace("\r\n", "\n").split("\n\n"):
        chunk = raw.strip()
        if not chunk:
            continue
        lines = chunk.split("\n")
        if chunk.startswith("# "):
            blocks.append(f"<h1>{_inline(chunk[2:])}</h1>")
        elif chunk.startswith("## "):
            blocks.append(f"<h2>{_inline(chunk[3:])}</h2>")
        elif chunk.startswith("### "):
            blocks.append(f"<h3>{_inline(chunk[4:])}</h3>")
        elif all(line.startswith("- ") for line in lines):
            items = "".join(f"<li>{_inline(line[2:])}</li>" for line in lines)
            blocks.append(f"<ul>{items}</ul>")
        else:
            blocks.append(f"<p>{_inline(' '.join(lines))}</p>")
    return "\n".join(blocks)


@lru_cache(maxsize=8)
def load_page(slug: str) -> dict:
    meta = PAGES.get(slug)
    if meta is None:
        raise KeyError(slug)
    path = LEGAL_DIR / meta["filename"]
    if not path.is_file():
        raise FileNotFoundError(path)
    body = markdown_to_html(path.read_text(encoding="utf-8"))
    return {"title": meta["title"], "slug": slug, "body": body, "pages": PAGES}


class LegalPageView(View):
    slug: str = ""

    def get(self, request, *args, **kwargs):
        try:
            context = load_page(self.slug)
        except (KeyError, FileNotFoundError) as exc:
            raise Http404("Unknown legal page.") from exc
        return render(request, "legal/page.html", context, content_type="text/html")


class PrivacyPolicyView(LegalPageView):
    slug = "privacy"


class TermsOfServiceView(LegalPageView):
    slug = "terms"


class SupportView(LegalPageView):
    slug = "support"
