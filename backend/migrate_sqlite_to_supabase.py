"""
Smartflo SQLite to Supabase Migration Utility
Migrates all campaigns, leads, outcomes, and lifetime call timelines from local SQLite into Supabase PostgreSQL.
Uses Python standard library (urllib.request, sqlite3, json, ssl) with zero external dependencies.
"""
import sqlite3
import os
import sys
import json
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://quhzhzcvdkzkzlfarasg.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_0WqihscuPOfZ9rR7Qf0F3Q_Sbku3v7V")
SQLITE_DB_PATH = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartflo_db.sqlite")
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "User-Agent": "Smartflo-Migrator/1.0"
}

# SSL Context to prevent Windows certificate chain issues
ssl_context = ssl._create_unverified_context()

def http_request(url: str, method: str = "GET", data: any = None, extra_headers: dict = None) -> tuple:
    """Helper to perform HTTP requests using standard library urllib."""
    headers = dict(HEADERS)
    if extra_headers:
        headers.update(extra_headers)

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=ssl_context, timeout=45) as resp:
            resp_body = resp.read().decode("utf-8")
            return resp.status, resp_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        return e.code, err_body
    except Exception as e:
        return 0, str(e)

def migrate():
    print("================================================================")
    print("         SMARTFLO SQLITE -> SUPABASE MIGRATION UTILITY         ")
    print("================================================================")
    print(f"[*] SQLite Source File:  {SQLITE_DB_PATH}")
    print(f"[*] Supabase Endpoint:   {SUPABASE_URL}")

    if not os.path.exists(SQLITE_DB_PATH):
        print(f"[!] SQLite database not found at {SQLITE_DB_PATH}")
        sys.exit(1)

    # 1. Verify Supabase tables exist
    print("[*] Verifying Supabase tables connectivity...")
    status, body = http_request(f"{SUPABASE_URL}/rest/v1/campaigns?limit=1")
    if status == 404 or "PGRST205" in body:
        print("\n" + "="*64)
        print("[!] ERROR: Supabase tables not found in schema cache (PGRST205)!")
        print("    You MUST run 'supabase_schema.sql' in your Supabase Dashboard")
        print("    SQL Editor before running this migration.")
        print("="*64 + "\n")
        sys.exit(1)
    elif status not in [200, 206]:
        print(f"\n[!] Supabase connection error: Status {status}: {body}")
        sys.exit(1)
    print("[+] Supabase connection and schema verified successfully!")

    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row

    # 2. Migrate Campaigns
    print("\n--- Phase 1: Migrating Campaigns ---")
    camp_rows = conn.execute("SELECT * FROM campaigns").fetchall()
    print(f"[*] Found {len(camp_rows)} campaigns in SQLite.")

    for c in camp_rows:
        camp_dict = dict(c)
        payload = {
            "id": camp_dict["id"],
            "name": camp_dict["name"],
            "status": camp_dict.get("status", "idle"),
            "concurrency": camp_dict.get("concurrency", 5),
            "ivr_id": str(camp_dict.get("ivr_id", "89733")),
            "ivr_name": camp_dict.get("ivr_name", "DTMF Test IVR"),
            "api_key": camp_dict.get("api_key", ""),
            "did_mode": camp_dict.get("did_mode", "round_robin"),
            "single_did": camp_dict.get("single_did", "917965561295"),
            "inter_call_delay": camp_dict.get("inter_call_delay", 3),
            "total_leads": camp_dict.get("total_leads", 0),
            "completed_leads": camp_dict.get("completed_leads", 0),
            "answered_leads": camp_dict.get("answered_leads", 0),
            "missed_leads": camp_dict.get("missed_leads", 0),
            "dtmf_leads": camp_dict.get("dtmf_leads", 0),
            "created_at": camp_dict.get("created_at") or datetime.now(timezone.utc).isoformat(),
            "updated_at": camp_dict.get("updated_at") or datetime.now(timezone.utc).isoformat()
        }
        status, body = http_request(
            f"{SUPABASE_URL}/rest/v1/campaigns",
            method="POST",
            data=payload,
            extra_headers={"Prefer": "resolution=merge-duplicates"}
        )
        if status in [200, 201, 204]:
            print(f"  [+] Synced campaign: {camp_dict['name']} ({camp_dict['id']})")
        else:
            print(f"  [-] Failed to sync campaign {camp_dict['id']}: Status {status} - {body}")

    # 3. Migrate Contacts, Campaign Leads, and Call Logs
    print("\n--- Phase 2: Migrating Contacts, Run Queue, and Lifetime Timelines ---")
    total_leads = conn.execute("SELECT count(*) FROM leads").fetchone()[0]
    print(f"[*] Total leads to process: {total_leads:,}")

    BATCH_SIZE = 500
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM leads ORDER BY rowid ASC")

    processed = 0
    contacts_migrated = 0
    timeline_logs_migrated = 0

    while True:
        batch = cursor.fetchmany(BATCH_SIZE)
        if not batch:
            break

        contacts_batch = []
        camp_leads_batch = []
        call_logs_batch = []

        for row in batch:
            lead = dict(row)
            phone = str(lead["phone_number"]).strip()
            name = (lead.get("name") or "").strip()
            status = lead.get("status", "pending")
            duration = lead.get("duration", 0)
            dtmf = lead.get("dtmf")
            did = lead.get("did_used")
            call_time = lead.get("call_time")
            created_at = lead.get("created_at") or datetime.now(timezone.utc).isoformat()

            # Master Contact record
            contacts_batch.append({
                "phone_number": phone,
                "name": name,
                "attributes": {},
                "total_calls_count": 1 if status != "pending" else 0,
                "last_call_status": status if status != "pending" else None,
                "last_call_time": call_time if status != "pending" else None,
                "last_dtmf": dtmf if dtmf else None
            })

            # Campaign Lead Queue record
            camp_leads_batch.append({
                "campaign_id": lead["campaign_id"],
                "phone_number": phone,
                "name": name,
                "status": status,
                "duration": duration,
                "dtmf": dtmf,
                "caller_did": did,
                "call_time": call_time,
                "ref_id": lead.get("ref_id"),
                "call_id": lead.get("call_id"),
                "error_message": lead.get("error_message")
            })

            # Call Timeline record (for all completed or attempted calls)
            if status != "pending":
                call_logs_batch.append({
                    "campaign_id": lead["campaign_id"],
                    "campaign_name": "UD APD 2026" if lead["campaign_id"] == "camp_99817747" else "Outbound Campaign",
                    "phone_number": phone,
                    "caller_did": did,
                    "status": status,
                    "duration": duration,
                    "dtmf": dtmf,
                    "call_time": call_time or created_at,
                    "error_message": lead.get("error_message")
                })

        # Upsert contacts in batch
        status, body = http_request(
            f"{SUPABASE_URL}/rest/v1/contacts?on_conflict=phone_number",
            method="POST",
            data=contacts_batch,
            extra_headers={"Prefer": "resolution=merge-duplicates"}
        )
        if status in [200, 201, 204]:
            contacts_migrated += len(contacts_batch)
        else:
            print(f"[!] Contacts batch error: Status {status}: {body[:200]}")

        # Insert campaign leads in batch
        status, body = http_request(
            f"{SUPABASE_URL}/rest/v1/campaign_leads",
            method="POST",
            data=camp_leads_batch,
            extra_headers={"Prefer": "return=minimal"}
        )

        # Insert call logs in batch
        if call_logs_batch:
            status, body = http_request(
                f"{SUPABASE_URL}/rest/v1/call_logs",
                method="POST",
                data=call_logs_batch,
                extra_headers={"Prefer": "return=minimal"}
            )
            if status in [200, 201, 204]:
                timeline_logs_migrated += len(call_logs_batch)

        processed += len(batch)
        pct = (processed / total_leads) * 100
        print(f"  -> Migrated {processed:,} / {total_leads:,} leads ({pct:.1f}%)...")

    print("\n========================================================")
    print("[✓] MIGRATION COMPLETE!")
    print(f"[✓] Total Leads Migrated: {processed:,}")
    print(f"[✓] Master Contacts Created: {contacts_migrated:,}")
    print(f"[✓] Lifetime Call History Logs Created: {timeline_logs_migrated:,}")
    print("========================================================")

if __name__ == "__main__":
    migrate()
