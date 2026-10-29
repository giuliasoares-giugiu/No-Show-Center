from django.contrib import admin

from .models import ContactAttempt, MessageTemplate, Treatment, TreatmentOption

admin.site.register(MessageTemplate)


@admin.register(TreatmentOption)
class TreatmentOptionAdmin(admin.ModelAdmin):
    list_display = ("label", "queue", "kind", "requires_text", "counts_as_reversed", "is_active", "sort_order")
    list_filter = ("queue", "kind", "is_active")


@admin.register(Treatment)
class TreatmentAdmin(admin.ModelAdmin):
    list_display = ("occurrence", "reversal", "justification", "treated_by", "updated_at")


@admin.register(ContactAttempt)
class ContactAttemptAdmin(admin.ModelAdmin):
    list_display = ("occurrence", "sent_by", "member_name", "sent_at")
