"""
Contacts CRM, Custom Datapoint Schema, and Audience Segmentation Engine
Handles 100k-200k leads, dynamic JSONB filtering, live audience counts, and timeline retrieval.
"""
import uuid
import re
import io
import csv
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from supabase_client import supabase

def parse_call_datetime(dt_val: Any) -> Optional[datetime]:
    if not dt_val:
        return None
    s = str(dt_val).strip()
    if not s or s.lower() in ("none", "null"):
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    try:
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
        from database import IST
        return dt.replace(tzinfo=IST)
    except Exception:
        pass
    return None

def sanitize_phone(phone: Any) -> str:
    """Normalizes phone numbers to standard 10-12 digit string."""
    digits = re.sub(r"\D", "", str(phone or ""))
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    if len(digits) > 10 and digits.startswith("0"):
        return f"91{digits[1:]}"
    return digits

class ContactsService:
    STANDARD_COLUMNS = {
        "phone_number", "name", "last_call_status", "last_dtmf",
        "total_calls_count", "created_at", "last_call_time"
    }

    # -------------------------------------------------------------
    # 1. CUSTOM DATAPOINT SCHEMA MANAGEMENT & DYNAMIC DISCOVERY
    # -------------------------------------------------------------
    def get_fields_meta(self) -> List[Dict[str, Any]]:
        """Returns all configured contact datapoint definitions."""
        res = supabase.select("contact_fields_meta", {"order": "display_order.asc"})
        if not res:
            # Fallback default fields if empty
            return [
                {"field_key": "gender", "label": "Gender", "field_type": "select", "options": ["Male", "Female", "Other"], "is_filter_enabled": True},
                {"field_key": "community", "label": "Community / Category", "field_type": "select", "options": ["General", "OBC", "SC", "ST", "EWS"], "is_filter_enabled": True},
                {"field_key": "stream", "label": "Academic Stream", "field_type": "select", "options": ["Science", "Commerce", "Arts", "Vocational"], "is_filter_enabled": True},
                {"field_key": "school", "label": "School / College", "field_type": "text", "options": [], "is_filter_enabled": True},
                {"field_key": "city", "label": "City / District", "field_type": "text", "options": [], "is_filter_enabled": True},
                {"field_key": "marks", "label": "Marks / Percentage", "field_type": "number", "options": [], "is_filter_enabled": True}
            ]
        return res

    def get_all_filter_fields(self) -> List[Dict[str, Any]]:
        """
        Returns EVERY filterable attribute connected to a contact:
        1. Core contact identity (phone_number, name, created_at)
        2. Telecom & Call history (last_call_status, last_dtmf, total_calls_count, last_call_time)
        3. Custom Datapoints from schema (stream, community, gender, school, city, marks...)
        4. Dynamically discovered attributes present in contacts table
        """
        fields: List[Dict[str, Any]] = [
            # --- CALL ACTIVITY & TELECOM ---
            {
                "field_key": "last_call_status",
                "label": "Last Call Status",
                "category": "Call Activity & DTMF",
                "field_type": "select",
                "is_standard": True,
                "options": ["answered", "missed", "no_answer", "busy", "unreachable", "failed", "pending", "never_called"]
            },
            {
                "field_key": "last_dtmf",
                "label": "Last DTMF Key Pressed",
                "category": "Call Activity & DTMF",
                "field_type": "select",
                "is_standard": True,
                "options": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"]
            },
            {
                "field_key": "total_calls_count",
                "label": "Total Times Called",
                "category": "Call Activity & DTMF",
                "field_type": "number",
                "is_standard": True,
                "options": ["0", "1", "2", "3", "4", "5+"]
            },
            {
                "field_key": "last_call_time",
                "label": "Last Call Time",
                "category": "Call Activity & DTMF",
                "field_type": "date",
                "is_standard": True,
                "options": []
            },
            # --- CORE CONTACT DETAILS ---
            {
                "field_key": "name",
                "label": "Contact Name",
                "category": "Core Contact Details",
                "field_type": "text",
                "is_standard": True,
                "options": []
            },
            {
                "field_key": "phone_number",
                "label": "Phone Number",
                "category": "Core Contact Details",
                "field_type": "text",
                "is_standard": True,
                "options": []
            },
            {
                "field_key": "created_at",
                "label": "Registration / Date Added",
                "category": "Core Contact Details",
                "field_type": "date",
                "is_standard": True,
                "options": []
            }
        ]

        # --- CUSTOM DATAPOINTS FROM SCHEMA ---
        custom_meta = self.get_fields_meta()
        existing_keys = {f["field_key"] for f in fields}

        for cm in custom_meta:
            k = cm.get("field_key")
            if not k or k in existing_keys:
                continue
            existing_keys.add(k)
            fields.append({
                "id": cm.get("id"),
                "field_key": k,
                "label": cm.get("label") or k.replace("_", " ").title(),
                "category": "Custom Datapoints",
                "field_type": cm.get("field_type") or "text",
                "is_standard": False,
                "options": cm.get("options") or [],
                "is_filter_enabled": cm.get("is_filter_enabled", True)
            })

        # --- DYNAMICALLY DISCOVER ANY UNREGISTERED JSONB ATTRIBUTES IN CONTACTS ---
        try:
            sample_rows = supabase.select("contacts", {"select": "attributes", "limit": 100})
            for r in sample_rows:
                attrs = r.get("attributes") or {}
                for ak in attrs.keys():
                    if ak and ak not in existing_keys:
                        existing_keys.add(ak)
                        fields.append({
                            "field_key": ak,
                            "label": ak.replace("_", " ").title(),
                            "category": "Custom Datapoints",
                            "field_type": "text",
                            "is_standard": False,
                            "options": [],
                            "is_filter_enabled": True
                        })
        except Exception:
            pass

        return fields

    _distinct_cache: Dict[str, Any] = {}

    @classmethod
    def invalidate_distinct_cache(cls, field_key: Optional[str] = None):
        """Invalidates in-memory distinct values cache for a specific field or all fields."""
        if field_key:
            prefix = f"{field_key}:"
            keys_to_del = [k for k in cls._distinct_cache if k.startswith(prefix)]
            for k in keys_to_del:
                cls._distinct_cache.pop(k, None)
        else:
            cls._distinct_cache.clear()

    def get_distinct_field_values(
        self,
        field_key: str,
        limit: int = 2000,
        search: Optional[str] = None,
        refresh: bool = False
    ) -> List[str]:
        """Dynamically fetches distinct existing values for any contact field or JSONB attribute with in-memory caching."""
        if field_key == "last_call_status":
            all_statuses = ["answered", "missed", "no_answer", "busy", "unreachable", "failed", "pending", "never_called"]
            if search:
                return [s for s in all_statuses if search.lower() in s.lower()]
            return all_statuses
        if field_key == "last_dtmf":
            all_dtmf = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"]
            if search:
                return [d for d in all_dtmf if search in d]
            return all_dtmf

        # Fast in-memory cache lookup (5-minute TTL, bypassed if refresh=True)
        cache_key = f"{field_key}:{search or ''}:{limit}"
        now_ts = time.time()
        if not refresh and cache_key in self._distinct_cache:
            ts, cached_vals = self._distinct_cache[cache_key]
            if now_ts - ts < 300:
                return cached_vals

        values_set = set()
        # 1. Start with configured options if available
        known_meta = {f["field_key"]: f for f in self.get_fields_meta()}
        if field_key in known_meta and known_meta[field_key].get("options"):
            for opt in known_meta[field_key]["options"]:
                if opt and (not search or search.lower() in str(opt).lower()):
                    values_set.add(str(opt).strip())

        # 2. Query distinct values from actual database rows
        try:
            if field_key in self.STANDARD_COLUMNS:
                for offset in range(0, 6000, 1000):
                    params = {
                        "select": field_key,
                        "limit": 1000,
                        "offset": offset,
                        f"{field_key}": "not.is.null"
                    }
                    if search:
                        params[f"{field_key}"] = f"ilike.*{search}*"
                    rows = supabase.select("contacts", params)
                    if not rows:
                        break
                    for r in rows:
                        v = r.get(field_key)
                        if v is not None and str(v).strip():
                            values_set.add(str(v).strip())
                    if len(values_set) >= limit or len(rows) < 1000:
                        break
            else:
                # Target the exact JSONB property directly without pulling full objects
                params = {
                    "select": f"attributes->{field_key}",
                    f"attributes->>{field_key}": "not.is.null",
                    "limit": 1000
                }
                if search:
                    params[f"attributes->>{field_key}"] = f"ilike.*{search}*"

                # Page through up to 8 batches (up to 8,000 candidate contacts) to discover diverse values
                for offset in range(0, 8000, 1000):
                    params["offset"] = offset
                    rows = supabase.select("contacts", params)
                    if not rows:
                        break
                    for r in rows:
                        v = r.get(field_key)
                        if v is not None and str(v).strip():
                            values_set.add(str(v).strip())
                    if len(values_set) >= limit or len(rows) < 1000:
                        break
        except Exception as e:
            print(f"[Supabase] Error fetching distinct values for {field_key}: {e}")

        result = sorted(list(values_set))[:limit]
        self._distinct_cache[cache_key] = (now_ts, result)
        return result

    def create_field_meta(self, label: str, field_type: str = "text", options: Optional[List[str]] = None) -> Dict[str, Any]:
        """Creates a new custom datapoint definition."""
        field_key = re.sub(r"[^a-zA-Z0-9_]", "", label.strip().lower().replace(" ", "_"))
        if not field_key:
            field_key = f"field_{uuid.uuid4().hex[:6]}"
        payload = {
            "field_key": field_key,
            "label": label.strip(),
            "field_type": field_type,
            "options": options or [],
            "is_filter_enabled": True,
            "display_order": 10
        }
        res = supabase.upsert("contact_fields_meta", payload, on_conflict="field_key")
        self.invalidate_distinct_cache(field_key)
        return res[0] if res else payload

    def update_field_meta(self, field_id: str, updates: Dict[str, Any]) -> bool:
        """Updates an existing datapoint label, options, or filter status."""
        match = {"id": field_id} if (len(field_id) == 36 and "-" in field_id) else {"field_key": field_id}
        ok = supabase.update("contact_fields_meta", match, updates)
        if ok:
            self.invalidate_distinct_cache()
        return ok

    def delete_field_meta(self, field_id: str) -> bool:
        """Removes a custom datapoint definition."""
        match = {"id": field_id} if (len(field_id) == 36 and "-" in field_id) else {"field_key": field_id}
        ok = supabase.delete("contact_fields_meta", match)
        if ok:
            self.invalidate_distinct_cache()
        return ok

    # -------------------------------------------------------------
    # 2. AUDIENCE FILTER BUILDER & "CHECK COUNT"
    # -------------------------------------------------------------
    def _build_postgrest_filters(self, filter_rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Translates user UI filter rules into PostgREST query parameters."""
        params: Dict[str, Any] = {}
        for rule in filter_rules:
            field = rule.get("field")
            op = rule.get("operator", "equals")
            val = rule.get("value")
            vals = rule.get("values") or []

            if not field:
                continue

            # Target standard column or JSONB attribute
            param_key = field if field in self.STANDARD_COLUMNS else f"attributes->>{field}"

            # 1. EMPTY / NOT EMPTY checks (no value required)
            if op in ["is_empty", "null"]:
                params[param_key] = "is.null"
                continue
            if op in ["is_not_empty", "not_null"]:
                params[param_key] = "not.is.null"
                continue

            # 2. SPECIAL HANDLING FOR LAST CALL STATUS 'never_called'
            if field == "last_call_status":
                if val == "never_called":
                    params[param_key] = "is.null"
                    continue
                elif op in ["not_equals", "neq"] and val == "never_called":
                    params[param_key] = "not.is.null"
                    continue

            # 3. MULTI-VALUE 'IN'
            if op in ["in", "any_of"]:
                clean_vals = [str(v).strip() for v in (vals or []) if str(v).strip()]
                if not clean_vals and val:
                    clean_vals = [str(val).strip()]
                if clean_vals:
                    val_str = ",".join(clean_vals)
                    params[param_key] = f"in.({val_str})"
                continue

            # For remaining operators, require a value
            if val is None or str(val).strip() == "":
                continue
            val_str = str(val).strip()

            # 4. COMPREHENSIVE OPERATORS
            if op in ["equals", "eq"]:
                params[param_key] = f"eq.{val_str}"
            elif op in ["not_equals", "neq"]:
                params[param_key] = f"neq.{val_str}"
            elif op in ["contains", "ilike"]:
                params[param_key] = f"ilike.*{val_str}*"
            elif op in ["starts_with"]:
                params[param_key] = f"ilike.{val_str}*"
            elif op in ["ends_with"]:
                params[param_key] = f"ilike.*{val_str}"
            elif op in ["greater_than", "gt"]:
                params[param_key] = f"gt.{val_str}"
            elif op in ["less_than", "lt"]:
                params[param_key] = f"lt.{val_str}"
            elif op in ["greater_than_or_equal", "gte"]:
                params[param_key] = f"gte.{val_str}"
            elif op in ["less_than_or_equal", "lte"]:
                params[param_key] = f"lte.{val_str}"

        return params

    def check_audience_count(self, filter_rules: List[Dict[str, Any]]) -> int:
        """
        Executes sub-50ms count preview of matching contacts for campaign segmentation.
        """
        params = self._build_postgrest_filters(filter_rules)
        return supabase.count("contacts", params)

    # -------------------------------------------------------------
    # 3. MASTER CONTACTS CRM & TIMELINE
    # -------------------------------------------------------------
    def get_paginated_contacts(
        self,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        filter_rules: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """High-speed paginated query of master contacts with dynamic attribute filtering."""
        page = max(1, page)
        limit = max(1, min(200, page_size))
        offset = (page - 1) * limit

        params: Dict[str, Any] = {
            "order": "created_at.desc",
            "limit": limit,
            "offset": offset
        }

        if filter_rules:
            params.update(self._build_postgrest_filters(filter_rules))

        if search and search.strip():
            term = search.strip()
            # PostgREST OR filter for phone or name
            params["or"] = f"(phone_number.ilike.*{term}*,name.ilike.*{term}*)"

        items = supabase.select("contacts", params)
        total_count = supabase.count("contacts", {k: v for k, v in params.items() if k not in ["limit", "offset", "order"]})
        total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

        return {
            "items": items,
            "total_count": total_count,
            "page": page,
            "limit": limit,
            "total_pages": total_pages
        }

    def get_contact_timeline(self, contact_id: str) -> Dict[str, Any]:
        """Fetches full contact profile and chronological lifetime call history."""
        # 1. Contact profile
        contact = supabase.select_one("contacts", {"id": contact_id})
        if not contact:
            # Try by phone
            contact = supabase.select_one("contacts", {"phone_number": contact_id})
        if not contact:
            return {"contact": None, "timeline": []}

        # 2. Chronological call logs across all campaigns
        phone = contact.get("phone_number")
        logs = supabase.select(
            "call_logs",
            {"phone_number": f"eq.{phone}", "order": "call_time.desc"}
        )

        return {
            "contact": contact,
            "timeline": logs or []
        }

    def update_contact(self, contact_id: str, updates: Dict[str, Any]) -> bool:
        """Updates contact name or custom dynamic attributes."""
        contact = supabase.select_one("contacts", {"id": contact_id})
        if not contact:
            return False

        payload: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if "name" in updates:
            payload["name"] = updates["name"]
        if "phone_number" in updates:
            payload["phone_number"] = sanitize_phone(updates["phone_number"])
        if "attributes" in updates:
            current_attrs = contact.get("attributes") or {}
            current_attrs.update(updates["attributes"])
            payload["attributes"] = current_attrs

        ok = supabase.update("contacts", {"id": contact_id}, payload)
        if ok:
            self.invalidate_distinct_cache()
        return ok

    def create_single_contact(self, phone_number: str, name: Optional[str] = None, attributes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Creates or updates a single contact in the contacts CRM table."""
        clean_phone = sanitize_phone(phone_number)
        if not clean_phone:
            raise ValueError("Valid phone number is required")

        now_iso = datetime.now(timezone.utc).isoformat()
        payload = {
            "phone_number": clean_phone,
            "name": name.strip() if name else None,
            "attributes": attributes or {},
            "total_calls_count": 0,
            "updated_at": now_iso
        }
        res = supabase.upsert("contacts", [payload], on_conflict="phone_number")
        self.invalidate_distinct_cache()
        if res and isinstance(res, list) and len(res) > 0:
            return res[0]
        return supabase.select_one("contacts", {"phone_number": clean_phone}) or payload

    def delete_contact(self, contact_id: str) -> bool:
        """Deletes a contact from the CRM."""
        ok = supabase.delete("contacts", {"id": contact_id})
        if ok:
            self.invalidate_distinct_cache()
        return ok

    # -------------------------------------------------------------
    # 4. BULK CONTACTS UPLOADER (100k - 200k SCALE)
    # -------------------------------------------------------------
    def bulk_ingest_contacts(self, rows: List[Dict[str, Any]], column_mapping: Dict[str, str]) -> Dict[str, Any]:
        """
        High-throughput bulk ingestion with dynamic column mapping.
        column_mapping maps file headers -> target field key (e.g. 'Phone No' -> 'phone_number', 'Stream' -> 'stream').
        """
        BATCH_SIZE = 2000
        total_rows = len(rows)
        upserted_count = 0

        # Auto-register new unmapped columns in contact_fields_meta
        existing_fields = {f["field_key"]: f for f in self.get_fields_meta()}
        standard_keys = ["phone_number", "name", "phone", "mobile", "student_name"]

        for file_col, target_key in column_mapping.items():
            if target_key not in standard_keys and target_key not in existing_fields:
                self.create_field_meta(label=file_col, field_type="text")

        # Process in chunks of 2,000 for sub-second database transactions
        for i in range(0, total_rows, BATCH_SIZE):
            chunk = rows[i : i + BATCH_SIZE]
            contacts_payload = []

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
                    continue

                phone_clean = sanitize_phone(phone_raw)
                if not phone_clean:
                    continue

                contacts_payload.append({
                    "phone_number": phone_clean,
                    "name": name_raw,
                    "attributes": attributes
                })

            if contacts_payload:
                res = supabase.upsert("contacts", contacts_payload, on_conflict="phone_number")
                if res is not None:
                    upserted_count += len(contacts_payload)

        return {
            "success": True,
            "total_processed": total_rows,
            "contacts_upserted": upserted_count
        }

    # -------------------------------------------------------------
    # 5. DEDUPLICATION, COOLDOWN EVALUATION & CAMPAIGN POPULATION
    # -------------------------------------------------------------
    _skipped_leads_cache: Dict[str, List[Dict[str, Any]]] = {}

    def get_skipped_leads(self, campaign_id: str) -> List[Dict[str, Any]]:
        """Returns cached skipped leads from the most recent import for this campaign."""
        return self._skipped_leads_cache.get(campaign_id, [])

    def clear_skipped_leads(self, campaign_id: str):
        """Clears cached skipped leads for a campaign."""
        self._skipped_leads_cache.pop(campaign_id, None)

    def export_skipped_leads_csv(self, campaign_id: str) -> str:
        """Generates downloadable CSV content of skipped leads from the last import."""
        leads = self.get_skipped_leads(campaign_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Phone Number", "Name", "Reason", "Details", "Skipped At"])
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        for lead in leads:
            writer.writerow([
                lead.get("phone_number", ""),
                lead.get("name", ""),
                lead.get("reason", ""),
                lead.get("details", ""),
                lead.get("skipped_at", now_str)
            ])
        return output.getvalue()

    def evaluate_lead_eligibility(
        self,
        candidates: List[Dict[str, Any]],
        campaign_id: str,
        policies: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
        """
        Evaluates candidate leads against deduplication and cooldown policies:
        1. Force override: bypasses all checks.
        2. Intra-campaign deduplication: excludes numbers already present in this campaign.
        3. Cross-campaign collision prevention: excludes numbers currently active/dialing in other campaigns.
        4. DND exclusion: excludes contacts marked DND/opt-out.
        5. Outcome-aware cooldown: enforces 24h cooldown after answered calls and 2h cooldown after missed calls.
        """
        import database
        now_utc = datetime.now(timezone.utc)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        force_override = bool(policies.get("force_override", False))
        dedup_intra = bool(policies.get("dedup_intra_campaign", True))
        dedup_cross = bool(policies.get("dedup_cross_active", True))
        enable_cooldown = bool(policies.get("enable_cooldown", True))
        cooldown_answered_hours = int(policies.get("cooldown_answered_hours", 24) if policies.get("cooldown_answered_hours") is not None else 24)
        cooldown_missed_hours = int(policies.get("cooldown_missed_hours", 2) if policies.get("cooldown_missed_hours") is not None else 2)
        exclude_dnd = bool(policies.get("exclude_dnd", True))

        existing_phones = database.get_existing_campaign_phone_numbers(campaign_id) if (dedup_intra and not force_override) else set()
        active_phones = database.get_active_campaign_phone_numbers(exclude_campaign_id=campaign_id) if (dedup_cross and not force_override) else set()

        seen_batch_phones = set()
        eligible_leads: List[Dict[str, Any]] = []
        skipped_leads: List[Dict[str, Any]] = []

        # Find any leads without call history so we can check local SQLite history
        missing_history_phones = [
            c["phone_number"] for c in candidates 
            if c.get("phone_number") and not c.get("last_call_status") and not c.get("last_call_time")
        ]
        sqlite_history = {}
        if missing_history_phones and enable_cooldown and not force_override:
            sqlite_history = database.get_recent_call_history_sqlite(missing_history_phones)

        for cand in candidates:
            raw_phone = cand.get("phone_number")
            phone = sanitize_phone(raw_phone)
            if not phone:
                continue

            name = cand.get("name") or ""
            lead_item = {
                "phone_number": phone,
                "name": name,
                "contact_id": cand.get("contact_id") or cand.get("id"),
                "sheet_row_index": cand.get("sheet_row_index")
            }

            # 1. Force Override Check
            if force_override:
                seen_batch_phones.add(phone)
                eligible_leads.append(lead_item)
                continue

            # 2. Intra-campaign deduplication
            if dedup_intra:
                if phone in existing_phones:
                    skipped_leads.append({
                        "phone_number": phone,
                        "name": name,
                        "reason": "intra_campaign_duplicate",
                        "details": "Already present in this campaign's lead list",
                        "skipped_at": now_str
                    })
                    continue
                if phone in seen_batch_phones:
                    skipped_leads.append({
                        "phone_number": phone,
                        "name": name,
                        "reason": "intra_campaign_duplicate",
                        "details": "Duplicate number within this import batch",
                        "skipped_at": now_str
                    })
                    continue

            # 3. Cross-campaign active dial collision prevention
            if dedup_cross and phone in active_phones:
                skipped_leads.append({
                    "phone_number": phone,
                    "name": name,
                    "reason": "cross_active_conflict",
                    "details": "Currently queued or in-call in another active campaign",
                    "skipped_at": now_str
                })
                continue

            # 4. DND / Opt-Out exclusion
            if exclude_dnd:
                attrs = cand.get("attributes") or {}
                dnd_val = attrs.get("dnd") or attrs.get("is_dnd") or attrs.get("do_not_disturb")
                if dnd_val and str(dnd_val).lower() in ["true", "1", "yes"]:
                    skipped_leads.append({
                        "phone_number": phone,
                        "name": name,
                        "reason": "dnd_excluded",
                        "details": "Contact marked DND / Opt-out in CRM",
                        "skipped_at": now_str
                    })
                    continue

            # 5. Outcome-Aware Cooldown
            if enable_cooldown:
                last_status = (cand.get("last_call_status") or "").lower()
                last_time_str = cand.get("last_call_time")

                if (not last_time_str or not last_status) and phone in sqlite_history:
                    last_status = (sqlite_history[phone].get("status") or "").lower()
                    last_time_str = sqlite_history[phone].get("call_time")

                if last_time_str:
                    dt = parse_call_datetime(last_time_str)
                    if dt:
                        elapsed_hours = max(0.0, (now_utc - dt.astimezone(timezone.utc)).total_seconds() / 3600.0)
                        if last_status in ["answered", "completed"]:
                            if elapsed_hours < cooldown_answered_hours:
                                rem = round(cooldown_answered_hours - elapsed_hours, 1)
                                skipped_leads.append({
                                    "phone_number": phone,
                                    "name": name,
                                    "reason": "cooldown_answered",
                                    "details": f"Answered call {round(elapsed_hours, 1)}h ago ({cooldown_answered_hours}h cooldown, {rem}h remaining)",
                                    "skipped_at": now_str
                                })
                                continue
                        elif last_status in ["missed", "no_answer", "busy", "rejected", "unreachable", "quick_hangup", "failed"]:
                            if elapsed_hours < cooldown_missed_hours:
                                rem = round(cooldown_missed_hours - elapsed_hours, 1)
                                skipped_leads.append({
                                    "phone_number": phone,
                                    "name": name,
                                    "reason": "cooldown_missed",
                                    "details": f"Missed call {round(elapsed_hours, 1)}h ago ({cooldown_missed_hours}h cooldown, {rem}h remaining)",
                                    "skipped_at": now_str
                                })
                                continue

            seen_batch_phones.add(phone)
            eligible_leads.append(lead_item)

        # Cache skipped leads for this campaign
        self._skipped_leads_cache[campaign_id] = skipped_leads

        summary = {
            "total_candidates": len(candidates),
            "enqueued_count": len(eligible_leads),
            "skipped_count": len(skipped_leads),
            "reasons": {
                "intra_campaign_duplicate": sum(1 for s in skipped_leads if s["reason"] == "intra_campaign_duplicate"),
                "cross_active_conflict": sum(1 for s in skipped_leads if s["reason"] == "cross_active_conflict"),
                "cooldown_answered": sum(1 for s in skipped_leads if s["reason"] == "cooldown_answered"),
                "cooldown_missed": sum(1 for s in skipped_leads if s["reason"] == "cooldown_missed"),
                "dnd_excluded": sum(1 for s in skipped_leads if s["reason"] == "dnd_excluded")
            },
            "skipped_leads": skipped_leads
        }

        return eligible_leads, skipped_leads, summary

    def populate_campaign_leads(
        self,
        campaign_id: str,
        filter_rules: List[Dict[str, Any]],
        force_override: bool = False,
        custom_policies: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Loads matching contacts from the Master Contacts directory, applies deduplication
        and cooldown policies, and populates both SQLite and Supabase campaign tables.
        Returns IngestionSummary dict.
        """
        import database

        camp_sqlite = database.get_campaign(campaign_id) or {}
        policies = {
            "dedup_intra_campaign": camp_sqlite.get("dedup_intra_campaign", 1) == 1,
            "dedup_cross_active": camp_sqlite.get("dedup_cross_active", 1) == 1,
            "enable_cooldown": camp_sqlite.get("enable_cooldown", 1) == 1,
            "cooldown_answered_hours": camp_sqlite.get("cooldown_answered_hours", 24),
            "cooldown_missed_hours": camp_sqlite.get("cooldown_missed_hours", 2),
            "exclude_dnd": camp_sqlite.get("exclude_dnd", 1) == 1,
            "force_override": force_override
        }
        if custom_policies:
            policies.update(custom_policies)
        if force_override:
            policies["force_override"] = True

        # Ensure campaign exists in Supabase to avoid foreign key errors
        try:
            if camp_sqlite:
                supabase.upsert("campaigns", {
                    "id": campaign_id,
                    "name": camp_sqlite.get("name", "Campaign"),
                    "status": camp_sqlite.get("status", "idle"),
                    "concurrency": camp_sqlite.get("concurrency", 5),
                    "ivr_id": camp_sqlite.get("ivr_id", "89733"),
                    "ivr_name": camp_sqlite.get("ivr_name", "DTMF Test IVR"),
                    "api_key": camp_sqlite.get("api_key"),
                    "did_mode": camp_sqlite.get("did_mode", "round_robin"),
                    "single_did": camp_sqlite.get("single_did"),
                    "inter_call_delay": camp_sqlite.get("inter_call_delay", 3)
                })
        except Exception as e:
            print(f"[Supabase] campaign upsert notice: {e}")

        # Fetch candidate contacts in 1,000-row batches (matching PostgREST max-rows cap)
        params = self._build_postgrest_filters(filter_rules)
        params["select"] = "id,phone_number,name,last_call_status,last_call_time,attributes"
        offset = 0
        batch_size = 1000
        raw_candidates: List[Dict[str, Any]] = []

        while True:
            params["offset"] = offset
            params["limit"] = batch_size
            contacts = supabase.select("contacts", params)
            if not contacts:
                break
            raw_candidates.extend(contacts)
            if len(contacts) < batch_size:
                break
            offset += len(contacts)

        eligible_leads, skipped_leads, summary = self.evaluate_lead_eligibility(
            raw_candidates, campaign_id, policies
        )

        # Bulk insert eligible leads into SQLite
        if eligible_leads:
            sqlite_batch = [(l["phone_number"], l["name"]) for l in eligible_leads]
            database.bulk_insert_leads(campaign_id, sqlite_batch)

            # Sync to Supabase campaign_leads in chunks
            supabase_batch = [{
                "campaign_id": campaign_id,
                "contact_id": l.get("contact_id") or l.get("id"),
                "phone_number": l["phone_number"],
                "name": l["name"],
                "status": "pending"
            } for l in eligible_leads]
            for i in range(0, len(supabase_batch), 1000):
                chunk = supabase_batch[i:i+1000]
                try:
                    supabase.insert("campaign_leads", chunk)
                except Exception as ex:
                    print(f"[Supabase] campaign_leads sync notice: {ex}")

        # Update total_leads counter in Supabase
        try:
            camp_now = database.get_campaign(campaign_id)
            total = camp_now.get("total_leads", 0) if camp_now else len(eligible_leads)
            supabase.update("campaigns", {"id": campaign_id}, {"total_leads": total})
        except Exception:
            pass

        return summary

    def enrich_leads_with_attributes(self, records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Enriches campaign lead dictionaries with Master Contacts CRM JSONB attributes
        and returns (enriched_records, custom_fields_schema).
        """
        all_fields = self.get_all_filter_fields()
        custom_fields = [
            {
                "field_key": f["field_key"],
                "label": f.get("label") or f["field_key"].replace("_", " ").title(),
                "field_type": f.get("field_type") or "text",
            }
            for f in all_fields
            if not f.get("is_standard", False)
        ]

        if not records:
            return records, custom_fields

        unique_phones = list({str(r.get("phone_number") or "").strip() for r in records if r.get("phone_number")})
        attr_map: Dict[str, Dict[str, Any]] = {}

        # Batch fetch attributes from Supabase in chunks of 150 to stay well under URL length limits
        batch_size = 150
        for i in range(0, len(unique_phones), batch_size):
            batch = unique_phones[i : i + batch_size]
            try:
                rows = supabase.select("contacts", {
                    "select": "phone_number,attributes",
                    "phone_number": f"in.({','.join(batch)})",
                    "limit": batch_size
                })
                for row in rows:
                    p = str(row.get("phone_number") or "").strip()
                    if p:
                        attr_map[p] = row.get("attributes") or {}
            except Exception as e:
                print(f"[ContactsService] Error enriching leads attributes: {e}")

        known_keys = {f["field_key"] for f in custom_fields}
        for r in records:
            p = str(r.get("phone_number") or "").strip()
            attrs = attr_map.get(p, {})
            r["attributes"] = attrs
            for k in attrs.keys():
                if k not in known_keys:
                    known_keys.add(k)
                    custom_fields.append({
                        "field_key": k,
                        "label": k.replace("_", " ").title(),
                        "field_type": "text",
                    })

        return records, custom_fields

contacts_service = ContactsService()
