"""Fixtures para desenvolver sem depender do Data Suite. Dados fictícios."""
import random
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .base import MemberSource, OccurrenceSource


DISPATCHER_EMAILS = {"Ana Dispatcher": "ana@example.com", "Carlos Dispatcher": "carlos@example.com",
                     "Bruno Dispatcher": "bruno@example.com"}


def _dispatcher_email(name: str, station: str) -> str:
    """Quem não é membro cadastrado fica sem e-mail ("Marcos Pinheiro"): cai no vínculo pelo nome."""
    if name == "Marcos Pinheiro":
        return ""
    return DISPATCHER_EMAILS.get(name) or f"dispatcher.{station.lower()}@example.com"


def _occ(task_id, perf, justification, fault, station, regional, shop_id, seller, driver_id, driver, phone,
         allocated_by, pending, hour, days_ago=0):
    day = timezone.localdate() - timedelta(days=days_ago)
    return {
        "pickup_task_id": task_id,
        "occurrence_date": day.isoformat(),
        "occurred_at": f"{day.isoformat()}T{hour}:00",
        "seller_performance": perf,
        "driver_justification": justification,
        "fault_type": fault,
        "shop_id": shop_id,
        # PUPs do seller no formato real: "1234", "1234_001", "1234_002" (o grupo é o prefixo)
        "pickup_point_id": str(shop_id) if task_id % 3 == 0 else f"{shop_id}_{task_id % 3:03d}",
        "seller_name": seller,
        "station_code": station,
        "regional": regional,
        "driver_id": driver_id,
        "driver_name": driver,
        "driver_phone": phone,
        "route_name": f"ROTA-{station}-{driver_id}",
        "trip_id": task_id * 10,
        "allocated_by": allocated_by,
        "dispatcher_email": _dispatcher_email(allocated_by, station),
        "supervisor_email": f"supervisor.{station.lower()}@example.com",
        "regional_manager": f"Gerente {regional}",
        "pickup_quantity": 0,
        "onhold_order_count": pending,
        "raio": "Fora do raio" if fault == "NSS SPX Fault" else "Dentro do raio",
        "radius_diff": 350.0,
        "horario_funcionamento": "Dentro do horário de funcionamento",
        "open_hour": "09:00",
        "close_hour": "18:00",
    }


# Quem aloca as rotas em cada station. Os nomes batem com os membros do MockMemberSource, exceto
# "Marcos Pinheiro", que aloca rotas mas não tem login: aparece nos indicadores como "sem acionamentos".
ALLOCATORS = {
    "FMH-NSA-01": ["Ana Dispatcher", "Carlos Dispatcher"],
    "SOC-RJ2": ["Bruno Dispatcher"],
    "SOC-SP4": ["Dispatcher SOC-SP4"],
    "FMH-BHZ-03": ["Dispatcher FMH-BHZ-03", "Marcos Pinheiro"],
    "SOC-CWB1": ["Dispatcher SOC-CWB1"],
    "FMH-POA-02": ["Dispatcher FMH-POA-02"],
}

EXTRA_STATIONS = [
    ("FMH-NSA-01", "Regional 4"), ("SOC-RJ2", "Regional 2"), ("SOC-SP4", "Regional 1"),
    ("FMH-BHZ-03", "Regional 3"), ("SOC-CWB1", "Regional 3"), ("FMH-POA-02", "Big"),
]
FIRST = ["Alex", "Bruna", "Caio", "Davi", "Elisa", "Fábio", "Gabriela", "Hugo", "Irene", "João", "Karen", "Lucas"]
LAST = ["Souza", "Lima", "Ribeiro", "Alves", "Moraes", "Tigre", "Pereira", "Costa", "Barros", "Nunes"]
SHOPS = ["LOJA", "MP", "COMERCIAL", "DI LUXO", "CASA", "ARMAZÉM", "BOUTIQUE", "TECH", "MODA", "PET"]
SHOP_TAIL = ["ALFA LTDA", "BETA", "GAMA ME", "DELTA SHOP", "ÔMEGA", "SUL", "NORTE", "CENTRAL", "EXPRESS", "PRIME"]
JUSTIFICATIONS = {
    "No Show Seller": ["Não havia pacotes para coletar", "Local fechado"],
    "No Show 3PL": ["Não localizei o endereço", "Quebra de veículo", "Área de risco", "Não passei pelo endereço"],
    "Partial Pickup": ["Não tenho mais espaço no baú", "Local fechado"],
}


def extra_rows(n: int):
    """Gera n ocorrências determinísticas, concentradas em poucos sellers/drivers (para haver reincidência)."""
    rng = random.Random(42)
    now = timezone.localtime()
    sellers = [(900100 + i, f"{rng.choice(SHOPS)} {rng.choice(SHOP_TAIL)}") for i in range(28)]
    drivers = {st: [(5000 + k * 40 + i, f"{rng.choice(FIRST)} {rng.choice(LAST)}".upper(),
                     f"{rng.choice([19, 21, 11, 31, 37])}9{rng.randint(10000000, 99999999)}")
                    for i in range(7)] for k, (st, _) in enumerate(EXTRA_STATIONS)}
    allocators = ALLOCATORS
    # Pesos: concentra volume em algumas stations e nos dias mais recentes.
    station_weights = [5, 3, 2, 3, 2, 1]
    for i in range(n):
        station, regional = rng.choices(EXTRA_STATIONS, weights=station_weights)[0]
        shop_id, seller = rng.choice(sellers[:10] if rng.random() < 0.55 else sellers)
        driver_id, driver, phone = rng.choice(drivers[station])
        perf = rng.choices(["No Show Seller", "No Show 3PL", "Partial Pickup"], weights=[70, 18, 12])[0]
        fault = ""
        if perf == "No Show Seller":
            fault = "NSS SPX Fault" if rng.random() < 0.8 else "NSS Seller Fault"
        out_radius = out_hours = False
        if fault == "NSS SPX Fault":
            kind = rng.choices(["radius", "hours", "both"], weights=[55, 30, 15])[0]
            out_radius, out_hours = kind in ("radius", "both"), kind in ("hours", "both")
        hour = rng.choice([7, 8, 19, 20, 21] if out_hours else [9, 10, 11, 12, 13, 14, 15, 16, 17])
        day = min(int(rng.expovariate(0.32)), 13)
        minute = rng.randint(0, 59)
        if day == 0 and (hour, minute) > (now.hour, now.minute):
            day = 1  # nada de no-show no futuro: se a hora de hoje ainda não chegou, vira ontem
        item = _occ(2000 + i, perf, rng.choice(JUSTIFICATIONS[perf]), fault, station, regional, shop_id, seller,
                    driver_id, driver, phone, rng.choice(allocators[station]), rng.randint(3, 140),
                    f"{hour:02d}:{minute:02d}", days_ago=day)
        item["raio"] = "Fora do raio" if out_radius else "Dentro do raio"
        item["radius_diff"] = float(rng.randint(60, 950)) if out_radius else float(rng.randint(0, 90))
        item["horario_funcionamento"] = ("Fora do horário de funcionamento" if out_hours
                                         else "Dentro do horário de funcionamento")
        yield item


class MockOccurrenceSource(OccurrenceSource):
    def fetch(self, date_from, date_to, updated_since=None):
        yield from self._base_items()
        yield from extra_rows(getattr(settings, "MOCK_EXTRA_ROWS", 0))

    def _base_items(self):
        items = [
            _occ(1001, "No Show Seller", "Não havia pacotes para coletar", "NSS SPX Fault", "FMH-NSA-01",
                 "Regional 4", 900001, "LOJA ALFA LTDA", 501, "DRIVER UM", "(37) 99999-0001", "Ana Dispatcher", 55, "12:42"),
            _occ(1002, "No Show Seller", "Não havia pacotes para coletar", "NSS SPX Fault", "SOC-RJ2",
                 "Regional 2", 900002, "MP BETA", 502, "DRIVER DOIS", "21 98888-0002", "Bruno Dispatcher", 68, "09:08"),
            _occ(1003, "No Show Seller", "Local fechado", "NSS Seller Fault", "SOC-RJ2",
                 "Regional 2", 900003, "COMERCIAL GAMA", 503, "DRIVER TRES", "21977770003", "Bruno Dispatcher", 12, "10:15"),
            _occ(1004, "Partial Pickup", "Não tenho mais espaço no baú", "", "FMH-NSA-01",
                 "Regional 4", 900004, "DELTA SHOP", 504, "DRIVER QUATRO", "37966660004", "Ana Dispatcher", 30, "14:00"),
            _occ(1005, "No Show 3PL", "Quebra de veículo", "", "FMH-NSA-01",
                 "Regional 4", 900005, "EPSILON STORE", 505, "DRIVER CINCO", "37955550005", "Ana Dispatcher", 20, "15:30"),
            # Mesmo seller de 1001 em outro dia → alimenta "dias com recorrência"
            _occ(1006, "No Show Seller", "Não havia pacotes para coletar", "NSS SPX Fault", "FMH-NSA-01",
                 "Regional 4", 900001, "LOJA ALFA LTDA", 501, "DRIVER UM", "(37) 99999-0001", "Ana Dispatcher", 40, "11:00", days_ago=1),
        ]
        return items


class MockMemberSource(MemberSource):
    def fetch(self, updated_since=None):
        if getattr(settings, "MOCK_EXTRA_ROWS", 0):
            for st, _ in EXTRA_STATIONS[2:]:
                yield {"member_email": f"dispatcher.{st.lower()}@example.com", "member_name": f"Dispatcher {st}",
                       "member_phone": "11988887777", "station_code": st, "role": "dispatcher", "is_active": True}
        yield from [
            {"member_email": "ana@example.com", "member_name": "Ana Dispatcher", "member_phone": "(37) 98888-1111",
             "station_code": "FMH-NSA-01", "role": "dispatcher", "is_active": True},
            {"member_email": "carlos@example.com", "member_name": "Carlos Dispatcher", "member_phone": "37977772222",
             "station_code": "FMH-NSA-01", "role": "dispatcher", "is_active": True},
            {"member_email": "bruno@example.com", "member_name": "Bruno Dispatcher", "member_phone": "21966663333",
             "station_code": "SOC-RJ2", "role": "dispatcher", "is_active": True},
        ]