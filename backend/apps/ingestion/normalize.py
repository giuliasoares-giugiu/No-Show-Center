"""Tradução das linhas da API do Data Suite para o contrato do sistema (README, seções 10 e 19).

A API devolve cada linha embrulhada (`{"rowNumber": 4, "values": {...}}`), com os nomes de coluna da tabela
`dwd_spx_fm_no_show_center_di_br` e com o texto "null" no lugar de nulo. Aqui a linha é achatada, os nulos viram
nulos de verdade e os nomes da tabela viram os campos do sistema. É idempotente (linhas já normalizadas passam
intactas) e só usa nomes: nenhum valor é inventado."""

NULL_TEXTS = {"null", "none", "nan", "undefined"}  # "NA" NÃO entra: é um valor válido de `raio`

# coluna da tabela -> campo do sistema (só preenche se o campo do sistema não vier)
ALIASES = {
    "event_date": "occurrence_date",
    "occurrence": "seller_performance",
    "spx_fault": "fault_type",
    "justification": "driver_justification",
    "pickup_driver_id": "driver_id",
    "pickup_driver_phone": "driver_phone",
    "route_display_name": "route_name",
    "pickup_point_name": "seller_name",  # o painel original já exibia este campo como nome do seller
    "dispatcher_email_address": "dispatcher_email",
    "supervisor_email_address": "supervisor_email",
    "regional_pic": "regional_manager",  # vem o NOME do gerente, não o e-mail
}

# Instante do evento: a tabela não tem uma coluna "momento do no-show". Mesma prioridade da query original
# (conclusão, depois desativação, depois início da coleta). CONFIRMAR com o time do DS.
OCCURRENCE_TIME_COLUMNS = ("done_datestamp", "disabled_datestamp", "pickup_start_datestamp")

# Colunas da tabela que o sistema conhece mas não usa (não são "desconhecidas" no relatório do check_source).
KNOWN_UNUSED = {
    "id", "rowNumber", "task_status", "driver_vehicle_type_name", "pickup_start_datestamp", "done_datestamp",
    "disabled_datestamp", "pickup_station_name", "fm_schedule_id", "open_hour_decimal", "close_hour_decimal",
    "horario_comercial", "atualizacao_timestamp", "grass_date", "grass_month",
}


def is_null_text(value) -> bool:
    return isinstance(value, str) and value.strip().lower() in NULL_TEXTS


def hhmm_from_decimal(value):
    """18 -> "18:00"; 18.5 -> "18:30"; 24 -> "24:00". Valor inválido -> None."""
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if not 0 <= number <= 24:
        return None
    minutes = round(number * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def flatten_row(raw) -> dict:
    """Tira o embrulho `{"rowNumber", "values"}` e troca o texto "null" por nulo."""
    row = dict(raw["values"]) if isinstance(raw, dict) and isinstance(raw.get("values"), dict) else dict(raw)
    return {key: (None if is_null_text(value) else value) for key, value in row.items()}


def normalize_row(raw) -> dict:
    row = flatten_row(raw)
    for source, target in ALIASES.items():
        if source in row and (target not in row or row[target] in (None, "")):
            row[target] = row[source]
    if row.get("occurred_at") in (None, ""):
        row["occurred_at"] = next((row[c] for c in OCCURRENCE_TIME_COLUMNS if row.get(c) not in (None, "")), None)
    for hour, decimal in (("open_hour", "open_hour_decimal"), ("close_hour", "close_hour_decimal")):
        if row.get(hour) in (None, "") and row.get(decimal) not in (None, ""):
            row[hour] = hhmm_from_decimal(row[decimal])
    return row
