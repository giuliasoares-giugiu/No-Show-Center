from django.contrib import admin

from .models import RegionalAccess, StationMember


@admin.register(StationMember)
class StationMemberAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "station_code", "phone", "role", "is_active", "source")
    list_filter = ("station_code", "is_active", "source")
    search_fields = ("name", "email", "station_code")


@admin.register(RegionalAccess)
class RegionalAccessAdmin(admin.ModelAdmin):
    list_display = ("email", "regional")
