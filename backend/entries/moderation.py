"""Reject text before it is stored, so a partner never sees it."""

from __future__ import annotations

import re

from rest_framework import serializers

_REJECTED = (
    "That can't be saved. Take out attacks or sexual content, then try again."
)

# Whole phrases only, after letters are folded together. Substrings of ordinary
# words (grape, class) must not match.
_PHRASES = (
    "kill yourself",
    "kys",
    "rape",
    "rapist",
    "child porn",
    "child sex",
    "underage sex",
    "loli",
    "lolita",
)


def _folded(value: str) -> str:
    lowered = value.lower()
    lowered = lowered.translate(
        str.maketrans({"@": "a", "0": "o", "1": "i", "3": "e", "$": "s", "5": "s"})
    )
    cleaned = re.sub(r"[^a-z]+", " ", lowered).strip()
    return f" {cleaned} "


def text_is_objectionable(value: str | None) -> bool:
    if not value or not str(value).strip():
        return False
    folded = _folded(str(value))
    return any(f" {phrase} " in folded for phrase in _PHRASES)


def require_clean_text(value: str | None, *, field: str = "detail") -> None:
    if text_is_objectionable(value):
        raise serializers.ValidationError({field: _REJECTED})
