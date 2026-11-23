import os
import csv
import json
import time
import uuid
import asyncio
import threading
from typing import Dict, Any, List, Optional, Generator
import database
from ws_manager import ws_manager
from contacts_service import contacts_service, sanitize_phone
from excel_service import clean_phone_digits

TEMP_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_uploads")
os.makedirs(TEMP_UPLOADS_DIR, exist_ok=True)

class IngestionService:
    def __init__(self):
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def _broadcast_event(self, message: Dict[str, Any]):
        """Thread-safe WebSocket broadcaster."""
        if not self._loop or self._loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(message), self._loop)
        except Exception as e:
            print(f"[IngestionService] Broadcast error: {e}")

    # -------------------------------------------------------------
    # 1. STREAMING ROW PARSERS (MEMORY-SAFE FOR 100K+ ROWS)
    # -------------------------------------------------------------
    def estimate_total_rows(self, file_path: str, filename: str) -> int:
        """Fast row counter that streams without memory bloat."""
        fn = filename.lower()
        try:
            if fn.endswith(".csv"):
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    count = sum(1 for _ in f)
                    return max(0, count - 1)
            elif fn.endswith((".xlsx", ".xls")):
                import openpyxl
                wb = openpyxl.load_workbook(file_path, read_only=True)
                ws = wb.active
                count = 0
                for row in ws.iter_rows(values_only=True):
                    if any(row):
                        count += 1
                wb.close()
                return max(0, count - 1)
        except Exception as e:
            print(f"[IngestionService] Error counting rows: {e}")
        return 0

    def stream_rows(self, file_path: str, filename: str) -> Generator[Dict[str, Any], None, None]:
        """Generator yielding row dicts line by line with zero RAM buildup."""
        fn = filename.lower()
        if fn.endswith(".csv"):
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row and any(row.values()):
                        yield {str(k).strip(): v for k, v in row.items() if k}
        elif fn.endswith((".xlsx", ".xls")):
            import openpyxl
            wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            header_row = next(rows_iter, None)
            if not header_row:
                wb.close()
                return
            headers = [str(c or "").strip() for c in header_row]
            for row in rows_iter:
                if any(row):
                    row_dict = {
                        headers[i]: row[i] 
                        for i in range(len(headers)) 
                        if i < len(row) and headers[i]
                    }
                    yield row_dict
            wb.close()

    # -------------------------------------------------------------
    # 2. CONTACTS CRM INGESTION WORKER (100K SCALE)
    # -------------------------------------------------------------
    def run_contacts_ingestion(self, job_id: str, file_path: str, filename: str, column_mapping: Dict[str, str]):
        """Runs background ingestion for Contacts CRM."""
        database.update_import_job(job_id, {"status": "processing"})
        self._broadcast_event({
            "type": "import_job_progress",
            "job_id": job_id,
            "status": "processing",
            "processed": 0,
            "total": 0,
            "percent": 0.0
        })

        BATCH_SIZE = 2000
        total_rows = self.estimate_total_rows(file_path, filename)
        database.update_import_job(job_id, {"total_rows": total_rows})

        # Auto-register new custom columns into fields meta
        try:
            existing_fields = {f["field_key"]: f for f in contacts_service.get_fields_meta()}
            standard_keys = ["phone_number", "name", "phone", "mobile", "student_name"]
            for file_col, target_key in column_mapping.items():
                if target_key not in standard_keys and target_key not in existing_fields:
                    contacts_service.create_field_meta(label=file_col, field_type="text")
        except Exception as e:
            print(f"[IngestionService] Metadata sync notice: {e}")

        processed_count = 0
        inserted_count = 0
        skipped_count = 0
        current_chunk: List[Dict[str, Any]] = []

        try:
            for row in self.stream_rows(file_path, filename):
                processed_count += 1
                current_chunk.append(row)

                if len(current_chunk) >= BATCH_SIZE:
                    ins, skp = self._process_contacts_chunk(current_chunk, column_mapping)
                    inserted_count += ins
                    skipped_count += skp
                    current_chunk = []

                    pct = round((processed_count / total_rows * 100), 1) if total_rows > 0 else 0.0
                    database.update_import_job(job_id, {
                        "processed_rows": processed_count,
                        "inserted_rows": inserted_count,
                        "skipped_rows": skipped_count
                    })
                    self._broadcast_event({
                        "type": "import_job_progress",
                        "job_id": job_id,
                        "status": "processing",
                        "processed": processed_count,
                        "total": total_rows,
                        "percent": pct,
                        "inserted": inserted_count,
                        "skipped": skipped_count
                    })
                    time.sleep(0.01)

            # Process remaining rows
            if current_chunk:
                ins, skp = self._process_contacts_chunk(current_chunk, column_mapping)
                inserted_count += ins
                skipped_count += skp

            database.update_import_job(job_id, {
                "status": "completed",
                "processed_rows": processed_count,
                "inserted_rows": inserted_count,
                "skipped_rows": skipped_count,
                "total_rows": max(total_rows, processed_count)
            })

            self._broadcast_event({
                "type": "import_job_completed",
                "job_id": job_id,
                "status": "completed",
                "total": max(total_rows, processed_count),
                "processed": processed_count,
                "inserted": inserted_count,
                "skipped": skipped_count
            })

        except Exception as e:
            print(f"[IngestionService] Ingestion failed for job {job_id}: {e}")
            database.update_import_job(job_id, {
                "status": "failed",
                "error_message": str(e)
            })
            self._broadcast_event({
                "type": "import_job_failed",
                "job_id": job_id,
                "status": "failed",
                "error": str(e)
            })
        finally:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

    def _process_contacts_chunk(self, chunk: List[Dict[str, Any]], column_mapping: Dict[str, str]) -> (int, int):
        from supabase_client import supabase
        contacts_payload = []
        skipped = 0

        for r in chunk:
            phone_raw = None
            name_raw = ""
            attributes = {}

            for col, val in r.items():
                target = column_mapping.get(col, col.strip().lower().replace(" ", "_"))
                val_str = str(val).strip() if val is not None else ""

                if target in ["phone_number", "phone", "mobile"]:
                    phone_raw = val_str
                elif target in ["name", "student_name"]:
                    name_raw = val_str
                elif val_str:
                    attributes[target] = val_str

            if not phone_raw:
                skipped += 1
                continue

            phone_clean = sanitize_phone(phone_raw)
            if not phone_clean:
                skipped += 1
                continue

            contacts_payload.append({
                "phone_number": phone_clean,
                "name": name_raw,
                "attributes": attributes
            })

        inserted = 0
        if contacts_payload:
            try:
                res = supabase.upsert("contacts", contacts_payload, on_conflict="phone_number")
                inserted = len(contacts_payload) if res is not None else len(contacts_payload)
            except Exception as e:
                print(f"[Supabase] Chunk upsert error: {e}")
                # Fallback to half-sized chunks on network error
                mid = len(contacts_payload) // 2
                if mid > 0:
                    try:
                        supabase.upsert("contacts", contacts_payload[:mid], on_conflict="phone_number")
                        supabase.upsert("contacts", contacts_payload[mid:], on_conflict="phone_number")
                        inserted = len(contacts_payload)
                    except Exception:
                        pass

        return inserted, skipped

    # -------------------------------------------------------------
    # 3. CAMPAIGN LEADS INGESTION WORKER (100K SCALE)
    # -------------------------------------------------------------
    def run_campaign_leads_ingestion(self, job_id: str, campaign_id: str, file_path: str, filename: str, force_override: bool = False):
        """Runs background ingestion for Campaign Leads with policy validation."""
        database.update_import_job(job_id, {"status": "processing"})
        self._broadcast_event({
            "type": "import_job_progress",
            "job_id": job_id,
            "campaign_id": campaign_id,
            "status": "processing",
            "processed": 0,
            "total": 0,
            "percent": 0.0
        })

        camp = database.get_campaign(campaign_id)
        if not camp:
            database.update_import_job(job_id, {"status": "failed", "error_message": "Campaign not found"})
            return

        policies = {
            "dedup_intra_campaign": camp.get("dedup_intra_campaign", 1) == 1,
            "dedup_cross_active": camp.get("dedup_cross_active", 1) == 1,
            "enable_cooldown": camp.get("enable_cooldown", 1) == 1,
            "cooldown_answered_hours": camp.get("cooldown_answered_hours", 24),
            "cooldown_missed_hours": camp.get("cooldown_missed_hours", 2),
            "exclude_dnd": camp.get("exclude_dnd", 1) == 1,
            "force_override": bool(force_override)
        }

        BATCH_SIZE = 2000
        total_rows = self.estimate_total_rows(file_path, filename)
        database.update_import_job(job_id, {"total_rows": total_rows})

        processed_count = 0
        enqueued_count = 0
        skipped_count = 0
        current_chunk: List[Dict[str, Any]] = []

        try:
            for row in self.stream_rows(file_path, filename):
                processed_count += 1
                current_chunk.append(row)

                if len(current_chunk) >= BATCH_SIZE:
                    enq, skp = self._process_campaign_chunk(current_chunk, campaign_id, policies)
                    enqueued_count += enq
                    skipped_count += skp
                    current_chunk = []

                    pct = round((processed_count / total_rows * 100), 1) if total_rows > 0 else 0.0
                    database.update_import_job(job_id, {
                        "processed_rows": processed_count,
                        "inserted_rows": enqueued_count,
                        "skipped_rows": skipped_count
                    })
                    database.sync_campaign_counters(campaign_id)
                    self._broadcast_event({
                        "type": "import_job_progress",
                        "job_id": job_id,
                        "campaign_id": campaign_id,
                        "status": "processing",
                        "processed": processed_count,
                        "total": total_rows,
                        "percent": pct,
                        "enqueued": enqueued_count,
                        "skipped": skipped_count
                    })
                    time.sleep(0.01)

            # Process remaining rows
            if current_chunk:
                enq, skp = self._process_campaign_chunk(current_chunk, campaign_id, policies)
                enqueued_count += enq
                skipped_count += skp

            database.sync_campaign_counters(campaign_id)
            database.update_import_job(job_id, {
                "status": "completed",
                "processed_rows": processed_count,
                "inserted_rows": enqueued_count,
                "skipped_rows": skipped_count,
                "total_rows": max(total_rows, processed_count)
            })

            self._broadcast_event({
                "type": "import_job_completed",
                "job_id": job_id,
                "campaign_id": campaign_id,
                "status": "completed",
                "total": max(total_rows, processed_count),
                "processed": processed_count,
                "enqueued": enqueued_count,
                "skipped": skipped_count
            })

        except Exception as e:
            print(f"[IngestionService] Campaign ingestion failed for {job_id}: {e}")
            database.update_import_job(job_id, {
                "status": "failed",
                "error_message": str(e)
            })
            self._broadcast_event({
                "type": "import_job_failed",
                "job_id": job_id,
                "campaign_id": campaign_id,
                "status": "failed",
                "error": str(e)
            })
        finally:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

    def _process_campaign_chunk(self, chunk: List[Dict[str, Any]], campaign_id: str, policies: Dict[str, Any]) -> (int, int):
        candidates = []
        for r in chunk:
            phone_val = ""
            name_val = ""
            for k, v in r.items():
                k_lower = k.lower()
                if "phone" in k_lower or "mobile" in k_lower or "contact" in k_lower:
                    phone_val = str(v or "").strip()
                elif "name" in k_lower:
                    name_val = str(v or "").strip()
                elif not phone_val and any(c.isdigit() for c in str(v or "")):
                    # Extract digits if potential phone
                    dig = clean_phone_digits(str(v or ""))
                    if len(dig) >= 10:
                        phone_val = dig

            if phone_val:
                clean = clean_phone_digits(phone_val)
                if len(clean) >= 10:
                    candidates.append({"phone_number": clean, "name": name_val})

        if not candidates:
            return 0, len(chunk)

        eligible, skipped, _ = contacts_service.evaluate_lead_eligibility(candidates, campaign_id, policies)
        enqueued = 0
        if eligible:
            sqlite_batch = [(l["phone_number"], l.get("name", "")) for l in eligible]
            enqueued = database.bulk_insert_leads(campaign_id, sqlite_batch)

        return enqueued, len(skipped)

    # -------------------------------------------------------------
    # 4. THREAD-LAUNCHERS
    # -------------------------------------------------------------
    def start_contacts_job(self, job_id: str, file_path: str, filename: str, column_mapping: Dict[str, str]):
        t = threading.Thread(
            target=self.run_contacts_ingestion,
            args=(job_id, file_path, filename, column_mapping),
            daemon=True
        )
        t.start()

    def start_campaign_leads_job(self, job_id: str, campaign_id: str, file_path: str, filename: str, force_override: bool = False):
        t = threading.Thread(
            target=self.run_campaign_leads_ingestion,
            args=(job_id, campaign_id, file_path, filename, force_override),
            daemon=True
        )
        t.start()

ingestion_service = IngestionService()
