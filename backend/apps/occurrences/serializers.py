from rest_framework import serializers

from apps.treatments.models import Treatment, TreatmentOption

from .models import Occurrence, Queue


def mask_phone(phone: str) -> str:
    if not phone:
        return ""
    return phone[:2] + "*" * max(len(phone) - 4, 0) + phone[-2:]


class TreatmentSerializer(serializers.ModelSerializer):
    reversal_label = serializers.CharField(source="reversal.label", read_only=True)
    justification_label = serializers.CharField(source="justification.label", read_only=True)

    class Meta:
        model = Treatment
        fields = ["reversal", "reversal_label", "justification", "justification_label",
                  "justification_text", "treated_by", "updated_at"]


class OccurrenceSerializer(serializers.ModelSerializer):
    queue = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    recurrence_days = serializers.IntegerField(read_only=True)
    contact_count = serializers.IntegerField(read_only=True)
    last_contact_at = serializers.DateTimeField(read_only=True, allow_null=True)
    last_contact_by = serializers.CharField(read_only=True, allow_null=True)
    treatment = TreatmentSerializer(read_only=True)
    driver_phone = serializers.SerializerMethodField()
    can_treat = serializers.SerializerMethodField()

    class Meta:
        model = Occurrence
        exclude = ["ingested_at"]

    def _scope(self):
        return self.context["scope"]

    def get_can_treat(self, obj):
        return self._scope().can_treat(obj.station_code, obj.regional)

    def get_driver_phone(self, obj):
        if self._scope().can_see_phone(obj.station_code, obj.regional):
            return obj.driver_phone
        return mask_phone(obj.driver_phone)


class TreatmentOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TreatmentOption
        fields = ["id", "label", "requires_text"]


class QueueSerializer(serializers.ModelSerializer):
    reversal_options = serializers.SerializerMethodField()
    justification_options = serializers.SerializerMethodField()

    class Meta:
        model = Queue
        fields = ["slug", "name", "reversal_options", "justification_options"]

    def _opts(self, obj, kind):
        qs = [o for o in obj.options.all() if o.kind == kind and o.is_active]
        return TreatmentOptionSerializer(qs, many=True).data

    def get_reversal_options(self, obj):
        return self._opts(obj, TreatmentOption.Kind.REVERSAL)

    def get_justification_options(self, obj):
        return self._opts(obj, TreatmentOption.Kind.JUSTIFICATION)


class TreatmentWriteSerializer(serializers.Serializer):
    reversal = serializers.PrimaryKeyRelatedField(queryset=TreatmentOption.objects.filter(is_active=True))
    justification = serializers.PrimaryKeyRelatedField(queryset=TreatmentOption.objects.filter(is_active=True))
    justification_text = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        occ = self.context["occurrence"]
        if occ.queue_id is None:
            raise serializers.ValidationError("Ocorrência sem fila: não é tratável.")
        rev, jus = attrs["reversal"], attrs["justification"]
        if rev.queue_id != occ.queue_id or rev.kind != TreatmentOption.Kind.REVERSAL:
            raise serializers.ValidationError({"reversal": "Opção inválida para esta fila."})
        if jus.queue_id != occ.queue_id or jus.kind != TreatmentOption.Kind.JUSTIFICATION:
            raise serializers.ValidationError({"justification": "Opção inválida para esta fila."})
        if jus.requires_text and not attrs["justification_text"].strip():
            raise serializers.ValidationError({"justification_text": "Especifique a justificativa."})
        return attrs

    def save(self, treated_by: str):
        occ = self.context["occurrence"]
        data = self.validated_data
        treatment, _ = Treatment.objects.update_or_create(
            occurrence=occ,
            defaults={
                "reversal": data["reversal"],
                "justification": data["justification"],
                "justification_text": data["justification_text"].strip(),
                "treated_by": treated_by,
            },
        )
        return treatment
