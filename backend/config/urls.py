from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.views import HealthCheckView


def root(request):
    return JsonResponse(
        {
            "message": "NightCap API",
            "docs": "/api/docs/",
            "schema": "/api/schema/",
            "health": "/api/health/",
            "api_v1": "/api/v1/",
        }
    )


urlpatterns = [
    path("", root),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/categories/", include("categories.urls")),
    path("api/v1/category-groups/", include("categories.group_urls")),
    path("api/v1/", include("goals.urls")),
    path("api/v1/", include("entries.urls")),
    path("api/health/", HealthCheckView.as_view(), name="health-check"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
