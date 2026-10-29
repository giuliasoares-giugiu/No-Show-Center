from django.contrib import admin

from .models import Occurrence, Queue, QueueRule


class QueueRuleInline(admin.TabularInline):
    model = QueueRule
    extra = 0


@admin.register(Queue)
class QueueAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active")
    inlines = [QueueRuleInline]


@admin.register(Occurrence)
class OccurrenceAdmin(admin.ModelAdmin):
    list_display = ("pickup_task_id", "occurrence_date", "seller_performance", "fault_type", "station_code", "queue")
    list_filter = ("queue", "regional", "seller_performance")
    search_fields = ("seller_name", "driver_name", "pickup_task_id", "shop_id")
