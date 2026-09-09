from rest_framework.routers import DefaultRouter

from .views import CategoryGroupViewSet

router = DefaultRouter()
router.register("", CategoryGroupViewSet, basename="category-group")

urlpatterns = router.urls
