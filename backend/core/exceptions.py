import logging

from rest_framework.views import exception_handler


logger = logging.getLogger("django.request")


def log_and_exception_handler(exc, context):
    """
    DRF exception handler wrapper that logs full tracebacks for server errors.
    Auth failures (401) are expected and must not look like crashes.
    """
    response = exception_handler(exc, context)
    status = getattr(response, "status_code", None)
    if status is None or status >= 500:
        request = context.get("request")
        path = getattr(request, "path", None)
        method = getattr(request, "method", None)
        logger.exception("Unhandled DRF exception", extra={"path": path, "method": method})
    return response

