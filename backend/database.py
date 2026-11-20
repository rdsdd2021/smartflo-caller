import sqlite3
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartflo_db.sqlite"))

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
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

        # Check and migrate campaigns table for api_key
        cursor.execute("PRAGMA table_info(campaigns);")
        cols = [r["name"] for r in cursor.fetchall()]
        if "api_key" not in cols:
            cursor.execute("ALTER TABLE campaigns ADD COLUMN api_key TEXT DEFAULT '865fac0f-bed8-491c-aa22-59c55c94d00c';")

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
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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
    google_sheet_name_col: Optional[str] = None
) -> Dict[str, Any]:
    cid = f"camp_{uuid.uuid4().hex[:8]}"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO campaigns (
                id, name, status, concurrency, ivr_id, ivr_name, api_key,
                did_mode, single_did, inter_call_delay,
                google_sheet_url, google_sheet_phone_col, google_sheet_name_col,
                created_at, updated_at
            ) VALUES (?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cid, name, concurrency, ivr_id, ivr_name, api_key,
            did_mode, single_did, inter_call_delay,
            google_sheet_url, google_sheet_phone_col, google_sheet_name_col,
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
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?", (status, now, campaign_id))
        conn.commit()

def update_campaign_settings(campaign_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    allowed = [
        "name", "concurrency", "ivr_id", "ivr_name", "api_key", "did_mode", "single_did",
        "inter_call_delay", "google_sheet_url", "google_sheet_phone_col", "google_sheet_name_col"
    ]
    set_clause = []
    params = []
    for k, v in updates.items():
        if k in allowed:
            set_clause.append(f"{k} = ?")
            params.append(v)
    if not set_clause:
        return get_campaign(campaign_id)
        
    set_clause.append("updated_at = ?")
    params.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    params.append(campaign_id)
    
    with get_connection() as conn:
        conn.execute(f"UPDATE campaigns SET {', '.join(set_clause)} WHERE id = ?", params)
        conn.commit()
    return get_campaign(campaign_id)

def delete_campaign(campaign_id: str) -> bool:
    with get_connection() as conn:
        conn.execute("DELETE FROM leads WHERE campaign_id = ?", (campaign_id,))
        conn.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))
        conn.commit()
    return True

def sync_campaign_counters(campaign_id: str):
    """Refreshes total, completed, answered, missed counters directly in campaigns table."""
    with get_connection() as conn:
        row = conn.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed', 'missed', 'failed') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as answered,
                SUM(CASE WHEN status IN ('missed', 'failed') THEN 1 ELSE 0 END) as missed
            FROM leads WHERE campaign_id = ?
        """, (campaign_id,)).fetchone()
        
        total = row["total"] or 0
        completed = row["completed"] or 0
        answered = row["answered"] or 0
        missed = row["missed"] or 0
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        conn.execute("""
            UPDATE campaigns SET 
                total_leads = ?, 
                completed_leads = ?, 
                answered_leads = ?, 
                missed_leads = ?,
                updated_at = ?
            WHERE id = ?
        """, (total, completed, answered, missed, now, campaign_id))
        conn.commit()

# -------------------------------------------------------------
# LEADS REPOSITORY & 10K+ SERVER-SIDE PAGINATION
# -------------------------------------------------------------
def bulk_insert_leads(campaign_id: str, leads_data: List[tuple]) -> int:
    """Inserts list of (phone, name, [optional sheet_row_index]) in a single atomic transaction."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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
    search: Optional[str] = None
) -> Dict[str, Any]:
    """High-speed paginated query with sub-millisecond index search."""
    page = max(1, page)
    limit = max(1, min(200, limit))
    offset = (page - 1) * limit

    where_clauses = ["campaign_id = ?"]
    params: List[Any] = [campaign_id]

    if status_filter and status_filter.lower() != "all":
        where_clauses.append("status = ?")
        params.append(status_filter.lower())

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
                SUM(CASE WHEN status IN ('completed', 'missed', 'failed') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as answered,
                SUM(CASE WHEN status IN ('missed', 'failed') THEN 1 ELSE 0 END) as missed,
                SUM(CASE WHEN status = 'dialing' THEN 1 ELSE 0 END) as dialing,
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
    missed = counts["missed"] or 0
    dialing = counts["dialing"] or 0
    pending = counts["pending"] or 0
    total_dur = counts["total_duration"] or 0

    return {
        "campaign": dict(camp),
        "total_leads": total,
        "completed_leads": completed,
        "answered_leads": answered,
        "missed_leads": missed,
        "dialing_leads": dialing,
        "pending_leads": pending,
        "answer_rate": round((answered / completed * 100), 1) if completed > 0 else 0,
        "total_duration": total_dur,
        "avg_duration": round(total_dur / answered, 1) if answered > 0 else 0,
        "dtmf_counts": dtmf_counts
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
            WHERE campaign_id = ? AND status IN ('dialing', 'connected')
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
            WHERE campaign_id = ? AND status IN ('missed', 'failed')
        """, (campaign_id,))
        count = cursor.rowcount
        conn.commit()
    sync_campaign_counters(campaign_id)
    return count

def get_leads_for_export(campaign_id: str, status_filter: str = "all", dtmf_filter: str = "all") -> List[Dict[str, Any]]:
    where_clauses = ["campaign_id = ?"]
    params: List[Any] = [campaign_id]

    if status_filter and status_filter.lower() != "all":
        where_clauses.append("status = ?")
        params.append(status_filter.lower())

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

# Initialize schema immediately on import
init_db()
