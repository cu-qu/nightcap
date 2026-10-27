from django.core.exceptions import ImproperlyConfigured


def trusted_origins(raw: str, public_domain: str = "") -> list[str]:
    origins = [origin.strip() for origin in (raw or "").split(",") if origin.strip()]
    public = (public_domain or "").strip()
    if public:
        origin = public if "://" in public else f"https://{public}"
        if origin not in origins:
            origins.append(origin)
    return origins


def parse_allowed_hosts(raw: str) -> list[str]:
    hosts = [host.strip() for host in (raw or "").split(",") if host.strip()]
    if not hosts:
        raise ImproperlyConfigured(
            "Set ALLOWED_HOSTS to the public API host before starting this environment."
        )
    return hosts
