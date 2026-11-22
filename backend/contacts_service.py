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
    # -------------------------------------------------------------
    # 1. CUSTOM DATAPOINT SCHEMA MANAGEMENT
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
        return supabase.update("contact_fields_meta", {"id": field_id}, updates)

    def delete_field_meta(self, field_id: str) -> bool:
        """Removes a custom datapoint definition."""
        return supabase.delete("contact_fields_meta", {"id": field_id})

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

            # Standard fields vs JSONB attributes
            param_key = field if field in ["name", "phone_number", "last_call_status"] else f"attributes->>{field}"

            if op == "equals" and val:
                params[param_key] = f"eq.{val}"
            elif op == "not_equals" and val:
                params[param_key] = f"neq.{val}"
            elif op == "contains" and val:
                params[param_key] = f"ilike.*{val}*"
            elif op == "in" and vals:
                # Comma-separated list for PostgREST
                val_str = ",".join(str(v).strip() for v in vals if str(v).strip())
                if val_str:
                    params[param_key] = f"in.({val_str})"
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
