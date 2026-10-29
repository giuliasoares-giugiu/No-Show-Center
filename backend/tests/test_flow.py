from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import StationMember
from apps.ingestion.services import sync_members, sync_occurrences
from apps.ingestion.sources.mock import MockMemberSource, MockOccurrenceSource
from apps.occurrences.models import Occurrence
from apps.treatments.models import ContactAttempt, Treatment, TreatmentOption


def make_user(email):
    return get_user_model().objects.create_user(username=email, email=email)


class BaseCase(TestCase):
    def setUp(self):
        call_command("seed_defaults", verbosity=0)
        today = timezone.localdate()
        sync_members(MockMemberSource())
        sync_occurrences(MockOccurrenceSource(), today - timedelta(days=7), today)
        self.client = APIClient()

    def login(self, email):
        self.client.force_authenticate(make_user(email))


class IngestionTests(BaseCase):
    def test_queue_assignment(self):
        nss = Occurrence.objects.filter(queue__slug="nss-spx-fault").values_list("pickup_task_id", flat=True)
        self.assertEqual(sorted(nss), ["1001", "1002", "1006"])  # só NSS SPX Fault entra na fila
        self.assertIsNone(Occurrence.objects.get(pickup_task_id=1003).queue)

    def test_sync_is_idempotent(self):
        today = timezone.localdate()
        before = Occurrence.objects.count()
        stats = sync_occurrences(MockOccurrenceSource(), today - timedelta(days=7), today)
        self.assertEqual(Occurrence.objects.count(), before)
        self.assertEqual(stats["created"], 0)

    def test_resync_keeps_treatment(self):
        self.login("ana@example.com")
        occ = Occurrence.objects.get(pickup_task_id=1001)
        opts = occ.queue.options
        self.client.put(f"/api/occurrences/{occ.id}/treatment/", {
            "reversal": opts.get(label="Coletado").id,
            "justification": opts.get(label="Sinal de GPS").id}, format="json")
        today = timezone.localdate()
        sync_occurrences(MockOccurrenceSource(), today - timedelta(days=7), today)
        self.assertTrue(Treatment.objects.filter(occurrence=occ).exists())

    def test_members_deactivated_not_deleted(self):
        class Empty:
            def fetch(self, updated_since=None):
                return iter([])
        stats = sync_members(Empty())
        self.assertEqual(stats["deactivated"], 3)
        self.assertEqual(StationMember.objects.count(), 3)
        self.assertFalse(StationMember.objects.filter(is_active=True).exists())

    def test_manual_member_not_overwritten(self):
        StationMember.objects.filter(email="ana@example.com").update(source="manual", name="Nome Manual")
        sync_members(MockMemberSource())
        self.assertEqual(StationMember.objects.get(email="ana@example.com").name, "Nome Manual")

    def test_phone_normalized(self):
        self.assertEqual(StationMember.objects.get(email="ana@example.com").phone, "5537988881111")


class ApiTests(BaseCase):
    def _get(self, occ_id=None):
        res = self.client.get("/api/occurrences/", {"queue": "nss-spx-fault"})
        return {int(r["pickup_task_id"]): r for r in res.json()["results"]}

    def test_requires_auth(self):
        self.assertEqual(self.client.get("/api/occurrences/").status_code, 403)

    def test_phone_masked_for_outsider_and_open_for_member(self):
        self.login("outsider@example.com")
        rows = self._get()
        self.assertEqual(len(rows), 3)  # painel visível para todos
        self.assertIn("*", rows[1001]["driver_phone"])
        self.assertFalse(rows[1001]["can_treat"])

        self.client.force_authenticate(None)
        self.login("ana@example.com")
        rows = self._get()
        self.assertEqual(rows[1001]["driver_phone"], "5537999990001")
        self.assertTrue(rows[1001]["can_treat"])
        self.assertIn("*", rows[1002]["driver_phone"])  # outra station → mascarado
        self.assertFalse(rows[1002]["can_treat"])

    def test_recurrence_days(self):
        self.login("ana@example.com")
        self.assertEqual(self._get()[1001]["recurrence_days"], 2)  # 1001 + 1006 em dias distintos
        self.assertEqual(self._get()[1002]["recurrence_days"], 1)

    def test_summary_and_treated_filter(self):
        self.login("ana@example.com")
        occ = Occurrence.objects.get(pickup_task_id=1001)
        o = occ.queue.options
        r = self.client.put(f"/api/occurrences/{occ.id}/treatment/", {
            "reversal": o.get(label="Não revertido").id,
            "justification": o.get(label="Sinal de GPS").id}, format="json")
        self.assertEqual(r.status_code, 200)
        s = self.client.get("/api/occurrences/summary/", {"queue": "nss-spx-fault"}).json()
        self.assertEqual({k: s[k] for k in ("total", "treated", "pending", "no_contact")},
                         {"total": 3, "treated": 1, "pending": 2, "no_contact": 2})
        self.assertEqual(s["reversal_rate"], 0.0)  # "Não revertido" não conta como revertida
        pend = self.client.get("/api/occurrences/", {"queue": "nss-spx-fault", "treated": "false"}).json()
        self.assertEqual(pend["count"], 2)

    def test_treatment_permissions_and_validation(self):
        occ = Occurrence.objects.get(pickup_task_id=1001)
        o = occ.queue.options
        payload = {"reversal": o.get(label="Coletado").id, "justification": o.get(label="Outro (especificar...)").id}

        self.login("outsider@example.com")
        self.assertEqual(self.client.put(f"/api/occurrences/{occ.id}/treatment/", payload, format="json").status_code, 403)

        self.client.force_authenticate(None)
        self.login("ana@example.com")
        r = self.client.put(f"/api/occurrences/{occ.id}/treatment/", payload, format="json")
        self.assertEqual(r.status_code, 400)  # "Outro" exige texto
        r = self.client.put(f"/api/occurrences/{occ.id}/treatment/", {**payload, "justification_text": "Portaria fechada"}, format="json")
        self.assertEqual(r.status_code, 200)
        # opção de reversão passada como justificativa → inválida
        bad = {"reversal": o.get(label="Coletado").id, "justification": o.get(label="Coletado").id}
        self.assertEqual(self.client.put(f"/api/occurrences/{occ.id}/treatment/", bad, format="json").status_code, 400)

    def test_contact_flow(self):
        self.login("ana@example.com")
        occ = Occurrence.objects.get(pickup_task_id=1001)
        opts = self.client.get(f"/api/occurrences/{occ.id}/contact-options/").json()
        self.assertEqual({o["name"] for o in opts}, {"Ana Dispatcher", "Carlos Dispatcher"})
        self.assertTrue(next(o for o in opts if o["name"] == "Ana Dispatcher")["is_me"])

        carlos = StationMember.objects.get(email="carlos@example.com")
        r = self.client.post(f"/api/occurrences/{occ.id}/contact/", {"member_id": carlos.id}, format="json")
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertTrue(body["whatsapp_url"].startswith("https://wa.me/5537999990001?text="))
        self.assertIn("Carlos Dispatcher", body["message"])
        self.assertIn("LOJA ALFA LTDA", body["message"])
        attempt = ContactAttempt.objects.get()
        self.assertEqual(attempt.sent_by, "ana@example.com")  # quem clicou
        self.assertEqual(attempt.member_name, "Carlos Dispatcher")  # nome que entrou no texto

    def test_contact_rejects_member_from_other_station(self):
        self.login("ana@example.com")
        occ = Occurrence.objects.get(pickup_task_id=1001)
        bruno = StationMember.objects.get(email="bruno@example.com")
        r = self.client.post(f"/api/occurrences/{occ.id}/contact/", {"member_id": bruno.id}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_queues_endpoint_feeds_selects(self):
        self.login("ana@example.com")
        q = self.client.get("/api/queues/").json()[0]
        self.assertEqual([o["label"] for o in q["reversal_options"]], ["Coletado", "Batida ajustada", "Não revertido"])
        self.assertEqual(len(q["justification_options"]), 7)

        
def test_debug_occurrence_visibility(self):
    from django.conf import settings
    from apps.occurrences.views import (
        visible_occurrences,
        operational_occurrences,
    )

    occ = Occurrence.objects.get(pickup_task_id="1001")

    print("\n--- DEBUG OCORRÊNCIA ---")
    print("VISIBLE_SOURCES:", repr(settings.VISIBLE_SOURCES))
    print("Source:", repr(occ.source))
    print("Seller performance:", repr(occ.seller_performance))
    print("Fault type:", repr(occ.fault_type))
    print("Queue:", occ.queue.slug if occ.queue else None)
    print("Visível:", visible_occurrences().filter(pk=occ.pk).exists())
    print("Operacional:", operational_occurrences().filter(pk=occ.pk).exists())

    self.login("ana@example.com")
    response = self.client.get(
        "/api/occurrences/",
        {"queue": "nss-spx-fault"},
    )
    print("Status API:", response.status_code)
    print("Resposta API:", response.json())



class ExtrasTests(BaseCase):
    def test_filter_options_and_logout(self):
        self.login("ana@example.com")
        opts = self.client.get("/api/occurrences/filter-options/").json()
        self.assertIn({"regional": "Regional 4", "station_code": "FMH-NSA-01"}, opts)
        self.assertEqual(len(opts), len({(o["regional"], o["station_code"]) for o in opts}))
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)


class InsightsTests(BaseCase):
    def _treat(self, task_id, reversal, justification):
        occ = Occurrence.objects.get(pickup_task_id=task_id)
        o = occ.queue.options
        r = self.client.put(f"/api/occurrences/{occ.id}/treatment/", {
            "reversal": o.get(label=reversal).id, "justification": o.get(label=justification).id}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_insights_shape_and_numbers(self):
        self.login("ana@example.com")
        self._treat(1001, "Coletado", "Sinal de GPS")
        data = self.client.get("/api/occurrences/insights/", {"queue": "nss-spx-fault"}).json()

        self.assertEqual(data["kpis"]["total"], 3)
        self.assertEqual(data["kpis"]["reversal_rate"], 1.0)  # 1 tratada, "Coletado" conta como revertida
        self.assertEqual(sum(data["aging"].values()), data["kpis"]["pending"])
        self.assertEqual(sum(data["cause"].values()), 3)
        self.assertEqual(data["cause"]["raio_only"], 3)  # mock: NSS SPX Fault = fora do raio, dentro do horário
        self.assertEqual(data["reversal"], [{"label": "Coletado", "count": 1, "reversed": True}])
        self.assertEqual(data["justifications"], [{"label": "Sinal de GPS", "count": 1}])
        self.assertEqual(len(data["by_hour"]), 24)
        self.assertEqual(sum(d["total"] for d in data["daily"]), 3)
        top = data["repeat_sellers"][0]
        self.assertEqual((top["shop_id"], top["days"], top["occurrences"]), ("900001", 2, 2))
        station = next(s for s in data["stations"] if s["station_code"] == "FMH-NSA-01")
        self.assertEqual((station["total"], station["treated"], station["pending"]), (2, 1, 1))

    def test_insights_respect_filters(self):
        self.login("ana@example.com")
        data = self.client.get("/api/occurrences/insights/", {"queue": "nss-spx-fault", "station_code": "SOC-RJ2"}).json()
        self.assertEqual(data["kpis"]["total"], 1)

    def test_history_and_contact_state_on_list(self):
        self.login("ana@example.com")
        occ = Occurrence.objects.get(pickup_task_id=1001)
        carlos = StationMember.objects.get(email="carlos@example.com")
        self.client.post(f"/api/occurrences/{occ.id}/contact/", {"member_id": carlos.id}, format="json")
        hist = self.client.get(f"/api/occurrences/{occ.id}/history/").json()
        self.assertEqual([h["member_name"] for h in hist], ["Carlos Dispatcher"])
        rows = {int(r["pickup_task_id"]): r for r in
                self.client.get("/api/occurrences/", {"queue": "nss-spx-fault"}).json()["results"]}
        self.assertEqual(rows[1001]["contact_count"], 1)
        self.assertEqual(rows[1001]["last_contact_by"], "Carlos Dispatcher")
        self.assertEqual(rows[1002]["contact_count"], 0)
        self.assertIsNone(rows[1002]["last_contact_at"])
        s = self.client.get("/api/occurrences/summary/", {"queue": "nss-spx-fault"}).json()
        self.assertEqual(s["no_contact"], 2)  # 1001 foi acionada; 1002 e 1006 não

    def test_ordering(self):
        self.login("ana@example.com")
        def ids(order):
            res = self.client.get("/api/occurrences/", {"queue": "nss-spx-fault", "ordering": order}).json()
            return [int(r["pickup_task_id"]) for r in res["results"]]
        self.assertEqual(ids("-packages")[0], 1002)  # 68 pacotes pendentes
        self.assertEqual(ids("packages")[0], 1006)   # 40 pacotes
        rec = ids("-recurrence")
        self.assertEqual(set(rec[:2]), {1001, 1006})  # mesmo seller reincidente (2 dias) vem primeiro
        self.assertEqual(rec[2], 1002)                # seller de 1 dia só vem depois


class SpaFallbackTests(TestCase):
    def test_client_routes_return_index_and_real_404s_stay_404(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "index.html").write_text("<html><body>MESA</body></html>", encoding="utf-8")
            with override_settings(FRONTEND_DIST=Path(tmp)):
                for route in ("/insights", "/insights/", "/qualquer/rota"):
                    r = self.client.get(route)
                    self.assertEqual((r.status_code, b"MESA" in r.content), (200, True), route)
                self.assertEqual(self.client.get("/insights").headers["Cache-Control"], "no-cache")
                self.assertEqual(self.client.get("/assets/sumiu.js").status_code, 404)   # arquivo inexistente
                self.assertEqual(self.client.get("/api/nao-existe/").status_code, 404)   # API não vira HTML
                self.assertEqual(self.client.post("/insights").status_code, 405)         # só GET

    def test_missing_build_is_explicit(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(FRONTEND_DIST=Path(tmp)):
            # "/insights" (e não "/"): com um build presente, o WhiteNoise serve "/" direto do disco
            # e o teste passaria a depender do estado da máquina.
            r = self.client.get("/insights")
            self.assertEqual(r.status_code, 404)
            self.assertIn("Frontend não compilado", r.content.decode())


class RecurrenceTests(BaseCase):
    def _rec(self, **params):
        if not getattr(self, "_logged", False):
            self.login("ana@example.com")
            self._logged = True
        return self.client.get("/api/occurrences/recurrence/", {"queue": "nss-spx-fault", **params})

    def test_seller_driver_and_route_recurrence(self):
        # 1001 e 1006 são do mesmo seller (900001), motorista (501) e rota, em dias diferentes
        for entity, key in (("seller", "900001"), ("driver", "501"), ("route", "ROTA-FMH-NSA-01-501")):
            r = self._rec(entity=entity).json()
            self.assertEqual(r["count"], 1, entity)
            row = r["results"][0]
            self.assertEqual((row["key"], row["days"], row["occurrences"], row["pending"]), (key, 2, 2, 2), entity)
            self.assertEqual(row["packages"], 55 + 40)
            self.assertEqual(row["out_radius"], 2)  # NSS SPX Fault do mock = fora do raio
            self.assertEqual(row["out_hours"], 0)
            self.assertLess(row["first_date"], row["last_date"])

    def test_min_days_and_validation(self):
        self.assertEqual(self._rec(entity="seller", min_days=3).json()["count"], 0)
        self.assertEqual(self._rec(entity="seller", min_days=1).json()["count"], 2)  # 3 ocorrências, 2 sellers (1001 e 1006 são do mesmo)
        self.assertEqual(self._rec(entity="cliente").status_code, 400)
        self.assertEqual(self._rec(entity="seller", order="zzz").status_code, 400)
        self.assertEqual(self._rec(entity="seller", min_days="abc").status_code, 200)  # valor inválido → padrão

    def test_recurrence_respects_filters(self):
        self.assertEqual(self._rec(entity="seller", station_code="SOC-RJ2", min_days=1).json()["count"], 1)

    def test_occurrence_exact_filters_feed_the_detail_panel(self):
        self.login("ana@example.com")
        get = lambda **p: self.client.get("/api/occurrences/", {"queue": "nss-spx-fault", **p}).json()["count"]
        self.assertEqual(get(shop_id=900001), 2)
        self.assertEqual(get(driver_id=501), 2)
        self.assertEqual(get(route="ROTA-FMH-NSA-01-501"), 2)
        self.assertEqual(get(route="ROTA-INEXISTENTE"), 0)
        self.assertEqual(get(search="rota-fmh-nsa-01-501"), 2)  # a busca visível também acha pelo nome da rota


class TreatmentLogTests(BaseCase):
    def _treat(self, task_id, reversal, justification, text=""):
        occ = Occurrence.objects.get(pickup_task_id=task_id)
        o = occ.queue.options
        r = self.client.put(f"/api/occurrences/{occ.id}/treatment/", {
            "reversal": o.get(label=reversal).id, "justification": o.get(label=justification).id,
            "justification_text": text}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def setUp(self):
        super().setUp()
        self.login("ana@example.com")
        self._treat(1001, "Coletado", "Sinal de GPS")
        self._treat(1006, "Não revertido", "Outro (especificar...)", "Portaria fechada")

    def test_log_rows_and_filters(self):
        res = self.client.get("/api/treatments/").json()
        self.assertEqual(res["count"], 2)
        row = next(r for r in res["results"] if r["pickup_task_id"] == "1001")
        self.assertEqual((row["reversal_label"], row["reversed"], row["justification_label"]),
                         ("Coletado", True, "Sinal de GPS"))
        self.assertEqual((row["seller_name"], row["station_code"], row["treated_by"]),
                         ("LOJA ALFA LTDA", "FMH-NSA-01", "ana@example.com"))
        self.assertNotIn("driver_phone", row)  # o registro não expõe telefone
        get = lambda **p: self.client.get("/api/treatments/", p).json()["count"]
        self.assertEqual(get(reversed="true"), 1)
        self.assertEqual(get(reversed="false"), 1)
        self.assertEqual(get(treated_by="ANA@example.com"), 2)  # iexact
        self.assertEqual(get(treated_by="outra@example.com"), 0)
        self.assertEqual(get(station_code="SOC-RJ2"), 0)
        self.assertEqual(get(search="alfa"), 2)
        self.assertEqual(get(shop_id=900001), 2)

    def test_date_filter_is_the_treatment_date(self):
        today = timezone.localdate().isoformat()
        yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()
        get = lambda **p: self.client.get("/api/treatments/", p).json()["count"]
        self.assertEqual(get(date_from=today, date_to=today), 2)
        self.assertEqual(get(date_to=yesterday), 0)  # as ocorrências são de dias anteriores, a tratativa é de hoje

    def test_summary(self):
        s = self.client.get("/api/treatments/summary/").json()
        self.assertEqual((s["total"], s["reversed"], s["reversal_rate"]), (2, 1, 0.5))
        self.assertEqual({r["label"]: r["count"] for r in s["by_reversal"]}, {"Coletado": 1, "Não revertido": 1})
        self.assertEqual(s["by_user"], [{"treated_by": "ana@example.com", "count": 2, "reversed": 1}])
        self.assertEqual(s["by_day"][0]["count"], 2)
        self.assertEqual(len(s["by_justification"]), 2)
        self.assertTrue(all(isinstance(r["id"], int) for r in s["by_reversal"] + s["by_justification"]))

    def test_export_csv_is_excel_friendly_and_formula_safe(self):
        Occurrence.objects.filter(pickup_task_id=1001).update(seller_name='=HYPERLINK("http://x","clique")')
        res = self.client.get("/api/treatments/export/", {"reversed": "true"})
        body = b"".join(res.streaming_content).decode("utf-8")
        self.assertTrue(body.startswith("\ufeffTratada em;"))  # BOM + separador ; para o Excel em pt-BR
        self.assertIn("attachment; filename=\"tratativas-", res["Content-Disposition"])
        lines = body.strip().splitlines()
        self.assertEqual(len(lines), 2)  # cabeçalho + 1 tratativa revertida
        self.assertIn("'=HYPERLINK", lines[1])           # fórmula neutralizada
        self.assertNotIn(";=HYPERLINK", lines[1])
        self.assertIn("Coletado;Sim;Sinal de GPS", lines[1])

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/treatments/").status_code, 403)
        self.assertEqual(self.client.get("/api/treatments/export/").status_code, 403)


class IndicatorsTests(BaseCase):
    """Dados do mock: no-shows = 1001,1003,1006 (Seller), 1002 (Seller), 1005 (3PL); 1004 é Partial (fora do escopo).
    Rotas alocadas: Ana = 1001, 1005, 1006; Bruno = 1002, 1003."""

    def get(self, path, **params):
        return self.client.get(f"/api/indicators/{path}/", params)

    def act(self):
        """Ana aciona 1001 duas vezes e reverte; reverte 1005 sem acionar; aciona 1006 e não reverte."""
        self.login("ana@example.com")
        carlos = StationMember.objects.get(email="carlos@example.com").id
        def occ(task): return Occurrence.objects.get(pickup_task_id=task)
        def contact(task): self.assertEqual(self.client.post(f"/api/occurrences/{occ(task).id}/contact/", {"member_id": carlos}, format="json").status_code, 201)
        def treat(task, reversal, justification):
            o = occ(task)
            opts = o.queue.options
            self.assertEqual(self.client.put(f"/api/occurrences/{o.id}/treatment/", {
                "reversal": opts.get(label=reversal).id, "justification": opts.get(label=justification).id}, format="json").status_code, 200)
        # 1005 (No Show 3PL) não tem fila: força a fila para poder tratar no teste
        Occurrence.objects.filter(pickup_task_id=1005).update(queue=occ(1001).queue)
        contact(1001); contact(1001); treat(1001, "Coletado", "Sinal de GPS")
        treat(1005, "Batida ajustada", "Sinal de GPS")
        contact(1006); treat(1006, "Não revertido", "Sinal de GPS")

    def test_overview_before_any_action(self):
        self.login("ana@example.com")
        o = self.get("overview").json()
        self.assertEqual((o["occurrences"], o["routes"], o["driver_no_show"], o["seller_no_show"]), (5, 5, 1, 4))
        self.assertEqual((o["treated"], o["messages"], o["reversal_rate"]), (0, 0, None))
        self.assertIsNone(o["attempts"]["avg"])
        self.assertEqual(o["training"], {"available": False})

    def test_overview_after_actions(self):
        self.act()
        o = self.get("overview").json()
        self.assertEqual((o["treated"], o["reverted"], o["reversal_rate"]), (3, 2, 0.6667))
        self.assertEqual((o["routes_treated"], o["routes_reverted"]), (3, 2))
        self.assertEqual((o["messages"], o["drivers_contacted"]), (3, 1))  # 3 mensagens, ao mesmo driver (501)
        a = o["attempts"]
        self.assertEqual(a["reversed_treatments"], 2)             # 1001 e 1005 viraram sucesso; 1006 não
        self.assertEqual(a["distribution"], {"zero": 1, "one": 0, "two": 1, "three_plus": 0})
        self.assertEqual(a["avg"], 1.0)                           # (2 acionamentos + 0) / 2
        self.assertIsNotNone(o["avg_hours_to_treat"])

    def test_dispatchers_join_routes_and_actions(self):
        self.act()
        res = self.get("dispatchers").json()
        rows = {r["name"]: r for r in res["results"]}
        ana, bruno = rows["Ana Dispatcher"], rows["Bruno Dispatcher"]
        self.assertEqual((ana["routes"], ana["routes_treated"], ana["routes_reverted"]), (3, 3, 2))
        self.assertEqual((ana["messages"], ana["drivers_contacted"], ana["treated_by_him"], ana["reverted_by_him"]), (3, 1, 3, 2))
        self.assertTrue(ana["has_routes"] and ana["has_actions"])
        self.assertEqual(ana["email"], "ana@example.com")
        self.assertEqual((bruno["routes"], bruno["pending"], bruno["messages"]), (2, 2, 0))
        self.assertFalse(bruno["has_actions"])                    # aloca rotas com no-show, mas não agiu
        self.assertEqual(res["results"][0]["name"], "Ana Dispatcher")  # ordenado por rotas

    def test_same_person_with_different_spelling_is_merged_not_overwritten(self):
        Occurrence.objects.filter(pickup_task_id=1001).update(allocated_by="ANA  dispatcher")
        self.act()
        rows = [r for r in self.get("dispatchers").json()["results"] if "ana" in r["key"]]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["routes"], 3)                    # 1001 (outra grafia) + 1005 + 1006

    def test_actor_who_is_not_a_member_appears_by_email(self):
        self.login("outsider@example.com")
        self.client.force_authenticate(get_user_model().objects.get(email="outsider@example.com"))
        ContactAttempt.objects.create(occurrence=Occurrence.objects.get(pickup_task_id=1002), sent_by="Fora@Example.com",
                                      member_name="X", member_phone="5511999990000", message="m")
        row = next(r for r in self.get("dispatchers").json()["results"] if r["email"] == "fora@example.com")
        self.assertEqual((row["name"], row["has_routes"], row["messages"]), ("fora@example.com", False, 1))

    def test_drivers(self):
        self.act()
        res = self.get("drivers").json()["results"]
        d501 = next(r for r in res if r["driver_id"] == 501)
        self.assertEqual((d501["occurrences"], d501["days"], d501["sellers"], d501["repeat_sellers"]), (2, 2, 1, 1))
        self.assertEqual((d501["no_show_driver"], d501["no_show_seller"], d501["spx_fault"]), (0, 2, 2))
        self.assertEqual((d501["treated"], d501["reverted"]), (2, 1))
        d505 = next(r for r in res if r["driver_id"] == 505)
        self.assertEqual((d505["no_show_driver"], d505["reverted"]), (1, 1))
        self.assertEqual(self.get("drivers", order="no_show_driver").json()["results"][0]["driver_id"], 505)
        self.assertEqual(self.get("drivers", order="repeat_sellers").json()["results"][0]["driver_id"], 501)

    def test_filters_and_validation(self):
        self.login("ana@example.com")
        self.assertEqual(self.get("overview", station_code="SOC-RJ2").json()["occurrences"], 2)
        today = timezone.localdate().isoformat()
        self.assertEqual(self.get("overview", date_from=today).json()["occurrences"], 4)  # sem 1006 (ontem)
        self.assertEqual(self.get("dispatchers", order="zzz").status_code, 400)
        self.assertEqual(self.get("drivers", order="zzz").status_code, 400)
        self.assertEqual(self.get("drivers", limit="abc").status_code, 200)

    def test_restricted_mode_limits_individual_performance_to_coordination(self):
        user = lambda email, **kw: get_user_model().objects.create_user(username=email, email=email, **kw)
        from apps.accounts.models import RegionalAccess
        RegionalAccess.objects.create(email="coord@example.com", regional="Regional 4")
        with self.settings(INDICATORS_RESTRICTED=True):
            for email, kwargs, expected in (("comum@example.com", {}, 403), ("adm@example.com", {"is_staff": True}, 200),
                                            ("coord@example.com", {}, 200)):
                self.client.force_authenticate(user(email, **kwargs))
                self.assertEqual(self.get("dispatchers").status_code, expected, email)
        self.client.force_authenticate(user("qualquer@example.com"))
        self.assertEqual(self.get("dispatchers").status_code, 200)  # padrão: todos os logados veem

    def test_requires_login(self):
        self.assertEqual(self.get("overview").status_code, 403)


class IngestionFormatTests(TestCase):
    """A tabela do Data Suite guarda quase tudo como VARCHAR: a ingestão precisa tolerar os formatos e
    nunca deixar uma linha ruim derrubar a rodada."""

    BASE = dict(pickup_task_id=1, occurrence_date="2026-10-15", occurred_at="2026-10-15T12:42:00",
                seller_performance="No Show Seller", fault_type="NSS SPX Fault", shop_id="900001",
                station_code="X", regional="R1", driver_id="5", driver_phone="(37) 99999-0001",
                pickup_quantity="0", onhold_order_count="55")

    def run_sync(self, *items):
        class Src:
            def fetch(self, *a, **k):
                return iter(items)
        return sync_occurrences(Src(), timezone.localdate() - timedelta(days=30), timezone.localdate())

    def test_numeric_text_in_several_shapes(self):
        stats = self.run_sync({**self.BASE, "onhold_order_count": "55.0", "shop_id": " 900001 ", "driver_id": "5",
                               "pickup_quantity": "", "radius_diff": "350.5"})
        self.assertEqual(stats, {"created": 1, "updated": 0, "skipped": 0, "ignored": 0})
        o = Occurrence.objects.get()
        self.assertEqual((o.onhold_order_count, o.shop_id, o.driver_id, o.pickup_quantity, o.radius_diff), (55, "900001", 5, 0, 350.5))

    def test_non_numeric_radius_diff_becomes_null(self):
        for raw in ("", "NA", None):
            Occurrence.objects.all().delete()
            self.run_sync({**self.BASE, "radius_diff": raw})
            self.assertIsNone(Occurrence.objects.get().radius_diff, repr(raw))

    def test_event_date_may_carry_a_time(self):
        self.run_sync({**self.BASE, "occurrence_date": "2026-10-15 00:00:00"})
        self.assertEqual(Occurrence.objects.get().occurrence_date.isoformat(), "2026-10-15")

    def test_occurred_at_accepts_iso_space_epoch_seconds_and_milliseconds(self):
        from datetime import datetime, timezone as tz
        epoch = 1792084266
        expected = datetime.fromtimestamp(epoch, tz=tz.utc)
        for raw in (epoch, str(epoch), epoch * 1000, f"{epoch}.0"):
            Occurrence.objects.all().delete()
            self.run_sync({**self.BASE, "occurred_at": raw})
            self.assertEqual(Occurrence.objects.get().occurred_at, expected, repr(raw))
        for raw in ("2026-10-15T12:42:00", "2026-10-15 12:42:00"):  # sem fuso = horário de Brasília
            Occurrence.objects.all().delete()
            self.run_sync({**self.BASE, "occurred_at": raw})
            stored = Occurrence.objects.get().occurred_at.astimezone(timezone.get_current_timezone())
            self.assertEqual((stored.hour, stored.minute), (12, 42), raw)

    def test_a_bad_row_does_not_abort_the_run(self):
        stats = self.run_sync(
            {**self.BASE, "pickup_task_id": 1},
            {**self.BASE, "pickup_task_id": 2, "occurrence_date": "não é data"},
            {**self.BASE, "pickup_task_id": 3, "occurred_at": "ontem"},
            {**self.BASE, "pickup_task_id": 4, "onhold_order_count": "muitos"},
            {**self.BASE, "pickup_task_id": None},
            {k: v for k, v in self.BASE.items() if k != "pickup_task_id"},
            {**self.BASE, "pickup_task_id": 7},
        )
        self.assertEqual(stats, {"created": 2, "updated": 0, "skipped": 5, "ignored": 0})
        self.assertEqual(sorted(Occurrence.objects.values_list("pickup_task_id", flat=True)), ["1", "7"])

    def test_skipped_row_log_does_not_leak_personal_data(self):
        with self.assertLogs("apps.ingestion.services", level="WARNING") as logs:
            self.run_sync({**self.BASE, "pickup_task_id": 9, "occurrence_date": "inválida"})
        text = " ".join(logs.output)
        self.assertIn("pickup_task_id=9", text)
        self.assertNotIn("99999", text)       # telefone do driver
        self.assertNotIn("900001", text)      # demais campos da linha


class SellerGroupTests(BaseCase):
    """Seller group = prefixo do PUP antes do "_" ("1234", "1234_001", "1234_002" são um grupo só)."""

    def setUp(self):
        super().setUp()
        self.login("ana@example.com")

    def run_sync(self, *items):
        class Src:
            def fetch(self, *a, **k):
                return iter(items)
        return sync_occurrences(Src(), timezone.localdate() - timedelta(days=30), timezone.localdate())

    def test_pickup_point_is_text_and_group_is_the_prefix(self):
        base = dict(occurrence_date="2026-10-15", seller_performance="No Show Seller", fault_type="NSS SPX Fault",
                    shop_id="900001", station_code="X", regional="R1", driver_id="5")
        pups = ["1234", "1234_001", "1234_002", "12340", "DOP77", 1234.0, " 1234_003 ", None, ""]
        Occurrence.objects.all().delete()
        stats = self.run_sync(*[{**base, "pickup_task_id": 100 + i, "pickup_point_id": p} for i, p in enumerate(pups)])
        self.assertEqual(stats, {"created": 9, "updated": 0, "skipped": 0, "ignored": 0})  # "DOP77" antes descartava a linha
        got = {int(o.pickup_task_id) - 100: (o.pickup_point_id, o.seller_group) for o in Occurrence.objects.all()}
        self.assertEqual(got, {0: ("1234", "1234"), 1: ("1234_001", "1234"), 2: ("1234_002", "1234"), 3: ("12340", "12340"),
                               4: ("DOP77", "DOP77"), 5: ("1234", "1234"), 6: ("1234_003", "1234"), 7: ("", ""), 8: ("", "")})
        # regressão: o "_" nunca pode virar separador de dígitos (1234_001 -> 1234001)
        self.assertFalse(Occurrence.objects.filter(pickup_point_id__in=["1234001", "1234002"]).exists())

    def test_group_sent_by_the_api_wins_over_the_derived_one(self):
        base = dict(pickup_task_id=500, occurrence_date="2026-10-15", seller_performance="No Show Seller", shop_id="1",
                    station_code="X", regional="R1")
        Occurrence.objects.all().delete()
        self.run_sync({**base, "pickup_point_id": "1234_001", "seller_group": "GRUPO-9"})
        self.assertEqual(Occurrence.objects.get().seller_group, "GRUPO-9")

    def test_mock_data_carries_real_shaped_pups(self):
        got = {int(o.pickup_task_id): (o.pickup_point_id, o.seller_group) for o in Occurrence.objects.all()}
        self.assertEqual(got[1001], ("900001_002", "900001"))
        self.assertEqual(got[1006], ("900001_001", "900001"))  # dois PUPs do mesmo seller = um grupo
        self.assertEqual(got[1002], ("900002", "900002"))

    def test_filters_by_pickup_point_and_group_and_search(self):
        count = lambda **p: self.client.get("/api/occurrences/", p).json()["count"]
        self.assertEqual(count(seller_group="900001"), 2)
        self.assertEqual(count(pickup_point_id="900001_002"), 1)
        self.assertEqual(count(search="900001"), 2)
        self.assertEqual(count(seller_group="nao-existe"), 0)

    def test_recurrence_by_seller_group_consolidates_shops_and_pups(self):
        Occurrence.objects.filter(pickup_task_id__in=[1002, 1003]).update(seller_group="900001")
        get = lambda entity: self.client.get("/api/occurrences/recurrence/", {"entity": entity, "min_days": 2}).json()["results"]
        group = next(r for r in get("seller_group") if r["key"] == "900001")
        self.assertEqual((group["days"], group["occurrences"], group["related"]), (2, 4, 3))  # 3 drivers, 4 PUPs, 2 dias
        self.assertEqual(group["pickup_points"], 4)
        shop = next(r for r in get("seller") if r["key"] == "900001")
        self.assertEqual(shop["occurrences"], 2)  # por shop é só o 900001; o grupo junta os outros shops

    def test_recurrence_ignores_rows_without_group(self):
        Occurrence.objects.update(seller_group="")
        r = self.client.get("/api/occurrences/recurrence/", {"entity": "seller_group", "min_days": 1}).json()
        self.assertEqual(r["count"], 0)

    def test_drivers_can_count_sellers_by_group(self):
        Occurrence.objects.create(
            pickup_task_id=1007, occurrence_date=timezone.localdate(), seller_performance="No Show Seller",
            fault_type="NSS SPX Fault", shop_id=900009, station_code="FMH-NSA-01", regional="Regional 4", driver_id=501,
            driver_name="DRIVER UM", pickup_point_id="900001_009", seller_group="900001", onhold_order_count=1)
        row = lambda **p: next(r for r in self.client.get("/api/indicators/drivers/", p).json()["results"] if r["driver_id"] == 501)
        self.assertEqual(row()["sellers"], 2)                      # shops 900001 e 900009
        self.assertEqual(row(group_by="group")["sellers"], 1)      # os dois são o grupo 900001
        self.assertEqual(self.client.get("/api/indicators/drivers/", {"group_by": "zzz"}).status_code, 400)


class SourceCheckTests(TestCase):
    """`check_source` valida a fonte sem gravar nada e nunca vaza valores das linhas."""

    BASE = dict(pickup_task_id=1, occurrence_date="2026-10-15", occurred_at="2026-10-15T12:42:00",
                seller_performance="No Show Seller", driver_justification="x", fault_type="NSS SPX Fault", shop_id="9",
                seller_name="S", pickup_point_id="9_001", station_code="X", regional="R", driver_id="5",
                driver_name="D", driver_phone="(37) 99999-0001", route_name="R1", trip_id="7", allocated_by="A",
                pickup_quantity="0", onhold_order_count="3", raio="Fora do raio", radius_diff="10",
                horario_funcionamento="Dentro do horário de funcionamento", open_hour="09:00", close_hour="18:00")

    def test_the_mock_source_passes(self):
        from apps.ingestion.validation import analyze_rows
        today = timezone.localdate()
        r = analyze_rows(list(MockOccurrenceSource().fetch(today - timedelta(days=7), today)))
        self.assertEqual((r["total"], r["valid"], r["blocking"], r["missing_expected"]), (6, 6, [], []))
        self.assertEqual(r["duplicates"], 0)
        self.assertEqual(sum(r["pup_formats"].values()), 6)
        self.assertGreaterEqual(r["pup_formats"]["numero_sufixo"], 1)

    def test_table_native_column_names_are_reported(self):
        from apps.ingestion.validation import analyze_rows
        native = {"id": "uuid", "event_date": "2026-10-15", "pickup_driver_id": 5, "route_display_name": "R",
                  "trip_id": 1, "shop_id": "9", "occurrence": "No Show Seller", "spx_fault": "NSS SPX Fault"}
        r = analyze_rows([native])
        self.assertIn("pickup_task_id", r["missing_expected"])       # a tabela só tem `id` (uuid), sem alias possível
        self.assertNotIn("pickup_driver_id", r["unknown_keys"])      # já traduzido (alias de driver_id)
        self.assertNotIn("driver_id", r["missing_expected"])
        self.assertTrue(any("pickup_task_id" in item for item in r["blocking"]))

    def test_bad_rows_are_classified_without_leaking_values(self):
        from apps.ingestion.validation import analyze_rows
        rows = [{**self.BASE, "pickup_task_id": 1}, {**self.BASE, "pickup_task_id": 2, "occurrence_date": "João Silva"},
                {**self.BASE, "pickup_task_id": 3, "onhold_order_count": "Maria"}, {**self.BASE, "pickup_task_id": None},
                {**self.BASE, "pickup_task_id": 5, "occurred_at": "ontem"}]
        r = analyze_rows(rows)
        self.assertEqual((r["total"], r["valid"]), (5, 1))
        self.assertEqual(r["invalid"], {"data inválida": 1, "número inválido": 1, "pickup_task_id ausente": 1, "data/hora inválida": 1})
        self.assertTrue(r["blocking"])
        text = str(r)
        for secret in ("João", "Maria", "99999", "ontem"):
            self.assertNotIn(secret, text)

    def test_unexpected_values_evaluate_duplicates_and_future_are_warned(self):
        from apps.ingestion.validation import analyze_rows
        future = (timezone.now() + timedelta(days=1)).isoformat()
        r = analyze_rows([
            {**self.BASE, "pickup_task_id": 1, "seller_performance": "No Show Driver"},
            {**self.BASE, "pickup_task_id": 2, "seller_performance": "evaluate", "occurred_at": future},
            {**self.BASE, "pickup_task_id": 2, "raio": "Perto"},
        ])
        self.assertEqual(r["blocking"], [])
        self.assertEqual(r["duplicates"], 1)
        self.assertEqual(r["unexpected_values"], {"seller_performance": ["No Show Driver"], "raio": ["Perto"]})
        joined = " ".join(r["warnings"])
        for needle in ("No Show Driver", "evaluate", "repetido", "no futuro"):
            self.assertIn(needle, joined)

    def test_low_coverage_of_critical_fields_is_warned(self):
        from apps.ingestion.validation import analyze_rows
        rows = [{**self.BASE, "pickup_task_id": i, "close_hour": "" if i < 10 else "18:00"} for i in range(1, 11)]
        self.assertIn("close_hour", " ".join(analyze_rows(rows)["warnings"]))

    def test_command_writes_nothing_and_fails_when_the_source_is_not_ready(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command
        from django.core.management.base import CommandError
        out = StringIO()
        call_command("check_source", stdout=out)
        self.assertEqual(Occurrence.objects.count(), 0)               # só lê, nunca grava
        self.assertIn("Fonte OK para a primeira carga", out.getvalue())

        class NativeSource:
            def fetch(self, *a, **k):
                return iter([{"id": "u", "event_date": "2026-10-15", "pickup_driver_id": 5}])
        with patch("apps.ingestion.management.commands.check_source.get_occurrence_source", return_value=NativeSource()):
            with self.assertRaises(CommandError):
                call_command("check_source", stdout=StringIO())

        class Broken:
            def fetch(self, *a, **k):
                raise ConnectionError("sem rede")
        with patch("apps.ingestion.management.commands.check_source.get_occurrence_source", return_value=Broken()):
            with self.assertRaisesMessage(CommandError, "Falha ao buscar da fonte (ConnectionError)"):
                call_command("check_source", stdout=StringIO())


REAL_ROW = {"rowNumber": 4, "values": {  # formato real da API (amostra de outubro/2026), com valores fictícios
    "close_hour_decimal": 18, "regional_pic": "Gerente Teste", "regional": "Regional 1",
    "route_display_name": "SOC-SP8_2026_0001_0142", "pickup_driver_phone": "11900000000", "spx_fault": "null",
    "station_code": "SOC-SP8", "occurrence": "Full Pickup", "pickup_task_id": "PT20261021TESTE1", "close_hour": "18:00",
    "atualizacao_timestamp": 1792603859, "pickup_start_datestamp": "2026-10-21 11:37:31",
    "event_date": "2026-10-21", "id": "6084b79c-a0f7-4169-b1fe-bae86d71067d", "open_hour_decimal": 9,
    "justification": "Não havia pacotes para coletar", "pickup_point_name": "PROJETO FM TESTE", "open_hour": "09:00",
    "done_datestamp": "2026-10-21 11:49:02", "raio": "Fora do raio", "trip_id": 5601783, "task_status": "Done",
    "disabled_datestamp": "", "supervisor_email_address": "null", "pickup_driver_id": 2213831,
    "dispatcher_email_address": "null", "driver_name": "DRIVER TESTE", "radius_diff": "null",
    "horario_funcionamento": "Dentro do horário de funcionamento", "shop_id": "DOP7919", "onhold_order_count": 90,
    "pickup_quantity": 4006, "pickup_point_id": "DOP7919_001", "grass_date": "2026-10-21", "grass_month": "202610"}}


def real_row(**over):
    import copy
    row = copy.deepcopy(REAL_ROW)
    row["values"].update(over)
    return row


class RealApiShapeTests(TestCase):
    """A API devolve `{rowNumber, values}`, com nomes da tabela, "null" em texto e IDs não numéricos."""

    def setUp(self):
        call_command("seed_defaults", verbosity=0)

    def sync(self, *rows, allowed=None):
        from apps.ingestion.normalize import normalize_row
        class Src:
            def fetch(self, *a, **k):
                return iter([normalize_row(r) for r in rows])
        return sync_occurrences(Src(), date(2026, 10, 1), date(2026, 10, 30), allowed=allowed)

    def test_envelope_null_texts_and_aliases(self):
        from apps.ingestion.normalize import normalize_row
        row = normalize_row(REAL_ROW)
        for field in ("fault_type", "dispatcher_email", "supervisor_email", "radius_diff"):
            self.assertIsNone(row[field], field)                     # "null" em texto vira nulo de verdade
        self.assertEqual((row["seller_name"], row["driver_id"], row["route_name"], row["regional_manager"]),
                         ("PROJETO FM TESTE", 2213831, "SOC-SP8_2026_0001_0142", "Gerente Teste"))
        self.assertEqual((row["seller_performance"], row["occurrence_date"], row["driver_justification"]),
                         ("Full Pickup", "2026-10-21", "Não havia pacotes para coletar"))
        self.assertEqual(normalize_row(normalize_row(REAL_ROW)), row)  # idempotente

    def test_na_is_a_real_value_not_a_null_text(self):
        from apps.ingestion.normalize import normalize_row
        self.assertEqual(normalize_row(real_row(raio="NA"))["raio"], "NA")

    def test_event_time_priority_and_hours_from_decimals(self):
        from apps.ingestion.normalize import hhmm_from_decimal, normalize_row
        self.assertEqual(normalize_row(REAL_ROW)["occurred_at"], "2026-10-21 11:49:02")                       # conclusão
        self.assertEqual(normalize_row(real_row(done_datestamp=""))["occurred_at"], "2026-10-21 11:37:31")    # início
        self.assertEqual(normalize_row(real_row(done_datestamp="", disabled_datestamp="2026-10-21 03:00:00"))["occurred_at"],
                         "2026-10-21 03:00:00")                                                                 # desativação
        self.assertIsNone(normalize_row(real_row(done_datestamp="", pickup_start_datestamp=""))["occurred_at"])
        self.assertEqual(normalize_row(real_row(close_hour="", close_hour_decimal=18.5))["close_hour"], "18:30")
        self.assertEqual([hhmm_from_decimal(v) for v in (9, 18, 18.5, 24, "x", 25)], ["09:00", "18:00", "18:30", "24:00", None, None])

    def test_sync_stores_text_ids_hierarchy_and_derived_fields(self):
        stats = self.sync(real_row(occurrence="No Show Seller", spx_fault="NSS SPX Fault",
                                   dispatcher_email_address="Ana@Example.com", supervisor_email_address="Sup@Example.com"))
        self.assertEqual(stats, {"created": 1, "updated": 0, "skipped": 0, "ignored": 0})
        o = Occurrence.objects.get()
        self.assertEqual((o.pickup_task_id, o.shop_id, o.pickup_point_id, o.seller_group),
                         ("PT20261021TESTE1", "DOP7919", "DOP7919_001", "DOP7919"))
        self.assertEqual((o.dispatcher_email, o.supervisor_email, o.regional_manager),
                         ("ana@example.com", "sup@example.com", "Gerente Teste"))
        self.assertEqual((o.seller_performance, o.fault_type, o.queue.slug), ("No Show Seller", "NSS SPX Fault", "nss-spx-fault"))
        local = o.occurred_at.astimezone(timezone.get_current_timezone())
        self.assertEqual((local.hour, local.minute, local.second), (11, 49, 2))   # horário de Brasília
        self.assertIsNone(o.radius_diff)                                           # "null" não vira 0

    def test_real_row_without_event_instant_is_still_ingested(self):
        self.sync(real_row(done_datestamp="", pickup_start_datestamp=""))
        self.assertIsNone(Occurrence.objects.get().occurred_at)

    def test_only_allowed_types_become_records(self):
        rows = [real_row(pickup_task_id="A", occurrence="Full Pickup"), real_row(pickup_task_id="B", occurrence="No Show Seller"),
                real_row(pickup_task_id="C", occurrence="No Show 3PL"), real_row(pickup_task_id="D", occurrence="Partial Pickup")]
        stats = self.sync(*rows, allowed=("No Show Seller", "No Show 3PL"))
        self.assertEqual(stats, {"created": 2, "updated": 0, "skipped": 0, "ignored": 2})
        self.assertEqual(sorted(Occurrence.objects.values_list("pickup_task_id", flat=True)), ["B", "C"])

    def test_text_ids_are_searchable_and_filterable_through_the_api(self):
        self.sync(real_row(occurrence="No Show Seller", spx_fault="NSS SPX Fault"))
        client = APIClient()
        client.force_authenticate(make_user("x@example.com"))
        count = lambda **p: client.get("/api/occurrences/", p).json()["count"]
        self.assertEqual((count(search="DOP7919"), count(shop_id="DOP7919"), count(search="PT20261021TESTE1"),
                          count(seller_group="DOP7919"), count(search="outro")), (1, 1, 1, 1, 0))
        row = client.get("/api/occurrences/").json()["results"][0]
        self.assertEqual((row["pickup_task_id"], row["shop_id"], row["dispatcher_email"]), ("PT20261021TESTE1", "DOP7919", ""))


@override_settings(DS_API_MODE="")
class DataSuiteAdapterTests(TestCase):
    """Adapter HTTP: envelope tolerante, paginação por cursor, autenticação configurável."""

    def setUp(self):
        super().setUp()
        self._dataservice_mode_override = self.settings(DS_API_MODE="")
        self._dataservice_mode_override.enable()

    def tearDown(self):
        self._dataservice_mode_override.disable()
        super().tearDown()

    def fake_get(self, pages, calls):
        class Response:
            def __init__(self, payload):
                self.payload = payload
                self.status_code = 200
                self.headers = {}

            def raise_for_status(self):
                pass

            def json(self):
                return self.payload

        def get(url, params=None, headers=None, timeout=None):
            calls.append({
                "url": url,
                "params": dict(params or {}),
                "headers": dict(headers or {}),
            })
            index = len(calls) - 1
            payload = pages[index] if index < len(pages) else {"rows": []}
            return Response(payload)

        return get

    def test_extract_rows_accepts_the_usual_envelopes(self):
        from apps.ingestion.sources.datasuite import extract_rows
        item = [{"a": 1}]
        for payload in (item, {"items": item}, {"rows": item}, {"data": item}, {"results": item}, {"qualquer": item}):
            self.assertEqual(extract_rows(payload), item, payload)
        with self.assertRaisesMessage(ValueError, "chaves de nível superior"):
            extract_rows({"erro": "x"})

    @override_settings(
        DS_API_MODE="",
        DS_API_METHOD="GET",
        DS_API_BASE_URL="https://ds.example",
        DS_API_OCCURRENCES_URL="",
        DS_API_OCCURRENCES_PATH="/no-show",
        DS_API_TOKEN="segredo",
        DS_API_EXTRA_HEADERS="{}",
        DS_API_AUTH_HEADER="Authorization",
        DS_API_AUTH_SCHEME="Bearer",
        DS_API_CLIENT_ID="",
DS_API_CLIENT_SECRET=""
    )
    def test_paginates_normalizes_and_authenticates(self):
        from unittest.mock import patch
        from apps.ingestion.sources.datasuite import DataSuiteOccurrenceSource
        calls = []
        pages = [{"rows": [real_row(pickup_task_id="A")], "nextCursor": "p2"}, {"rows": [real_row(pickup_task_id="B")]}]
        with patch("apps.ingestion.sources.datasuite.requests.get", self.fake_get(pages, calls)):
            rows = list(DataSuiteOccurrenceSource().fetch(date(2026, 10, 1), date(2026, 10, 2)))
        self.assertEqual([r["pickup_task_id"] for r in rows], ["A", "B"])
        self.assertEqual(rows[0]["seller_name"], "PROJETO FM TESTE")                     # já normalizada
        self.assertEqual(calls[0]["url"], "https://ds.example/no-show")
        self.assertEqual(calls[0]["headers"], {"Authorization": "Bearer segredo"})
        self.assertNotIn("cursor", calls[0]["params"])
        self.assertEqual(calls[1]["params"]["cursor"], "p2")

    @override_settings(
        DS_API_MODE="",
        DS_API_METHOD="GET",
        DS_API_BASE_URL="https://ds.example",
        DS_API_OCCURRENCES_URL="",
        DS_API_OCCURRENCES_PATH="/no-show",
        DS_API_TOKEN="chave",
        DS_API_EXTRA_HEADERS="{}",
        DS_API_AUTH_HEADER="x-api-key",
        DS_API_AUTH_SCHEME="",
        DS_API_CLIENT_ID="",
DS_API_CLIENT_SECRET=""
    )
    def test_token_can_go_in_a_custom_header_without_scheme(self):
        from unittest.mock import patch
        from apps.ingestion.sources.datasuite import DataSuiteOccurrenceSource
        calls = []
        with patch("apps.ingestion.sources.datasuite.requests.get", self.fake_get([{"rows": []}], calls)):
            list(DataSuiteOccurrenceSource().fetch(date(2026, 10, 1), date(2026, 10, 2)))
        self.assertEqual(calls[0]["headers"], {"x-api-key": "chave"})

    @override_settings(
        DS_API_MODE="",
        DS_API_METHOD="GET",
        DS_API_BASE_URL="https://ds.example",
        DS_API_OCCURRENCES_URL="",
        DS_API_TOKEN="t",
        DS_API_EXTRA_HEADERS="{}",
        DS_API_CLIENT_ID="",
DS_API_CLIENT_SECRET=""
    )
    def test_a_repeated_cursor_does_not_loop_forever(self):
        from unittest.mock import patch
        from apps.ingestion.sources.datasuite import DataSuiteOccurrenceSource
        calls = []
        page = {"rows": [real_row()], "next_cursor": "mesmo"}
        with patch("apps.ingestion.sources.datasuite.requests.get", self.fake_get([page] * 10, calls)):
            list(DataSuiteOccurrenceSource().fetch(date(2026, 10, 1), date(2026, 10, 2)))
        self.assertEqual(len(calls), 2)


class DispatcherEmailTests(BaseCase):
    """A tabela traz o e-mail do dispatcher: o vínculo com quem aciona passa a ser exato."""

    def setUp(self):
        super().setUp()
        self.login("ana@example.com")
        carlos = StationMember.objects.get(email="carlos@example.com").id
        occ = Occurrence.objects.get(pickup_task_id="1001")
        self.client.post(f"/api/occurrences/{occ.id}/contact/", {"member_id": carlos}, format="json")
        opts = occ.queue.options
        self.client.put(f"/api/occurrences/{occ.id}/treatment/", {
            "reversal": opts.get(label="Coletado").id, "justification": opts.get(label="Sinal de GPS").id}, format="json")

    def rows(self):
        return {r["key"]: r for r in self.client.get("/api/indicators/dispatchers/").json()["results"]}

    def test_links_by_email_even_when_the_allocator_name_differs(self):
        Occurrence.objects.filter(dispatcher_email="ana@example.com").update(allocated_by="Alguém com outro nome")
        rows = self.rows()
        ana = rows["email:ana@example.com"]
        self.assertEqual((ana["name"], ana["routes"], ana["messages"], ana["has_routes"], ana["has_actions"]),
                         ("Ana Dispatcher", 3, 1, True, True))           # rotas e ações na MESMA linha
        self.assertEqual(sum(1 for r in rows.values() if r["email"] == "ana@example.com"), 1)

    def test_falls_back_to_the_name_when_the_table_has_no_email(self):
        Occurrence.objects.update(dispatcher_email="")
        ana = next(r for r in self.rows().values() if r["name"] == "Ana Dispatcher")
        self.assertEqual((ana["routes"], ana["messages"], ana["has_routes"], ana["has_actions"]), (3, 1, True, True))

    def test_dispatcher_without_actions_is_still_listed_by_email(self):
        bruno = self.rows()["email:bruno@example.com"]
        self.assertEqual((bruno["routes"], bruno["messages"], bruno["has_actions"]), (2, 0, False))

    def test_mock_carries_the_hierarchy(self):
        o = Occurrence.objects.get(pickup_task_id="1001")
        self.assertEqual((o.dispatcher_email, o.supervisor_email, o.regional_manager),
                         ("ana@example.com", "supervisor.fmh-nsa-01@example.com", "Gerente Regional 4"))


class SyncFromFileTests(TestCase):
    """`sync_ingestion --file`: grava de um JSON salvo da API, com o mesmo filtro de tipos da fonte real."""

    def setUp(self):
        call_command("seed_defaults", verbosity=0)

    def write(self, rows, envelope=True):
        import json
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump({"rows": rows} if envelope else rows, handle)
        handle.close()
        self.addCleanup(Path(handle.name).unlink)
        return handle.name

    def run_cmd(self, *args):
        from io import StringIO
        out = StringIO()
        call_command("sync_ingestion", "--only", "occurrences", *args, stdout=out)
        return out.getvalue()

    def test_loads_api_shaped_rows_and_ignores_other_types(self):
        path = self.write([real_row(pickup_task_id="A", occurrence="No Show Seller", spx_fault="NSS SPX Fault"),
                           real_row(pickup_task_id="B", occurrence="Full Pickup")])
        out = self.run_cmd("--file", path)
        self.assertIn("'created': 1", out)
        self.assertIn("'ignored': 1", out)
        o = Occurrence.objects.get()
        self.assertEqual((o.pickup_task_id, o.shop_id, o.queue.slug), ("A", "DOP7919", "nss-spx-fault"))

    def test_all_types_flag_and_plain_list_envelope(self):
        path = self.write([real_row(pickup_task_id="A", occurrence="Full Pickup")], envelope=False)
        self.assertIn("'ignored': 1", self.run_cmd("--file", path))
        self.assertEqual(Occurrence.objects.count(), 0)
        self.assertIn("'created': 1", self.run_cmd("--file", path, "--all-types"))
        self.assertEqual(Occurrence.objects.count(), 1)

    def test_running_twice_is_idempotent(self):
        path = self.write([real_row(pickup_task_id="A", occurrence="No Show Seller")])
        self.run_cmd("--file", path)
        self.assertIn("'updated': 1", self.run_cmd("--file", path))
        self.assertEqual(Occurrence.objects.count(), 1)


class ProbeAndConfigTests(TestCase):
    """A API real ainda não foi vista: `check_source --probe` mostra só a estrutura, e a chamada é configurável por ambiente."""

    SECRETS = ("DRIVER TESTE", "11900000000", "Gerente Teste", "segredo-do-token", "ana@example.com")

    def fake_response(self, status=200, payload=None, text="", content_type="application/json", extra_headers=None):
        class Response:
            status_code = status
              status_code = 200
            headers = {"content-type": content_type, **(extra_headers or {})}
            def __init__(self): self.text = text
            def json(self):
                if payload is None:
                    raise ValueError("sem json")
                return payload
        return Response()

    def run_probe(self, response):
        from io import StringIO
        from unittest.mock import patch
        out = StringIO()
        with patch("apps.ingestion.management.commands.check_source.request_page", return_value=response):
            call_command("check_source", "--probe", stdout=out)
        return out.getvalue()

    def test_describe_never_shows_values(self):
        from apps.ingestion.probe import describe
        payload = {"rows": [real_row(driver_name="DRIVER TESTE")], "next_cursor": None, "total": 12, "ok": True}
        text = "\n".join(describe(payload))
        self.assertIn("rows: lista de 1", text)
        self.assertIn("driver_name: texto", text)
        self.assertIn("total: inteiro", text)
        self.assertIn("next_cursor: nulo", text)
        for secret in self.SECRETS:
            self.assertNotIn(secret, text)

    @override_settings(DS_API_OCCURRENCES_URL="https://ds.example/api/x", DS_API_TOKEN="segredo-do-token", DS_API_METHOD="POST")
    def test_probe_prints_structure_and_header_names_only(self):
        out = self.run_probe(self.fake_response(payload={"rows": [real_row(dispatcher_email_address="ana@example.com")], "nextCursor": "p2"}))
        self.assertIn("POST https://ds.example/api/x", out)
        self.assertIn("Cabeçalhos enviados (só os nomes): Authorization", out)
        self.assertIn("HTTP 200", out)
        self.assertIn("Lista de linhas reconhecida: 1 linha(s)", out)
        self.assertIn("Próxima página: sim", out)
        for secret in self.SECRETS:
            self.assertNotIn(secret, out)   # nem o token, nem valores das linhas

    def test_probe_reports_http_errors_and_non_json_and_unknown_envelopes(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management.base import CommandError
        cases = [(self.fake_response(status=401, text='{"message":"invalid token"}'), "401"),
                 (self.fake_response(status=200, text="<html>", content_type="text/html"), "não é JSON"),
                 (self.fake_response(payload={"erro": "x"}), "chaves de nível superior")]
        for response, needle in cases:
            with patch("apps.ingestion.management.commands.check_source.request_page", return_value=response):
                with self.assertRaises(CommandError) as ctx:
                    call_command("check_source", "--probe", stdout=StringIO())
            self.assertIn(needle, str(ctx.exception))

    def test_probe_warns_when_no_credentials_are_configured(self):
        out = self.run_probe(self.fake_response(payload={"rows": []}))
        self.assertIn("faltam credenciais", out)

    @override_settings(DS_API_BASE_URL="https://ds.example", DS_API_OCCURRENCES_PATH="/ignorado", DS_API_OCCURRENCES_URL="https://ds.example/dataservice/abc")
    def test_full_url_wins_over_base_plus_path(self):
        from apps.ingestion.sources.datasuite import occurrences_url
        self.assertEqual(occurrences_url(), "https://ds.example/dataservice/abc")

    @override_settings(DS_API_BASE_URL="https://ds.example", DS_API_TOKEN="t", DS_API_METHOD="POST",
                       DS_API_BODY='{"pageSize": 500}', DS_API_EXTRA_PARAMS='{"fmt": "json"}',
                       DS_API_EXTRA_HEADERS='{"X-App-Key": "k1"}', DS_API_OCCURRENCES_URL="https://ds.example/dataservice/abc")
    def test_post_with_body_extra_params_and_extra_headers(self):
        from unittest.mock import patch
        from apps.ingestion.sources.datasuite import DataSuiteOccurrenceSource
        seen = {}
        class Response:
            def raise_for_status(self): pass
            def json(self): return {"rows": [real_row()]}
        def post(url, json=None, params=None, headers=None, timeout=None):
            seen.update(url=url, json=json, params=params, headers=headers)
            return Response()
        with patch("apps.ingestion.sources.datasuite.requests.post", post):
            rows = list(DataSuiteOccurrenceSource().fetch(date(2026, 10, 1), date(2026, 10, 2)))
        self.assertEqual(len(rows), 1)
        self.assertEqual((seen["url"], seen["json"], seen["params"]), ("https://ds.example/dataservice/abc", {"pageSize": 500}, {"fmt": "json"}))
        self.assertEqual(seen["headers"], {"Authorization": "Bearer t", "X-App-Key": "k1"})

    @override_settings(DS_API_BASE_URL="https://ds.example", DS_API_TOKEN="t")
    def test_date_params_are_not_sent_unless_asked(self):
        from unittest.mock import patch
        from apps.ingestion.sources.datasuite import DataSuiteOccurrenceSource
        calls = []
        class Response:
            def raise_for_status(self): pass
            def json(self): return {"rows": []}
        def get(url, params=None, headers=None, timeout=None):
            calls.append(dict(params)); return Response()
        with patch("apps.ingestion.sources.datasuite.requests.get", get):
            list(DataSuiteOccurrenceSource().fetch(date(2026, 10, 1), date(2026, 10, 2)))
            with self.settings(DS_API_SEND_DATE_PARAMS=True):
                list(DataSuiteOccurrenceSource().fetch(date(2026, 10, 1), date(2026, 10, 2)))
        self.assertEqual(calls[0], {})
        self.assertEqual(calls[1], {"date_from": "2026-10-01", "date_to": "2026-10-02"})

    @override_settings(DS_API_EXTRA_HEADERS='{"X-Key": "valor-secreto" ')
    def test_invalid_json_setting_fails_without_leaking_its_value(self):
        from django.core.exceptions import ImproperlyConfigured
        from apps.ingestion.sources.datasuite import request_headers
        with self.assertRaises(ImproperlyConfigured) as ctx:
            request_headers()
        self.assertIn("DS_API_EXTRA_HEADERS", str(ctx.exception))
        self.assertNotIn("valor-secreto", str(ctx.exception))

    def test_probe_shows_the_authentication_challenge_when_the_api_sends_one(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management.base import CommandError
        response = self.fake_response(status=401, text="unauthorized", extra_headers={"www-authenticate": 'Bearer realm="datasuite"'})
        out = StringIO()
        with patch("apps.ingestion.management.commands.check_source.request_page", return_value=response):
            with self.assertRaises(CommandError):
                call_command("check_source", "--probe", stdout=out)
        self.assertIn('WWW-Authenticate (diz qual autenticação a API espera): Bearer realm="datasuite"', out.getvalue())

    @override_settings(DS_API_BASE_URL="https://ds.example", DS_API_METHOD="POST", DS_API_BODY="", DS_API_OCCURRENCES_URL="https://ds.example/x")
    def test_post_without_configured_body_still_sends_an_empty_json_object(self):
        from unittest.mock import patch
        from apps.ingestion.sources.datasuite import request_page
        seen = {}
        def post(url, json="NÃO ENVIADO", params=None, headers=None, timeout=None):
            seen["json"] = json
            return object()
        with patch("apps.ingestion.sources.datasuite.requests.post", post):
            request_page("https://ds.example/x")
        self.assertEqual(seen["json"], {})   # {} (Content-Type JSON), não None


class TokenFormatTests(TestCase):
    """"Bearer token is malformed": a API recusa o FORMATO do token. Diagnóstico e limpeza sem nunca expor o valor."""

    JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.c2lnbmF0dXJl"

    def test_clean_token_removes_the_usual_pasting_mistakes(self):
        from apps.ingestion.sources.datasuite import clean_token
        self.assertEqual(clean_token(self.JWT), (self.JWT, []))
        self.assertEqual(clean_token(f"Bearer {self.JWT}")[0], self.JWT)                 # prefixo repetido
        self.assertEqual(clean_token(f'  "{self.JWT}"  ')[0], self.JWT)                  # aspas e espaços
        self.assertEqual(clean_token(f"{self.JWT[:20]}\n{self.JWT[20:]}")[0], self.JWT)  # quebra de linha no meio
        self.assertIn('prefixo "Bearer "', clean_token(f"bearer {self.JWT}")[1][0])

    def test_token_report_flags_placeholder_and_bad_charset_without_leaking(self):
        from apps.ingestion.sources.datasuite import token_report
        good = token_report(self.JWT)
        self.assertEqual((good["segments"], good["looks_like_jwt"], good["valid_bearer_charset"], good["looks_like_placeholder"]),
                         (3, True, True, False))
        sample = token_report("<cole aqui o token>")
        self.assertTrue(sample["looks_like_placeholder"])
        self.assertNotIn("cole", str(sample))   # o relatório nunca devolve o valor
        self.assertFalse(token_report("abc$def").get("valid_bearer_charset"))

    def test_header_is_built_from_the_cleaned_token(self):
        from apps.ingestion.sources.datasuite import request_headers
        with self.settings(DS_API_TOKEN=f'Bearer "{self.JWT}"\n', DS_API_AUTH_SCHEME="Bearer", DS_API_AUTH_HEADER="Authorization"):
            self.assertEqual(request_headers(), {"Authorization": f"Bearer {self.JWT}"})   # nunca "Bearer Bearer ..."

    def test_probe_diagnoses_the_token_shape_but_never_prints_it(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management.base import CommandError
        class Response:
            status_code = 401
            headers = {"www-authenticate": 'Bearer error="invalid_token", error_description="Bearer token is malformed"'}
            text = ""
        with self.settings(DS_API_TOKEN="<cole aqui o token>", DS_API_OCCURRENCES_URL="https://ds.example/x"):
            out = StringIO()
            with patch("apps.ingestion.management.commands.check_source.request_page", return_value=Response()):
                with self.assertRaises(CommandError):
                    call_command("check_source", "--probe", stdout=out)
        text = out.getvalue()
        self.assertIn("TEXTO DE EXEMPLO", text)
        self.assertIn("Dica: a API recusou o TOKEN", text)
        self.assertNotIn("cole aqui o token", text)

        with self.settings(DS_API_TOKEN=f"Bearer {self.JWT}", DS_API_OCCURRENCES_URL="https://ds.example/x"):
            out = StringIO()
            with patch("apps.ingestion.management.commands.check_source.request_page", return_value=Response()):
                with self.assertRaises(CommandError):
                    call_command("check_source", "--probe", stdout=out)
        text = out.getvalue()
        self.assertIn("3 segmento(s)", text)
        self.assertIn("(parece um JWT)", text)
        self.assertIn('removi do token antes de enviar: prefixo "Bearer "', text)
        self.assertNotIn(self.JWT, text)                    # nem o token inteiro...
        self.assertNotIn(self.JWT.split(".")[0], text)      # ...nem um pedaço