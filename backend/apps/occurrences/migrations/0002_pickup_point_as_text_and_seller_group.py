from django.db import migrations, models


def fill_seller_group(apps, schema_editor):
    """Ocorrências já gravadas: seller_group = prefixo do PUP antes do "_" (os PUPs antigos eram só números)."""
    Occurrence = apps.get_model("occurrences", "Occurrence")
    rows = Occurrence.objects.exclude(pickup_point_id="").values_list("pk", "pickup_point_id")
    for pk, pickup_point_id in rows.iterator():
        Occurrence.objects.filter(pk=pk).update(seller_group=pickup_point_id.split("_", 1)[0].strip())


class Migration(migrations.Migration):

    dependencies = [
        ("occurrences", "0001_initial"),
    ]

    operations = [
        # Texto, não inteiro: "1234_001" não é número. NULL antigo vira "".
        migrations.AlterField(
            model_name="occurrence",
            name="pickup_point_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="occurrence",
            name="seller_group",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
        migrations.RunPython(fill_seller_group, migrations.RunPython.noop),
    ]
