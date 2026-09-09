"""OpenAPI schema helpers for drf-spectacular."""


def prefer_v1_paths(endpoints):
    """Prefer /api/v1/auth/ over the legacy /api/auth/ aliases in docs."""
    return [
        (path, path_regex, method, callback)
        for path, path_regex, method, callback in endpoints
        if not path.startswith("/api/auth/")
    ]
