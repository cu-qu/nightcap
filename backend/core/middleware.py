class ApiTrailingSlashMiddleware:
    """Rewrite /api/... so POST without a trailing slash does not 500.

    CommonMiddleware cannot redirect POST while keeping the body, so a client
    that omits the slash hits RuntimeError. API routes all use a trailing slash.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info
        if path.startswith("/api/") and not path.endswith("/"):
            slashed = path + "/"
            request.path_info = slashed
            if not request.path.endswith("/"):
                request.path = request.path + "/"
        return self.get_response(request)
