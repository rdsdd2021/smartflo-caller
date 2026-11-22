import sqlite3
import os
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple

# Indian Standard Time (IST, UTC+5:30) for accurate telecom timestamps
IST = timezone(timedelta(hours=5, minutes=30))

def get_now_ist_str() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartflo_db.sqlite"))

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Campaigns Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            concurrency INTEGER NOT NULL DEFAULT 5,
            ivr_id TEXT NOT NULL DEFAULT '89733',
            ivr_name TEXT NOT NULL DEFAULT 'DTMF Test IVR',
            did_mode TEXT NOT NULL DEFAULT 'round_robin',
            single_did TEXT DEFAULT '917965561295',
            inter_call_delay INTEGER NOT NULL DEFAULT 3,
            google_sheet_url TEXT,
            google_sheet_phone_col TEXT,
            google_sheet_name_col TEXT,
            total_leads INTEGER NOT NULL DEFAULT 0,
            completed_leads INTEGER NOT NULL DEFAULT 0,
            answered_leads INTEGER NOT NULL DEFAULT 0,
            missed_leads INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)
        
        # Leads Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            name TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            dtmf TEXT,
            duration INTEGER NOT NULL DEFAULT 0,
            call_id TEXT,
            ref_id TEXT,
            call_time TEXT,
            did_used TEXT,
            sheet_row_index INTEGER,
            error_message TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        """)
        
        # Performance Indexes for sub-millisecond pagination and lookups on 50,000+ rows
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_camp_status ON leads (campaign_id, status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_camp_phone ON leads (campaign_id, phone_number);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leads_camp_dtmf ON leads (campaign_id, dtmf);")

        # Cached IVRs Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS cached_ivrs (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            recording TEXT,
            timeout INTEGER DEFAULT 30,
            default_api_key TEXT,
            updated_at TEXT NOT NULL
        );
        """)

        # Cached Recordings Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS cached_recordings (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT,
            updated_at TEXT NOT NULL
        );
        """)

        # Webhook Subscriptions Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS webhook_subscriptions (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            events TEXT NOT NULL,
            secret TEXT,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)

        # Check and migrate campaigns table for api_key and dtmf_leads
        cursor.execute("PRAGMA table_info(campaigns);")
        cols = [r["name"] for r in cursor.fetchall()]
        if "api_key" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN api_key TEXT DEFAULT '865fac0f-bed8-491c-aa22-59c55c94d00c';")
        if "dtmf_leads" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN dtmf_leads INTEGER NOT NULL DEFAULT 0;")
            cursor.execute("""
                UPDATE campaigns SET dtmf_leads = (
                    SELECT COUNT(*) FROM leads 
                    WHERE leads.campaign_id = campaigns.id 
                    AND leads.dtmf IS NOT NULL AND leads.dtmf != '' AND leads.dtmf != 'None'
                );
            """)
        # Deduplication and Cooldown Policy Columns
        if "dedup_intra_campaign" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN dedup_intra_campaign INTEGER NOT NULL DEFAULT 1;")
        if "dedup_cross_active" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN dedup_cross_active INTEGER NOT NULL DEFAULT 1;")
        if "enable_cooldown" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN enable_cooldown INTEGER NOT NULL DEFAULT 1;")
        if "cooldown_answered_hours" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN cooldown_answered_hours INTEGER NOT NULL DEFAULT 24;")
        if "cooldown_missed_hours" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN cooldown_missed_hours INTEGER NOT NULL DEFAULT 2;")
        if "exclude_dnd" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN exclude_dnd INTEGER NOT NULL DEFAULT 1;")

        conn.commit()

# Default seed IVRs and recordings so UI is never blank
DEFAULT_SEED_IVRS = [
    {
        "id": 89733,
        "name": "DTMF Test IVR",
        "description": "Captures any digit pressed (0-9) and records DTMF response",
        "recording": "219915",
        "timeout": 30,
        "default_api_key": "865fac0f-bed8-491c-aa22-59c55c94d00c"
    },
    {
        "id": 89718,
        "name": "Generic Hindi All",
        "description": "Hindi Voice Prompt Flow",
        "recording": "219915",
        "timeout": 30,
        "default_api_key": "865fac0f-bed8-491c-aa22-59c55c94d00c"
    },
    {
        "id": 89717,
        "name": "Generic Bengali All",
        "description": "Bengali Voice Prompt Flow",
        "recording": "219914",
        "timeout": 30,
        "default_api_key": ""
    }
]

DEFAULT_SEED_RECORDINGS = [
    {"id": "219914", "name": "Generic Bengali All", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/855393/6afc1f28b028a.mp3"},
    {"id": "219915", "name": "Generic Hindi All", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/855393/6afc1f6fcdf2b.mp3"},
    {"id": "219966", "name": "Test URL Sound", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/855393/6afd38dc4cddc.mp3"},
    {"id": "219970", "name": "Automated Audio Upload Test", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/855393/6afd4337c7fad.mp3"},
    {"id": "219973", "name": "Promo Sample Verification", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/855393/6afd4b44e455e.mp3"},
    {"id": "9177", "name": "Retry (English)", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/5743/5fa267d0c4144.mp3"},
    {"id": "9183", "name": "Retry (Hindi)", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/5743/5fa26804a1fed.mp3"},
    {"id": "9244", "name": "Thank You", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/5743/5fa3acdb8560f.mp3"},
    {"id": "9250", "name": "Thank You (Hindi)", "url": "https://d1xr2jyd95vvd7.cloudfront.net/ivr/5743/5fa3add45e2bf.mp3"}
]

def cache_ivrs(ivrs: List[Dict[str, Any]]):
    now = get_now_ist_str()
    with get_connection() as conn:
        for ivr in ivrs:
            conn.execute("""
                INSERT INTO cached_ivrs (id, name, description, recording, timeout, default_api_key, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    recording = excluded.recording,
                    timeout = excluded.timeout,
                    updated_at = excluded.updated_at
            """, (
                int(ivr.get("id")),
                str(ivr.get("name") or ""),
                str(ivr.get("description") or ""),
                str(ivr.get("recording") or ""),
                int(ivr.get("timeout") or 30),
                str(ivr.get("default_api_key") or ""),
                now
            ))
        conn.commit()

def get_cached_ivrs() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM cached_ivrs ORDER BY id DESC").fetchall()
        if not rows:
            cache_ivrs(DEFAULT_SEED_IVRS)
            rows = conn.execute("SELECT * FROM cached_ivrs ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

def cache_recordings(recs: List[Dict[str, Any]]):
    now = get_now_ist_str()
    with get_connection() as conn:
        for r in recs:
            conn.execute("""
                INSERT INTO cached_recordings (id, name, url, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    url = excluded.url,
                    updated_at = excluded.updated_at
            """, (
                str(r.get("id")),
                str(r.get("name") or ""),
                str(r.get("url") or ""),
                now
            ))
        conn.commit()

def get_cached_recordings() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM cached_recordings ORDER BY id DESC").fetchall()
        if not rows:
            cache_recordings(DEFAULT_SEED_RECORDINGS)
            rows = conn.execute("SELECT * FROM cached_recordings ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

# -------------------------------------------------------------
# CAMPAIGN REPOSITORY
# -------------------------------------------------------------
def create_campaign(
    name: str, 
    concurrency: int = 5, 
    ivr_id: str = "89733", 
    ivr_name: str = "DTMF Test IVR",
    api_key: str = "865fac0f-bed8-491c-aa22-59c55c94d00c",
    did_mode: str = "round_robin",
    single_did: str = "917965561295",
    inter_call_delay: int = 3,
    google_sheet_url: Optional[str] = None,
    google_sheet_phone_col: Optional[str] = None,
    google_sheet_name_col: Optional[str] = None,
    dedup_intra_campaign: bool = True,
    dedup_cross_active: bool = True,
    enable_cooldown: bool = True,
    cooldown_answered_hours: int = 24,
    cooldown_missed_hours: int = 2,
    exclude_dnd: bool = True
) -> Dict[str, Any]:
    cid = f"camp_{uuid.uuid4().hex[:8]}"
    now = get_now_ist_str()
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO campaigns (
                id, name, status, concurrency, ivr_id, ivr_name, api_key,
                did_mode, single_did, inter_call_delay,
                google_sheet_url, google_sheet_phone_col, google_sheet_name_col,
                dedup_intra_campaign, dedup_cross_active, enable_cooldown,
                cooldown_answered_hours, cooldown_missed_hours, exclude_dnd,
                created_at, updated_at
            ) VALUES (?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cid, name, concurrency, ivr_id, ivr_name, api_key,
            did_mode, single_did, inter_call_delay,
            google_sheet_url, google_sheet_phone_col, google_sheet_name_col,
            1 if dedup_intra_campaign else 0,
            1 if dedup_cross_active else 0,
            1 if enable_cooldown else 0,
            cooldown_answered_hours,
            cooldown_missed_hours,
            1 if exclude_dnd else 0,
            now, now
        ))
        conn.commit()
    return get_campaign(cid)

def get_campaign(campaign_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not row:
            return None
        return dict(row)

def list_campaigns() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM campaigns ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

def update_campaign_status(campaign_id: str, status: str):
    now = get_now_ist_str()
    with get_connection() as conn:
        conn.execute("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?", (status, now, campaign_id))
        conn.commit()

def update_campaign_settings(campaign_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    allowed = [
        "name", "concurrency", "ivr_id", "ivr_name", "api_key", "did_mode", "single_did",
        "inter_call_delay", "google_sheet_url", "google_sheet_phone_col", "google_sheet_name_col",
        "dedup_intra_campaign", "dedup_cross_active", "enable_cooldown",
        "cooldown_answered_hours", "cooldown_missed_hours", "exclude_dnd"
    ]
    set_clause = []
    params = []
    for k, v in updates.items():
        if k in allowed:
            set_clause.append(f"{k} = ?")
            if isinstance(v, bool):
                params.append(1 if v else 0)
            else:
                params.append(v)
    if not set_clause:
        return get_campaign(campaign_id)
        
    set_clause.append("updated_at = ?")
    params.append(get_now_ist_str())
    params.append(campaign_id)
    
    with get_connection() as conn:
        conn.execute(f"UPDATE campaigns SET {', '.join(set_clause)} WHERE id = ?", params)
        conn.commit()
    return get_campaign(campaign_id)

def get_existing_campaign_phone_numbers(campaign_id: str) -> set:
    """Returns set of all normalized phone numbers already in this campaign."""
    with get_connection() as conn:
        rows = conn.execute("SELECT DISTINCT phone_number FROM leads WHERE campaign_id = ?", (campaign_id,)).fetchall()
        return {r["phone_number"] for r in rows if r["phone_number"]}

def get_active_campaign_phone_numbers(exclude_campaign_id: str = "") -> set:
    """Returns set of all phone numbers currently active/pending/dialing in other running or paused campaigns."""
    with get_connection() as conn:
        query = """
            SELECT DISTINCT l.phone_number 
            FROM leads l
            JOIN campaigns c ON l.campaign_id = c.id
            WHERE c.status IN ('running', 'paused')
            AND l.status IN ('pending', 'dialing', 'ringing', 'connected')
        """
        params = []
        if exclude_campaign_id:
            query += " AND c.id != ?"
            params.append(exclude_campaign_id)
        rows = conn.execute(query, params).fetchall()
        return {r["phone_number"] for r in rows if r["phone_number"]}

def get_recent_call_history_sqlite(phone_numbers: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetches the latest call outcome and timestamp from local SQLite for cooldown evaluation."""
    if not phone_numbers:
        return {}
    results = {}
    with get_connection() as conn:
        for i in range(0, len(phone_numbers), 400):
            chunk = phone_numbers[i:i+400]
            placeholders = ",".join("?" for _ in chunk)
            rows = conn.execute(f"""
                SELECT phone_number, status, call_time 
                FROM leads 
                WHERE phone_number IN ({placeholders})
                AND status NOT IN ('pending', 'dialing', 'ringing')
                AND call_time IS NOT NULL AND call_time != ''
                ORDER BY call_time DESC
            """, chunk).fetchall()
            for r in rows:
                p = r["phone_number"]
                if p not in results:
                    results[p] = {
                        "status": r["status"],
                        "call_time": r["call_time"]
                    }
    return results

def delete_campaign(campaign_id: str) -> bool:
    with get_connection() as conn:
        conn.execute("DELETE FROM leads WHERE campaign_id = ?", (campaign_id,))
        conn.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))
        conn.commit()
    return True

def sync_campaign_counters(campaign_id: str):
    """Refreshes total, completed, answered, missed, and dtmf counters directly in campaigns table."""
    with get_connection() as conn:
        row = conn.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status NOT IN ('pending', 'dialing', 'connected', 'ringing') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('completed', 'answered') THEN 1 ELSE 0 END) as answered,
                SUM(CASE WHEN status NOT IN ('pending', 'dialing', 'connected', 'ringing', 'completed', 'answered') THEN 1 ELSE 0 END) as missed,
                SUM(CASE WHEN dtmf IS NOT NULL AND dtmf != '' AND dtmf != 'None' THEN 1 ELSE 0 END) as dtmf_count
            FROM leads WHERE campaign_id = ?
        """, (campaign_id,)).fetchone()
        
        total = row["total"] or 0
        completed = row["completed"] or 0
        answered = row["answered"] or 0
        missed = row["missed"] or 0
        dtmf_count = row["dtmf_count"] or 0
        now = get_now_ist_str()

        conn.execute("""
            UPDATE campaigns SET 
                total_leads = ?, 
                completed_leads = ?, 
                answered_leads = ?, 
                missed_leads = ?,
                dtmf_leads = ?,
                updated_at = ?
            WHERE id = ?
        """, (total, completed, answered, missed, dtmf_count, now, campaign_id))
        conn.commit()

# -------------------------------------------------------------
# LEADS REPOSITORY & 10K+ SERVER-SIDE PAGINATION
# -------------------------------------------------------------
def bulk_insert_leads(campaign_id: str, leads_data: List[tuple]) -> int:
    """Inserts list of (phone, name, [optional sheet_row_index]) in a single atomic transaction."""
    now = get_now_ist_str()
    records = []
    for item in leads_data:
        phone = item[0]
        name = item[1] if len(item) > 1 else ""
        sheet_row = item[2] if len(item) > 2 else None
        lead_id = f"lead_{uuid.uuid4().hex[:10]}"
        records.append((lead_id, campaign_id, phone, name or "", "pending", sheet_row, now))

    with get_connection() as conn:
        conn.executemany("""
            INSERT INTO leads (id, campaign_id, phone_number, name, status, sheet_row_index, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, records)
        conn.commit()

    sync_campaign_counters(campaign_id)
    return len(records)

def clear_campaign_leads(campaign_id: str):
    with get_connection() as conn:
        conn.execute("DELETE FROM leads WHERE campaign_id = ?", (campaign_id,))
        conn.commit()
    sync_campaign_counters(campaign_id)

def delete_lead(campaign_id: str, lead_id: str) -> bool:
    """Deletes an individual lead from a campaign and syncs campaign summary counters."""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM leads WHERE campaign_id = ? AND id = ?", (campaign_id, lead_id))
        conn.commit()
        deleted = cursor.rowcount > 0
    if deleted:
        sync_campaign_counters(campaign_id)
    return deleted

def get_paginated_leads(
    campaign_id: str, 
    page: int = 1, 
    limit: int = 50, 
    status_filter: Optional[str] = None, 
    search: Optional[str] = None,
    dtmf_filter: Optional[str] = None
) -> Dict[str, Any]:
    """High-speed paginated query with sub-millisecond index search."""
    page = max(1, page)
    limit = max(1, min(200, limit))
    offset = (page - 1) * limit

    where_clauses = ["campaign_id = ?"]
    params: List[Any] = [campaign_id]

    if status_filter and status_filter.lower() != "all":
        sf = status_filter.lower()
        if sf in ["answered", "completed"]:
            where_clauses.append("status IN ('answered', 'completed')")
        elif sf in ["dialing", "ringing", "connected", "in_call"]:
            where_clauses.append("status IN ('dialing', 'connected')")
        elif sf == "missed":
            where_clauses.append("status IN ('missed', 'no_answer', 'rejected', 'busy', 'unreachable', 'quick_hangup', 'invalid_number')")
        else:
            where_clauses.append("status = ?")
            params.append(sf)

    if dtmf_filter and dtmf_filter.lower() != "all":
        df = dtmf_filter.strip().lower()
        if df == "any":
            where_clauses.append("(dtmf IS NOT NULL AND dtmf != '' AND dtmf != 'None')")
        elif df == "none":
            where_clauses.append("(dtmf IS NULL OR dtmf = '' OR dtmf = 'None')")
        else:
            where_clauses.append("dtmf = ?")
            params.append(dtmf_filter.strip())

    if search and search.strip():
        term = f"%{search.strip()}%"
        where_clauses.append("(phone_number LIKE ? OR name LIKE ?)")
        params.extend([term, term])

    where_str = " AND ".join(where_clauses)

    with get_connection() as conn:
        count_row = conn.execute(f"SELECT COUNT(*) as count FROM leads WHERE {where_str}", params).fetchone()
        total_count = count_row["count"] if count_row else 0

        query = f"""
            SELECT * FROM leads 
            WHERE {where_str} 
            ORDER BY rowid ASC 
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(query, params + [limit, offset]).fetchall()
        items = [dict(r) for r in rows]

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

    return {
        "items": items,
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

def get_campaign_summary(campaign_id: str) -> Dict[str, Any]:
    """Aggregates campaign metrics, talk durations, and DTMF key distributions."""
    with get_connection() as conn:
        camp = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
        if not camp:
            return {}

        counts = conn.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status NOT IN ('pending', 'dialing', 'connected', 'ringing') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('completed', 'answered') THEN 1 ELSE 0 END) as answered,
                SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) as no_answer,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
                SUM(CASE WHEN status = 'unreachable' THEN 1 ELSE 0 END) as unreachable,
                SUM(CASE WHEN status = 'quick_hangup' THEN 1 ELSE 0 END) as quick_hangup,
                SUM(CASE WHEN status = 'invalid_number' THEN 1 ELSE 0 END) as invalid_number,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status IN ('missed', 'no_answer', 'rejected', 'busy', 'unreachable', 'quick_hangup', 'invalid_number') THEN 1 ELSE 0 END) as missed,
                SUM(CASE WHEN status IN ('dialing', 'connected', 'ringing') THEN 1 ELSE 0 END) as dialing,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(duration) as total_duration
            FROM leads WHERE campaign_id = ?
        """, (campaign_id,)).fetchone()

        dtmf_rows = conn.execute("""
            SELECT dtmf, COUNT(*) as cnt 
            FROM leads 
            WHERE campaign_id = ? AND dtmf IS NOT NULL AND dtmf != '' AND dtmf != 'None'
            GROUP BY dtmf
        """, (campaign_id,)).fetchall()

    dtmf_counts = {r["dtmf"]: r["cnt"] for r in dtmf_rows}

    total = counts["total"] or 0
    completed = counts["completed"] or 0
    answered = counts["answered"] or 0
    no_answer = counts["no_answer"] or 0
    rejected = counts["rejected"] or 0
    busy = counts["busy"] or 0
    unreachable = counts["unreachable"] or 0
    quick_hangup = counts["quick_hangup"] or 0
    invalid_number = counts["invalid_number"] or 0
    failed = counts["failed"] or 0
    missed = counts["missed"] or 0
    dialing = counts["dialing"] or 0
    pending = counts["pending"] or 0
    total_dur = counts["total_duration"] or 0

    return {
        "campaign": dict(camp),
        "total_leads": total,
        "completed_leads": completed,
        "answered_leads": answered,
        "no_answer_leads": no_answer,
        "rejected_leads": rejected,
        "busy_leads": busy,
        "unreachable_leads": unreachable,
        "quick_hangup_leads": quick_hangup,
        "invalid_number_leads": invalid_number,
        "failed_leads": failed,
        "missed_leads": missed,
        "dialing_leads": dialing,
        "pending_leads": pending,
        "answer_rate": round((answered / completed * 100), 1) if completed > 0 else 0,
        "total_duration": total_dur,
        "avg_duration": round(total_dur / answered, 1) if answered > 0 else 0,
        "dtmf_counts": dtmf_counts,
        "dtmf_leads": sum(dtmf_counts.values())
    }

def get_next_pending_leads(campaign_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM leads 
            WHERE campaign_id = ? AND status = 'pending' 
            ORDER BY rowid ASC 
            LIMIT ?
        """, (campaign_id, limit)).fetchall()
        return [dict(r) for r in rows]

def update_lead(lead_id: str, updates: Dict[str, Any]):
    set_clause = []
    params = []
    for k, v in updates.items():
        set_clause.append(f"{k} = ?")
        params.append(v)
    if not set_clause:
        return
    params.append(lead_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE leads SET {', '.join(set_clause)} WHERE id = ?", params)
        conn.commit()

def reset_unended_calls(campaign_id: str):
    """Resets any stuck 'dialing' or 'connected' leads back to 'pending' on startup/resume."""
    with get_connection() as conn:
        conn.execute("""
            UPDATE leads 
            SET status = 'pending', error_message = NULL 
            WHERE campaign_id = ? AND status IN ('dialing', 'connected', 'ringing')
        """, (campaign_id,))
        conn.commit()
    sync_campaign_counters(campaign_id)

def reset_missed_leads(campaign_id: str) -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE leads SET 
                status = 'pending', 
                dtmf = NULL, 
                duration = 0, 
                call_id = NULL, 
                ref_id = NULL, 
                call_time = NULL, 
                did_used = NULL, 
                error_message = NULL
            WHERE campaign_id = ? AND status IN (
                'missed', 'failed', 'no_answer', 'rejected', 'busy', 
                'unreachable', 'quick_hangup', 'invalid_number'
            )
        """, (campaign_id,))
        count = cursor.rowcount
        conn.commit()
    sync_campaign_counters(campaign_id)
    return count

def migrate_legacy_statuses():
    """Classifies existing historical 'missed' leads into granular statuses based on hangup causes."""
    try:
        with get_connection() as conn:
            # 1. No answer
            conn.execute("""
                UPDATE leads SET status = 'no_answer' 
                WHERE status = 'missed' AND (
                    error_message GLOB '*No answer*' OR 
                    error_message GLOB '*No user response*' OR 
                    error_message = 'No CDR returned / Unanswered'
                )
            """)
            # 2. Rejected / Declined
            conn.execute("""
                UPDATE leads SET status = 'rejected' 
                WHERE status = 'missed' AND error_message GLOB '*rejected*'
            """)
            # 3. User busy
            conn.execute("""
                UPDATE leads SET status = 'busy' 
                WHERE status = 'missed' AND error_message GLOB '*busy*'
            """)
            # 4. Unallocated / Out of service
            conn.execute("""
                UPDATE leads SET status = 'unreachable' 
                WHERE status = 'missed' AND (
                    error_message GLOB '*Unallocated*' OR 
                    error_message GLOB '*Interworking*'
                )
            """)
            # 5. Invalid number
            conn.execute("""
                UPDATE leads SET status = 'invalid_number' 
                WHERE status = 'missed' AND error_message GLOB '*Invalid*'
            """)
            # 6. Quick hangup
            conn.execute("""
                UPDATE leads SET status = 'quick_hangup' 
                WHERE status = 'missed' AND error_message GLOB '*Normal Clearing*'
            """)
            conn.commit()
    except Exception as e:
        print(f"[Database] migrate_legacy_statuses error: {e}")

def get_leads_for_export(campaign_id: str, status_filter: str = "all", dtmf_filter: str = "all") -> List[Dict[str, Any]]:
    where_clauses = ["campaign_id = ?"]
    params: List[Any] = [campaign_id]

    if status_filter and status_filter.lower() != "all":
        sf = status_filter.lower()
        if sf in ["answered", "completed"]:
            where_clauses.append("status IN ('answered', 'completed')")
        elif sf in ["dialing", "ringing", "connected", "in_call"]:
            where_clauses.append("status IN ('dialing', 'connected')")
        elif sf == "missed":
            where_clauses.append("status IN ('missed', 'no_answer', 'rejected', 'busy', 'unreachable', 'quick_hangup', 'invalid_number')")
        else:
            where_clauses.append("status = ?")
            params.append(sf)

    if dtmf_filter and dtmf_filter.lower() != "all":
        if dtmf_filter.lower() == "none":
            where_clauses.append("(dtmf IS NULL OR dtmf = '' OR dtmf = 'None')")
        else:
            where_clauses.append("dtmf = ?")
            params.append(dtmf_filter)

    query = f"""
        SELECT 
            phone_number, name, status, dtmf, duration, 
            did_used, call_time, call_id, ref_id, error_message
        FROM leads 
        WHERE {' AND '.join(where_clauses)}
        ORDER BY rowid ASC
    """
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

# -------------------------------------------------------------
# WEBHOOK SUBSCRIPTIONS
# -------------------------------------------------------------
def create_webhook_sub(url: str, events: List[str], secret: Optional[str] = None, description: Optional[str] = None) -> Dict[str, Any]:
    sub_id = f"whk_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now().isoformat()
    events_json = json.dumps(events)
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO webhook_subscriptions (id, url, events, secret, description, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        """, (sub_id, url, events_json, secret or None, description or None, now_iso, now_iso))
        conn.commit()
    return {
        "id": sub_id,
        "url": url,
        "events": events,
        "secret": secret,
        "description": description,
        "is_active": True,
        "created_at": now_iso,
        "updated_at": now_iso
    }

def list_webhook_subs() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM webhook_subscriptions ORDER BY created_at DESC").fetchall()
        subs = []
        for r in rows:
            d = dict(r)
            try:
                d["events"] = json.loads(d["events"])
            except Exception:
                d["events"] = []
            d["is_active"] = bool(d["is_active"])
            subs.append(d)
        return subs

def delete_webhook_sub(sub_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM webhook_subscriptions WHERE id = ?", (sub_id,))
        conn.commit()
        return cursor.rowcount > 0

def toggle_webhook_sub(sub_id: str, is_active: bool) -> bool:
    now_iso = datetime.now().isoformat()
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE webhook_subscriptions SET is_active = ?, updated_at = ? WHERE id = ?",
            (1 if is_active else 0, now_iso, sub_id)
        )
        conn.commit()
        return cursor.rowcount > 0

def get_matching_webhook_subs(event: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM webhook_subscriptions WHERE is_active = 1").fetchall()
        matching = []
        for r in rows:
            d = dict(r)
            try:
                evs = json.loads(d["events"])
            except Exception:
                evs = []
            if "*" in evs or event in evs:
                d["events"] = evs
                d["is_active"] = True
                matching.append(d)
        return matching

# Initialize schema and migrate legacy statuses immediately on import
init_db()
migrate_legacy_statuses()
