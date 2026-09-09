import django_filters

from .models import Entry


class EntryFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    category_type = django_filters.CharFilter(field_name="category__type")

    class Meta:
        model = Entry
        fields = ["date", "category", "start_date", "end_date", "category_type"]
