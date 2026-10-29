from django.db import models


class Queue(models.Model):
    """Fila de tratativa. NSS SPX Fault é a primeira; novas filas = cadastro, não deploy."""

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class QueueRule(models.Model):
    """Roteia uma ocorrência para uma fila. Campos vazios = 'qualquer valor'."""

    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name="rules")
    seller_performance = models.CharField(max_length=50)
    driver_justification = models.CharField(max_length=200, blank=True)
    fault_type = models.CharField(max_length=50, blank=True)
    priority = models.PositiveIntegerField(default=100, help_text="Menor número = avaliada primeiro")

    class Meta:
        ordering = ["priority", "id"]

    def matches(self, item: dict) -> bool:
        if (item.get("seller_performance") or "") != self.seller_performance:
            return False
        if self.driver_justification and (item.get("driver_justification") or "") != self.driver_justification:
            return False
        if self.fault_type and (item.get("fault_type") or "") != self.fault_type:
            return False
        return True

    def __str__(self):
        return f"{self.queue.slug}: {self.seller_performance} / {self.driver_justification or '*'} / {self.fault_type or '*'}"


class Occurrence(models.Model):
    # Texto: na API real é algo como "PT20261021E11PP".
    pickup_task_id = models.CharField(max_length=64, unique=True)
    occurrence_date = models.DateField(db_index=True)
    occurred_at = models.DateTimeField(null=True, blank=True)

    seller_performance = models.CharField(max_length=50, db_index=True)
    driver_justification = models.CharField(max_length=200, blank=True)
    fault_type = models.CharField(max_length=50, blank=True)

    # Texto: sellers vêm numéricos, mas DOP/Locker vêm como "DOP7919".
    shop_id = models.CharField(max_length=64, db_index=True)
    seller_name = models.CharField(max_length=255, blank=True)
    # Texto, não número: os PUPs de um seller vêm como "1234", "1234_001", "1234_002"...
    pickup_point_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    # Seller group = prefixo do PUP antes do "_" ("1234_001" -> "1234"). Derivado na ingestão.
    seller_group = models.CharField(max_length=64, blank=True, default="", db_index=True)

    station_code = models.CharField(max_length=50, db_index=True)
    regional = models.CharField(max_length=50, db_index=True)

    driver_id = models.BigIntegerField(null=True, blank=True)
    driver_name = models.CharField(max_length=255, blank=True)
    driver_phone = models.CharField(max_length=30, blank=True)

    route_name = models.CharField(max_length=255, blank=True)
    trip_id = models.BigIntegerField(null=True, blank=True)
    allocated_by = models.CharField(max_length=255, blank=True)
    # Hierarquia (colunas dispatcher_email_address, supervisor_email_address e regional_pic da tabela do DS).
    # O dispatcher é o responsável pelo motorista (planilha OF TEAM), não necessariamente quem alocou a rota.
    dispatcher_email = models.CharField(max_length=254, blank=True, default="", db_index=True)
    supervisor_email = models.CharField(max_length=254, blank=True, default="", db_index=True)
    regional_manager = models.CharField(max_length=255, blank=True, default="")  # NOME do gerente da regional

    pickup_quantity = models.IntegerField(default=0)
    onhold_order_count = models.IntegerField(default=0)

    raio = models.CharField(max_length=30, blank=True)
    radius_diff = models.FloatField(null=True, blank=True)
    horario_funcionamento = models.CharField(max_length=60, blank=True)
    open_hour = models.CharField(max_length=10, blank=True)
    close_hour = models.CharField(max_length=10, blank=True)

    queue = models.ForeignKey(Queue, null=True, blank=True, on_delete=models.SET_NULL, related_name="occurrences")

    ingested_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-occurrence_date", "-pickup_quantity", "-id"]
        indexes = [models.Index(fields=["queue", "occurrence_date"])]

    def __str__(self):
        return f"#{self.pickup_task_id} {self.seller_performance}"
