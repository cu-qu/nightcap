from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema


class HealthCheckSerializer(serializers.Serializer):
    status = serializers.CharField()


@extend_schema(
    tags=["Health"],
    summary="Health check",
    description="Lightweight service health check for monitoring.",
    responses={200: HealthCheckSerializer},
)
class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"}, status=status.HTTP_200_OK)

