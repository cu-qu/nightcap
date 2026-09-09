from rest_framework.routers import DefaultRouter

from .views import TrackingCategoryViewSet

router = DefaultRouter()
router.register("", TrackingCategoryViewSet, basename="category")

urlpatterns = router.urls
