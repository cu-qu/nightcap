from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from core.permissions import HasActiveMembership
from rest_framework.response import Response

from .models import CategoryGroup, TrackingCategory
from .serializers import (
    CategoryGroupDetailSerializer,
    CategoryGroupSerializer,
    RitualCategoryGroupSerializer,
    TrackingCategorySerializer,
)


@extend_schema_view(
    list=extend_schema(tags=["Categories"], summary="List tracking categories"),
    create=extend_schema(tags=["Categories"], summary="Create tracking category"),
    retrieve=extend_schema(tags=["Categories"], summary="Get tracking category"),
    update=extend_schema(tags=["Categories"], summary="Update tracking category"),
    partial_update=extend_schema(
        tags=["Categories"],
        summary="Update tracking category",
        description=(
            "Patch category fields. To remove a category from a group without deleting it, "
            "send `{\"group\": null}`."
        ),
    ),
    destroy=extend_schema(
        tags=["Categories"],
        summary="Delete tracking category (disabled)",
        description="Categories cannot be deleted. Remove them from a group with PATCH group=null.",
    ),
)
class TrackingCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = TrackingCategorySerializer
    permission_classes = [IsAuthenticated, HasActiveMembership]
    queryset = TrackingCategory.objects.none()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "type"]
    ordering_fields = ["name", "type", "sort_order", "created_at", "updated_at"]
    ordering = ["group__sort_order", "sort_order", "name"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TrackingCategory.objects.none()
        qs = TrackingCategory.objects.filter(user=self.request.user).select_related("group")
        group = self.request.query_params.get("group")
        group_key = self.request.query_params.get("group_key")
        ungrouped = self.request.query_params.get("ungrouped")
        if group:
            qs = qs.filter(group_id=group)
        if group_key:
            qs = qs.filter(group__key=group_key)
        if ungrouped is not None and str(ungrouped).lower() in ("1", "true", "yes"):
            qs = qs.filter(group__isnull=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Categories cannot be deleted. Remove them from a group instead "
                    "with PATCH {\"group\": null}."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @extend_schema(
        tags=["Categories"],
        summary="Remove category from its group",
        description="Sets group to null. The category is kept and can be reassigned later.",
        request=None,
        responses={200: TrackingCategorySerializer},
    )
    @action(detail=True, methods=["post"], url_path="remove-from-group")
    def remove_from_group(self, request, pk=None):
        category = self.get_object()
        category.group = None
        category.save(update_fields=["group", "updated_at"])
        return Response(
            TrackingCategorySerializer(category, context={"request": request}).data
        )


@extend_schema_view(
    list=extend_schema(tags=["CategoryGroups"], summary="List category groups"),
    create=extend_schema(tags=["CategoryGroups"], summary="Create category group"),
    retrieve=extend_schema(tags=["CategoryGroups"], summary="Get category group"),
    update=extend_schema(tags=["CategoryGroups"], summary="Update category group"),
    partial_update=extend_schema(tags=["CategoryGroups"], summary="Partially update category group"),
    destroy=extend_schema(tags=["CategoryGroups"], summary="Delete category group"),
)
class CategoryGroupViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasActiveMembership]
    queryset = CategoryGroup.objects.none()
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["sort_order", "name", "created_at"]
    ordering = ["sort_order", "name"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CategoryGroupDetailSerializer
        if self.action == "for_ritual":
            return RitualCategoryGroupSerializer
        return CategoryGroupSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return CategoryGroup.objects.none()
        return CategoryGroup.objects.filter(user=self.request.user).prefetch_related(
            "categories"
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, is_default=False)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_default:
            return Response(
                {"detail": "Default groups cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Detach categories before deleting the group (do not delete categories).
        instance.categories.update(group=None)
        return super().destroy(request, *args, **kwargs)

    @extend_schema(
        tags=["CategoryGroups"],
        summary="Ritual layout (groups + categories)",
        description=(
            "Returns ordered category groups with `show_in_ritual=true` and their "
            "categories — the layout the mobile NightCap screens should render."
        ),
        responses={200: RitualCategoryGroupSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="for-ritual")
    def for_ritual(self, request):
        qs = (
            self.get_queryset()
            .filter(show_in_ritual=True)
            .order_by("sort_order", "name")
        )
        serializer = RitualCategoryGroupSerializer(
            qs, many=True, context={"request": request}
        )
        return Response(serializer.data)
