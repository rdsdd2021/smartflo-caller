"""
Contacts CRM, Custom Datapoint Schema, and Audience Segmentation Engine
Handles 100k-200k leads, dynamic JSONB filtering, live audience counts, and timeline retrieval.
"""
import uuid
import re
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from supabase_client import supabase

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

    def get_distinct_field_values(self, field_key: str, limit: int = 50) -> List[str]:
        """Dynamically fetches distinct existing values for any contact field or JSONB attribute."""
        if field_key == "last_call_status":
            return ["answered", "missed", "no_answer", "busy", "unreachable", "failed", "pending", "never_called"]
        if field_key == "last_dtmf":
            return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"]

        values_set = set()
        # 1. Start with configured options if available
        known_meta = {f["field_key"]: f for f in self.get_fields_meta()}
        if field_key in known_meta and known_meta[field_key].get("options"):
            for opt in known_meta[field_key]["options"]:
                if opt:
                    values_set.add(str(opt).strip())

        # 2. Query distinct values from actual database rows
        try:
            if field_key in self.STANDARD_COLUMNS:
                rows = supabase.select("contacts", {"select": field_key, "limit": 200, f"{field_key}": "not.is.null"})
                for r in rows:
                    v = r.get(field_key)
                    if v is not None and str(v).strip():
                        values_set.add(str(v).strip())
            else:
                rows = supabase.select("contacts", {"select": "attributes", "limit": 200})
                for r in rows:
                    attrs = r.get("attributes") or {}
                    v = attrs.get(field_key)
                    if v is not None and str(v).strip():
                        values_set.add(str(v).strip())
        except Exception as e:
            print(f"[Supabase] Error fetching distinct values for {field_key}: {e}")

        return sorted(list(values_set))[:limit]

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
        return res[0] if res else payload

    def update_field_meta(self, field_id: str, updates: Dict[str, Any]) -> bool:
        """Updates an existing datapoint label, options, or filter status."""
        match = {"id": field_id} if (len(field_id) == 36 and "-" in field_id) else {"field_key": field_id}
        return supabase.update("contact_fields_meta", match, updates)

    def delete_field_meta(self, field_id: str) -> bool:
        """Removes a custom datapoint definition."""
        match = {"id": field_id} if (len(field_id) == 36 and "-" in field_id) else {"field_key": field_id}
        return supabase.delete("contact_fields_meta", match)

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
            if op in ["in", "any_of"] and vals:
                clean_vals = [str(v).strip() for v in vals if str(v).strip()]
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

        return supabase.update("contacts", {"id": contact_id}, payload)

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
    # 5. POPULATE CAMPAIGN FROM AUDIENCE SEGMENT
    # -------------------------------------------------------------
    def populate_campaign_leads(self, campaign_id: str, filter_rules: List[Dict[str, Any]]) -> int:
        """
        Loads matching contacts from the Master Contacts directory into a campaign's run queue.
        """
        params = self._build_postgrest_filters(filter_rules)
        params["select"] = "id,phone_number,name"
        # Stream in batches of 2000
        offset = 0
        limit = 2000
        total_enqueued = 0

        while True:
            params["offset"] = offset
            params["limit"] = limit
            contacts = supabase.select("contacts", params)
            if not contacts:
                break

            leads_batch = []
            for c in contacts:
                leads_batch.append({
                    "campaign_id": campaign_id,
                    "contact_id": c["id"],
                    "phone_number": c["phone_number"],
                    "name": c.get("name") or "",
                    "status": "pending"
                })

            if leads_batch:
                supabase.insert("campaign_leads", leads_batch)
                total_enqueued += len(leads_batch)

            if len(contacts) < limit:
                break
            offset += limit

        # Update campaign total leads
        supabase.update("campaigns", {"id": campaign_id}, {"total_leads": total_enqueued})
        return total_enqueued

contacts_service = ContactsService()
