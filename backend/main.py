import os
import sys
import io
import json
import uuid
import traceback
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Response, Request, WebSocket, WebSocketDisconnect, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, PlainTextResponse, JSONResponse
from config import config
import database
from ws_manager import ws_manager
from models import (
    CreateCampaignRequest,
    UpdateCampaignRequest,
    PaginatedLeadsResponse,
    CampaignSummaryResponse,
    TrunkStatusResponse,
    ImportNumbersRequest, 
    UpdateSettingsRequest,
    GoogleSheetConnectRequest,
    GoogleSheetImportRequest,
    CreateIVRRequest,
    DIDSettingsRequest,
    ConcurrencyRequest,
    UploadAudioUrlRequest,
    AudienceFilterRule,
    CheckCountRequest,
    ImportAudienceFilterRequest,
    CreateFieldMetaRequest,
    UpdateFieldMetaRequest,
    CreateContactRequest,
    UpdateContactRequest,
    LoginRequest,
    CreateUserRequest,
    UpdateUserRequest,
    ChangePasswordRequest,
    WebhookSubscriptionCreateRequest,
    WebhookSubscriptionToggleRequest,
    WebhookTestRequest,
    SmartfloInboundWebhookModel
)
from auth_service import auth_service, create_access_token, decode_access_token
from contacts_service import contacts_service
from webhook_service import webhook_service
from queue_worker import campaign_engine, TOTAL_TRUNK_CAPACITY
from excel_service import (
    export_records_to_excel_bytes,
    export_records_to_csv_string,
    parse_numbers_from_text, 
    parse_numbers_from_file
)
from smartflo_client import smartflo_client
from google_sheets_service import google_sheets_service
from ingestion_service import ingestion_service, TEMP_UPLOADS_DIR

API_DESCRIPTION = """
## Smartflo Telecom Dialer & Contacts CRM REST API

Welcome to the **Tata Tele Business Services (TTBS) Smartflo Cloud Dialer** command center API.

### Core Capabilities
- **High-Density Voice Pacing**: Orchestrates high-volume outbound calling across a 15-channel SIP trunk with automatic 44-DID round-robin rotation.
- **Dynamic Contacts CRM**: Stores and filters 200,000+ leads with flexible schema definitions and JSONB query acceleration.
- **Lead Conflict Prevention**: Built-in intra-campaign deduplication, active dial collision guards, and 24h/2h outcome-aware cooldown policies.
- **Event-Driven Webhooks**:
  - **Inbound Webhook Receiver**: Processes sub-second CDR and live DTMF callbacks from Smartflo (`POST /api/webhooks/smartflo`).
  - **Outbound Webhook Dispatcher**: Fires signed HMAC-SHA256 events (`call.completed`, `lead.dtmf_pressed`, `campaign.finished`) to external CRM systems and webhook listeners.

### Interactive Swagger UI
Authorize using your Bearer JWT token by clicking the **Authorize** button on the top right.
"""

TAGS_METADATA = [
    {
        "name": "Authentication & Team",
        "description": "User login, JWT token issuance, and Superadmin team management (RBAC).",
    },
    {
        "name": "Campaign Operations",
        "description": "Lifecycle orchestration for voice campaigns: create, start, pause, resume, clear, and export.",
    },
    {
        "name": "Contacts CRM",
        "description": "Master contact directory with customizable attributes, column visibility, and single/bulk ingestion.",
    },
    {
        "name": "Audience Segmentation",
        "description": "Dynamic filter builder for querying leads by tags, attributes, and call status.",
    },
    {
        "name": "Telecom Trunk & Telemetry",
        "description": "Trunk line utilization, active channel monitoring, and real-time WebSocket telemetry.",
    },
    {
        "name": "IVR & Audio Flows",
        "description": "Smartflo IVR flows, voice prompt management, and audio recording library.",
    },
    {
        "name": "Webhooks & Integrations",
        "description": "Inbound Smartflo telecom event callbacks and outbound webhook subscriptions with HMAC signature verification.",
    },
]

app = FastAPI(
    title="Smartflo Telecom Dialer & Contacts CRM API",
    description=API_DESCRIPTION,
    version="3.1.0",
    openapi_tags=TAGS_METADATA,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Enforces enterprise security headers across all HTTP responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": f"Internal server error: {str(exc)}",
            "error": str(type(exc).__name__)
        }
    )

@app.get("/api/health", tags=["Telecom Trunk & Telemetry"], summary="Health Check")
def health_check():
    return {
        "status": "ok", 
        "total_trunk_channels": TOTAL_TRUNK_CAPACITY,
        "dids_count": len(config.active_dids),
        "db_connected": True
    }

# -------------------------------------------------------------
# AUTH & ROLE-BASED ACCESS CONTROL (SUPERADMIN, ADMIN, AGENT)
# -------------------------------------------------------------
security_bearer = HTTPBearer(auto_error=False)

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> Dict[str, Any]:
    raw_token = None
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
    elif "smartflo_token" in request.cookies:
        raw_token = request.cookies.get("smartflo_token")

    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    payload = decode_access_token(raw_token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please log in again.")
    user = auth_service.get_user_by_id(payload["sub"])
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User account is deactivated or deleted.")
    return user

def require_superadmin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin privilege required for this action.")
    return user

def require_admin_or_superadmin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Admin privilege required for this action.")
    return user

@app.on_event("startup")
async def on_app_startup():
    auth_service.init_default_superadmin()
    try:
        import asyncio
        ingestion_service.set_event_loop(asyncio.get_running_loop())
    except Exception as e:
        print(f"[Startup] Ingestion event loop init notice: {e}")

@app.post("/api/auth/login", tags=["Authentication & Team"], summary="Authenticate User")
def login(payload: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    # Enforce brute-force lockout protection (5 failed attempts per 15-minute window)
    is_locked, remaining_sec = auth_service.check_login_rate_limit(payload.email, client_ip)
    if is_locked:
        mins = max(1, remaining_sec // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Security lock active. Please retry in {mins} minute(s)."
        )

    user = auth_service.authenticate(payload.email, payload.password)
    if not user:
        auth_service.record_failed_attempt(payload.email, client_ip)
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Successful authentication: clear previous failed attempts
    auth_service.reset_failed_attempts(payload.email, client_ip)
    token = create_access_token({"sub": user["id"], "email": user["email"], "role": user["role"]})
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@app.get("/api/auth/me", tags=["Authentication & Team"], summary="Get Current Authenticated User")
def get_my_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": current_user}

@app.put("/api/auth/me/password", tags=["Authentication & Team"], summary="Change Current User Password")
def change_my_password(payload: ChangePasswordRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    ok, msg = auth_service.change_password(current_user["id"], payload.current_password, payload.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}

@app.get("/api/auth/users", tags=["Authentication & Team"], summary="List All Users (Superadmin Only)")
def list_users(superadmin: Dict[str, Any] = Depends(require_superadmin)):
    return {"users": auth_service.list_users()}

@app.post("/api/auth/users", tags=["Authentication & Team"], summary="Create Team User (Superadmin Only)")
def create_user(payload: CreateUserRequest, superadmin: Dict[str, Any] = Depends(require_superadmin)):
    ok, msg, user = auth_service.create_user(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        role=payload.role
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "user": user}

@app.put("/api/auth/users/{user_id}", tags=["Authentication & Team"], summary="Update User Role/Status (Superadmin Only)")
def update_user(user_id: str, payload: UpdateUserRequest, superadmin: Dict[str, Any] = Depends(require_superadmin)):
    updates = payload.model_dump(exclude_unset=True)
    ok, msg = auth_service.update_user(user_id, updates)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}

@app.delete("/api/auth/users/{user_id}", tags=["Authentication & Team"], summary="Delete User (Superadmin Only)")
def delete_user(user_id: str, superadmin: Dict[str, Any] = Depends(require_superadmin)):
    ok, msg = auth_service.delete_user(user_id, superadmin["id"])
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}

# -------------------------------------------------------------
# REAL-TIME WEBSOCKET TELEMETRY & SMARTFLO WEBHOOKS
# -------------------------------------------------------------
@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        trunk_status = campaign_engine.get_trunk_status()
        await websocket.send_json({
            "type": "initial_state",
            "trunk_status": trunk_status.model_dump()
        })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

@app.post("/api/webhooks/smartflo", tags=["Webhooks & Integrations"], summary="Smartflo Inbound Webhook Receiver")
async def smartflo_webhook_listener(request: Request):
    """
    Sub-second telecom event webhook receiver for Tata Smartflo callbacks.
    Broadcasts ringing, pickup, DTMF, and hangup events in real time to UI via WebSocket,
    and dispatches the payload to external webhook subscribers.
    """
    try:
        payload = await request.json()
    except Exception:
        try:
            payload = dict(await request.form())
        except Exception:
            payload = {}

    ref_id = payload.get("ref_id") or payload.get("custom_id")
    event = (payload.get("event") or payload.get("status") or "").lower()
    dtmf = payload.get("dtmf") or payload.get("dtmf_input")
    call_id = payload.get("call_id") or payload.get("id")

    # Broadcast to live UI via WebSocket
    await ws_manager.broadcast({
        "type": "telecom_event",
        "event": event,
        "ref_id": ref_id,
        "dtmf": dtmf,
        "payload": payload
    })

    # Dispatch to external webhook subscribers
    try:
        webhook_service.dispatch_event("smartflo.callback", {
            "ref_id": ref_id,
            "call_id": call_id,
            "event": event,
            "dtmf": dtmf,
            "payload": payload
        })
    except Exception:
        pass

    return {"status": "ok", "received": True}

# -------------------------------------------------------------
# OUTBOUND WEBHOOK SUBSCRIPTIONS
# -------------------------------------------------------------
@app.get("/api/webhooks/subscriptions", tags=["Webhooks & Integrations"], summary="List Webhook Subscriptions")
def list_webhook_subscriptions():
    """Returns all registered outbound webhook subscriptions with target events and active status."""
    return {"subscriptions": webhook_service.list_subscriptions()}

@app.post("/api/webhooks/subscriptions", tags=["Webhooks & Integrations"], summary="Create Webhook Subscription")
def create_webhook_subscription(payload: WebhookSubscriptionCreateRequest):
    """
    Registers a new webhook URL to receive outbound dialer events.
    Events can include: `call.completed`, `lead.dtmf_pressed`, `smartflo.callback`, or `*` for all.
    Optionally pass a secret key to enable HMAC-SHA256 signature verification in the `X-Smartflo-Signature` header.
    """
    try:
        sub = webhook_service.create_subscription(
            url=payload.url,
            events=payload.events,
            secret=payload.secret,
            description=payload.description
        )
        return {"success": True, "subscription": sub}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/webhooks/subscriptions/{sub_id}/toggle", tags=["Webhooks & Integrations"], summary="Toggle Webhook Active State")
def toggle_webhook_subscription(sub_id: str, payload: WebhookSubscriptionToggleRequest):
    """Enables or disables an existing webhook subscription."""
    ok = webhook_service.toggle_subscription(sub_id, payload.is_active)
    if not ok:
        raise HTTPException(status_code=404, detail="Webhook subscription not found")
    return {"success": True, "is_active": payload.is_active}

@app.delete("/api/webhooks/subscriptions/{sub_id}", tags=["Webhooks & Integrations"], summary="Delete Webhook Subscription")
def delete_webhook_subscription(sub_id: str):
    """Permanently deletes a registered webhook subscription."""
    ok = webhook_service.delete_subscription(sub_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Webhook subscription not found")
    return {"success": True}

@app.post("/api/webhooks/test", tags=["Webhooks & Integrations"], summary="Test Webhook Endpoint")
def test_webhook_url(payload: WebhookTestRequest):
    """
    Sends a sample test event payload to the specified webhook URL.
    Returns HTTP response status code, latency in milliseconds, and response body snippet.
    """
    result = webhook_service.test_webhook_url(
        url=payload.url,
        event=payload.event,
        secret=payload.secret
    )
    return result

# -------------------------------------------------------------
# GLOBAL TRUNK & SYSTEM OVERVIEW
# -------------------------------------------------------------
@app.get("/api/trunk/status", response_model=TrunkStatusResponse, tags=["Telecom Trunk & Telemetry"], summary="Get Live Trunk Capacity & Channels")
def get_trunk_status():
    return campaign_engine.get_trunk_status()

# -------------------------------------------------------------
# CONTACTS CRM, CUSTOM FIELDS & AUDIENCE SEGMENTATION
# -------------------------------------------------------------
@app.get("/api/contacts/fields", tags=["Contacts CRM"], summary="Get All Custom Datapoints Schema")
def get_custom_fields():
    return {
        "fields": contacts_service.get_all_filter_fields(),
        "custom_fields": contacts_service.get_fields_meta()
    }

@app.get("/api/contacts/field-values", tags=["Contacts CRM"], summary="Get Distinct Values for Dropdown Filter")
def get_field_distinct_values(
    field: str = Query(...),
    search: Optional[str] = Query(None),
    limit: int = Query(2000, ge=1, le=5000),
    refresh: bool = Query(False)
):
    return {
        "field": field,
        "values": contacts_service.get_distinct_field_values(field, limit=limit, search=search, refresh=refresh)
    }

@app.post("/api/contacts/inspect-file", tags=["Contacts CRM"], summary="Inspect Upload File Headers and Preview")
async def inspect_contacts_file(file: UploadFile = File(...)):
    """Inspects an uploaded CSV or Excel file and returns its column headers and top 3 preview rows."""
    filename = file.filename or "file.csv"
    fn = filename.lower()

    content = await file.read(2 * 1024 * 1024)
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    headers = []
    preview = []

    if fn.endswith((".xlsx", ".xls")):
        import openpyxl
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            header_row = next(rows_iter, None)
            if header_row:
                headers = [str(c or "").strip() for c in header_row if c is not None and str(c).strip()]
                for row in rows_iter:
                    if any(row):
                        preview.append({
                            headers[i]: str(row[i]).strip() if i < len(row) and row[i] is not None else ""
                            for i in range(len(headers))
                        })
                        if len(preview) >= 3:
                            break
            wb.close()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel workbook: {e}")
    else:
        try:
            text = content.decode("utf-8", errors="replace")
            reader = csv.reader(io.StringIO(text))
            header_row = next(reader, None)
            if header_row:
                headers = [str(c).strip() for c in header_row if str(c).strip()]
                for row in reader:
                    if any(row):
                        preview.append({
                            headers[i]: str(row[i]).strip() if i < len(row) and row[i] is not None else ""
                            for i in range(len(headers))
                        })
                        if len(preview) >= 3:
                            break
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read CSV file: {e}")

    return {
        "success": True,
        "filename": filename,
        "headers": headers,
        "preview": preview
    }

@app.post("/api/contacts/fields", tags=["Contacts CRM"], summary="Create New Custom Datapoint Definition")
def create_custom_field(payload: CreateFieldMetaRequest):
    field = contacts_service.create_field_meta(
        label=payload.label,
        field_type=payload.field_type,
        options=payload.options
    )
    return {"success": True, "field": field}

@app.put("/api/contacts/fields/{field_id}", tags=["Contacts CRM"], summary="Update Custom Datapoint Definition")
def update_custom_field(field_id: str, payload: UpdateFieldMetaRequest):
    updates = payload.model_dump(exclude_unset=True)
    ok = contacts_service.update_field_meta(field_id, updates)
    return {"success": ok}

@app.delete("/api/contacts/fields/{field_id}", tags=["Contacts CRM"], summary="Delete Custom Datapoint Definition")
def delete_custom_field(field_id: str):
    ok = contacts_service.delete_field_meta(field_id)
    return {"success": ok}

@app.post("/api/contacts/check-count", tags=["Audience Segmentation"], summary="Calculate Matching Audience Count")
def check_audience_count(payload: CheckCountRequest):
    rules = [r.model_dump() for r in payload.filters]
    count = contacts_service.check_audience_count(rules)
    return {"matching_count": count, "filters": rules}

@app.get("/api/contacts", tags=["Contacts CRM"], summary="List Contacts with Filtering & Search")
def list_contacts(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    filters: Optional[str] = Query(None)
):
    filter_rules = []
    if filters:
        try:
            import json
            filter_rules = json.loads(filters)
        except Exception:
            pass
    return contacts_service.get_paginated_contacts(page=page, page_size=limit, search=search, filter_rules=filter_rules)

@app.get("/api/contacts/{contact_id}/timeline", tags=["Contacts CRM"], summary="Get Lifetime Call History Timeline")
def get_contact_timeline(contact_id: str):
    return contacts_service.get_contact_timeline(contact_id)

@app.post("/api/contacts", tags=["Contacts CRM"], summary="Create Single Contact")
def create_contact(payload: CreateContactRequest):
    try:
        contact = contacts_service.create_single_contact(
            phone_number=payload.phone_number,
            name=payload.name,
            attributes=payload.attributes
        )
        return {"success": True, "contact": contact}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/contacts/{contact_id}", tags=["Contacts CRM"], summary="Update Contact Attributes")
def update_contact(contact_id: str, payload: UpdateContactRequest):
    updates = payload.model_dump(exclude_unset=True)
    ok = contacts_service.update_contact(contact_id, updates)
    return {"success": ok}

@app.delete("/api/contacts/{contact_id}", tags=["Contacts CRM"], summary="Delete Single Contact")
def delete_contact(contact_id: str):
    ok = contacts_service.delete_contact(contact_id)
    return {"success": ok}

@app.get("/api/contacts/sample-template", tags=["Contacts CRM"], summary="Download Sample Contacts Template")
def download_sample_contacts_template(format: str = Query("csv", pattern="^(csv|xlsx)$")):
    fields = contacts_service.get_fields_meta()
    
    headers = ["phone_number", "name"]
    for f in fields:
        k = f.get("field_key")
        if k and k not in ["phone_number", "name", "phone", "mobile", "student_name"]:
            headers.append(k)
            
    sample_rows = [
        ["919876543210", "Rahul Sharma", "Male", "General", "Science", "Delhi Public School", "Delhi", "94"],
        ["919876543211", "Priya Patel", "Female", "OBC", "Commerce", "St. Xaviers High School", "Ahmedabad", "88"],
        ["919876543212", "Ananya Das", "Female", "General", "Arts", "Modern High School", "Kolkata", "91"],
        ["919876543213", "Aman Verma", "Male", "SC", "Science", "Kendriya Vidyalaya", "Lucknow", "82"],
        ["919876543214", "Sneha Kulkarni", "Female", "EWS", "Commerce", "Bishop Cotton School", "Pune", "86"]
    ]
    
    normalized_rows = []
    for r in sample_rows:
        row = list(r)
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
        else:
            row = row[:len(headers)]
        normalized_rows.append(row)

    if format == "xlsx":
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.utils import get_column_letter

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Master Contacts Template"
        ws.append(headers)

        header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center")

        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align

        for row in normalized_rows:
            ws.append(row)

        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 16)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)

        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=sample_contacts_template.xlsx"}
        )
    else:
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for r in normalized_rows:
            writer.writerow(r)

        csv_data = output.getvalue()
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=sample_contacts_template.csv"}
        )

@app.post("/api/contacts/upload")
@app.post("/api/contacts/upload-async")
async def upload_contacts_file(
    file: UploadFile = File(...),
    mapping: Optional[str] = Form(None)
):
    try:
        filename = file.filename or "contacts_upload.csv"
        job_id = f"job_{uuid.uuid4().hex[:10]}"
        safe_name = "".join(c for c in filename if c.isalnum() or c in (".", "_", "-"))
        file_path = os.path.join(TEMP_UPLOADS_DIR, f"{job_id}_{safe_name}")

        # Stream write to disk in 1MB chunks (Never consumes more than 1MB RAM even for 1 Lakh rows!)
        try:
            with open(file_path, "wb") as f:
                while chunk := await file.read(1024 * 1024):
                    f.write(chunk)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to receive file: {e}")

        column_mapping = json.loads(mapping) if mapping else {}
        total_estimated = ingestion_service.estimate_total_rows(file_path, filename)

        # Register persistent background job in database
        job = database.create_import_job(
            job_type="contacts",
            filename=filename,
            file_path=file_path,
            total_rows=total_estimated,
            metadata={"mapping": column_mapping},
            job_id=job_id
        )

        # Launch non-blocking background ingestion worker
        ingestion_service.start_contacts_job(job_id, file_path, filename, column_mapping)

        return {
            "success": True,
            "job_id": job_id,
            "status": "processing",
            "total_rows": total_estimated,
            "filename": filename,
            "message": f"File received ({total_estimated} rows). Ingestion is running in the background."
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": f"Contacts upload failed: {str(e)}"}
        )

# -------------------------------------------------------------
# BACKGROUND IMPORT JOB TRACKING ENDPOINTS
# -------------------------------------------------------------
@app.get("/api/import-jobs/active", tags=["Contacts CRM"], summary="Get Active Ingestion Jobs")
def get_active_import_jobs(job_type: Optional[str] = Query(None)):
    return {"jobs": database.list_active_import_jobs(job_type)}

@app.get("/api/import-jobs/{job_id}", tags=["Contacts CRM"], summary="Get Import Job Status & Progress")
def get_import_job_status(job_id: str):
    job = database.get_import_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return job

# -------------------------------------------------------------
# CAMPAIGN CRUD ENDPOINTS
# -------------------------------------------------------------
@app.get("/api/campaigns")
def list_all_campaigns():
    camps = database.list_campaigns()
    # Attach active running state from engine and calculate answer rate instantly
    for c in camps:
        cid = c["id"]
        if cid in campaign_engine.runners:
            c["live_status"] = campaign_engine.runners[cid].status
        else:
            c["live_status"] = c.get("status", "idle")
        completed = c.get("completed_leads", 0)
        answered = c.get("answered_leads", 0)
        c["answer_rate"] = round((answered / completed * 100), 1) if completed > 0 else 0
    return {"campaigns": camps}

@app.post("/api/campaigns")
def create_new_campaign(payload: CreateCampaignRequest):
    filters_data = [f.model_dump() for f in payload.audience_filters] if payload.audience_filters else []
    camp = database.create_campaign(
        name=payload.name,
        concurrency=payload.concurrency,
        ivr_id=payload.ivr_id,
        ivr_name=payload.ivr_name,
        api_key=payload.api_key or "865fac0f-bed8-491c-aa22-59c55c94d00c",
        did_mode=payload.did_mode,
        single_did=payload.single_did or config.single_did,
        inter_call_delay=payload.inter_call_delay,
        audience_filters=filters_data,
        google_sheet_url=payload.google_sheet_url,
        google_sheet_phone_col=payload.google_sheet_phone_col,
        google_sheet_name_col=payload.google_sheet_name_col,
        dedup_intra_campaign=payload.dedup_intra_campaign if payload.dedup_intra_campaign is not None else True,
        dedup_cross_active=payload.dedup_cross_active if payload.dedup_cross_active is not None else True,
        enable_cooldown=payload.enable_cooldown if payload.enable_cooldown is not None else True,
        cooldown_answered_hours=payload.cooldown_answered_hours or 24,
        cooldown_missed_hours=payload.cooldown_missed_hours or 2,
        exclude_dnd=payload.exclude_dnd if payload.exclude_dnd is not None else True
    )
    ingestion_summary = None
    # If audience filter criteria were specified, populate campaign leads from Supabase Contacts directory
    if payload.audience_filters:
        rules = [f.model_dump() for f in payload.audience_filters]
        try:
            summary = contacts_service.populate_campaign_leads(
                camp["id"],
                rules,
                force_override=bool(payload.force_override),
                custom_policies={
                    "dedup_intra_campaign": payload.dedup_intra_campaign,
                    "dedup_cross_active": payload.dedup_cross_active,
                    "enable_cooldown": payload.enable_cooldown,
                    "cooldown_answered_hours": payload.cooldown_answered_hours,
                    "cooldown_missed_hours": payload.cooldown_missed_hours,
                    "exclude_dnd": payload.exclude_dnd
                }
            )
            ingestion_summary = summary
            camp["total_leads"] = summary.get("enqueued_count", 0)
        except Exception as e:
            print(f"[Supabase] Error populating campaign from audience filters: {e}")

    # Register in engine
    campaign_engine.get_runner(camp["id"])
    return {"success": True, "campaign": camp, "ingestion_summary": ingestion_summary}

@app.get("/api/campaigns/{campaign_id}")
def get_campaign_detail(campaign_id: str):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    summary = database.get_campaign_summary(campaign_id)
    if summary:
        camp.update({
            "total_leads": summary.get("total_leads", camp.get("total_leads", 0)),
            "completed_leads": summary.get("completed_leads", 0),
            "answered_leads": summary.get("answered_leads", 0),
            "no_answer_leads": summary.get("no_answer_leads", 0),
            "rejected_leads": summary.get("rejected_leads", 0),
            "busy_leads": summary.get("busy_leads", 0),
            "unreachable_leads": summary.get("unreachable_leads", 0),
            "quick_hangup_leads": summary.get("quick_hangup_leads", 0),
            "invalid_number_leads": summary.get("invalid_number_leads", 0),
            "failed_leads": summary.get("failed_leads", 0),
            "missed_leads": summary.get("missed_leads", 0),
            "dialing_leads": summary.get("dialing_leads", 0),
            "pending_leads": summary.get("pending_leads", 0),
            "answer_rate": summary.get("answer_rate", 0),
            "dtmf_counts": summary.get("dtmf_counts", {}),
            "dtmf_leads": summary.get("dtmf_leads", camp.get("dtmf_leads", 0))
        })
    runner = campaign_engine.get_runner(campaign_id)
    camp["live_status"] = runner.status
    camp["channel_slots"] = [s.model_dump() for s in runner.get_slots()]
    return camp

@app.put("/api/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, payload: UpdateCampaignRequest):
    updates = payload.model_dump(exclude_unset=True)
    camp = database.update_campaign_settings(campaign_id, updates)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    # Update runner in memory
    runner = campaign_engine.get_runner(campaign_id)
    if "concurrency" in updates and updates["concurrency"] is not None:
        runner.set_concurrency(updates["concurrency"])
        campaign_engine.rebalance_channels()
    runner.campaign_data.update(camp)
    return {"success": True, "campaign": camp}

@app.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str):
    runner = campaign_engine.runners.get(campaign_id)
    if runner and runner.status == "running":
        runner.stop()
        campaign_engine.rebalance_channels()
    database.delete_campaign(campaign_id)
    if campaign_id in campaign_engine.runners:
        del campaign_engine.runners[campaign_id]
    return {"success": True, "message": "Campaign and leads deleted"}

# -------------------------------------------------------------
# CAMPAIGN EXECUTION & CHANNEL-SPLIT CONTROLS
# -------------------------------------------------------------
@app.post("/api/campaigns/{campaign_id}/start")
async def start_campaign(campaign_id: str):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if camp["total_leads"] == 0:
        raise HTTPException(status_code=400, detail="No leads found in this campaign. Please import contacts first.")
    
    try:
        res = campaign_engine.start_campaign(campaign_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/campaigns/{campaign_id}/pause")
async def pause_campaign(campaign_id: str):
    return campaign_engine.pause_campaign(campaign_id)

@app.post("/api/campaigns/{campaign_id}/resume")
async def resume_campaign(campaign_id: str):
    try:
        return campaign_engine.resume_campaign(campaign_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/campaigns/{campaign_id}/stop")
async def stop_campaign(campaign_id: str):
    return campaign_engine.stop_campaign(campaign_id)

@app.post("/api/campaigns/{campaign_id}/retry-missed")
async def retry_missed(campaign_id: str):
    try:
        res = campaign_engine.retry_missed(campaign_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# -------------------------------------------------------------
# SERVER-SIDE PAGINATED LEADS & SUMMARY (10K+ SCALE)
# -------------------------------------------------------------
@app.get("/api/campaigns/{campaign_id}/summary", response_model=CampaignSummaryResponse)
def get_campaign_summary(campaign_id: str):
    summary = database.get_campaign_summary(campaign_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Campaign not found")
    runner = campaign_engine.get_runner(campaign_id)
    summary["channel_slots"] = runner.get_slots()
    return summary

@app.get("/api/campaigns/{campaign_id}/leads", response_model=PaginatedLeadsResponse)
def get_paginated_leads(
    campaign_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    page_size: Optional[int] = Query(None),
    status: Optional[str] = Query("all"),
    search: Optional[str] = Query(None),
    dtmf: Optional[str] = Query("all")
):
    actual_limit = page_size if page_size is not None else limit
    res = database.get_paginated_leads(
        campaign_id=campaign_id,
        page=page,
        limit=actual_limit,
        status_filter=status,
        search=search,
        dtmf_filter=dtmf
    )
    res["leads"] = res["items"]
    return res

# -------------------------------------------------------------
# LEAD INGESTION ENDPOINTS (BOUND TO CAMPAIGN)
# -------------------------------------------------------------
@app.post("/api/campaigns/{campaign_id}/import-text")
@app.post("/api/campaigns/{campaign_id}/import/text")
def import_text(campaign_id: str, payload: ImportNumbersRequest):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if not payload.raw_text:
        raise HTTPException(status_code=400, detail="raw_text is required")
    parsed = parse_numbers_from_text(payload.raw_text)
    if not parsed:
        raise HTTPException(status_code=400, detail="No valid phone numbers found in input")

    candidates = [{"phone_number": p[0], "name": p[1] if len(p) > 1 else ""} for p in parsed]
    policies = {
        "dedup_intra_campaign": camp.get("dedup_intra_campaign", 1) == 1,
        "dedup_cross_active": camp.get("dedup_cross_active", 1) == 1,
        "enable_cooldown": camp.get("enable_cooldown", 1) == 1,
        "cooldown_answered_hours": camp.get("cooldown_answered_hours", 24),
        "cooldown_missed_hours": camp.get("cooldown_missed_hours", 2),
        "exclude_dnd": camp.get("exclude_dnd", 1) == 1,
        "force_override": bool(payload.force_override)
    }
    eligible, skipped, summary = contacts_service.evaluate_lead_eligibility(candidates, campaign_id, policies)
    count = 0
    if eligible:
        sqlite_batch = [(l["phone_number"], l["name"]) for l in eligible]
        count = database.bulk_insert_leads(campaign_id, sqlite_batch)
    return {"success": True, "count": count, "imported_leads": count, "summary": summary}

@app.post("/api/campaigns/{campaign_id}/upload-file")
@app.post("/api/campaigns/{campaign_id}/import/file")
@app.post("/api/campaigns/{campaign_id}/upload-async")
async def upload_file(
    campaign_id: str,
    file: UploadFile = File(...),
    force_override: Optional[bool] = Form(False)
):
    try:
        camp = database.get_campaign(campaign_id)
        if not camp:
            raise HTTPException(status_code=404, detail="Campaign not found")

        filename = file.filename or "leads_upload.csv"
        job_id = f"job_{uuid.uuid4().hex[:10]}"
        safe_name = "".join(c for c in filename if c.isalnum() or c in (".", "_", "-"))
        file_path = os.path.join(TEMP_UPLOADS_DIR, f"{job_id}_{safe_name}")

        # Stream write in 1MB chunks to disk
        try:
            with open(file_path, "wb") as f:
                while chunk := await file.read(1024 * 1024):
                    f.write(chunk)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to receive file: {e}")

        total_estimated = ingestion_service.estimate_total_rows(file_path, filename)
        database.create_import_job(
            job_type="campaign_leads",
            campaign_id=campaign_id,
            filename=filename,
            file_path=file_path,
            total_rows=total_estimated,
            metadata={"force_override": bool(force_override)},
            job_id=job_id
        )

        ingestion_service.start_campaign_leads_job(
            job_id=job_id,
            campaign_id=campaign_id,
            file_path=file_path,
            filename=filename,
            force_override=bool(force_override)
        )

        return {
            "success": True,
            "job_id": job_id,
            "status": "processing",
            "total_rows": total_estimated,
            "filename": filename,
            "message": f"File received ({total_estimated} rows). Ingestion is running in the background."
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": f"Campaign file upload failed: {str(e)}"}
        )

@app.post("/api/campaigns/{campaign_id}/sheets/inspect")
def inspect_campaign_sheet(campaign_id: str, payload: GoogleSheetConnectRequest):
    res = google_sheets_service.connect(payload.sheet_url, payload.credentials_json)
    return res

@app.post("/api/campaigns/{campaign_id}/clear")
def clear_leads(campaign_id: str):
    database.clear_campaign_leads(campaign_id)
    return {"success": True, "message": "All leads cleared"}

@app.delete("/api/campaigns/{campaign_id}/leads/{lead_id}")
def delete_single_lead(campaign_id: str, lead_id: str):
    success = database.delete_lead(campaign_id, lead_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True, "message": "Lead deleted successfully"}

@app.post("/api/campaigns/{campaign_id}/import-sheet")
@app.post("/api/campaigns/{campaign_id}/sheets/import")
def import_sheet(campaign_id: str, payload: GoogleSheetImportRequest):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        leads_data = google_sheets_service.import_leads(
            sheet_url=payload.sheet_url,
            phone_col=payload.phone_column,
            name_col=payload.name_column
        )
        if not leads_data:
            raise HTTPException(status_code=400, detail="No valid phone numbers found in selected column.")
        
        database.update_campaign_settings(campaign_id, {
            "google_sheet_url": payload.sheet_url,
            "google_sheet_phone_col": payload.phone_column,
            "google_sheet_name_col": payload.name_column
        })
        
        candidates = [{
            "phone_number": p[0],
            "name": p[1] if len(p) > 1 else "",
            "sheet_row_index": p[2] if len(p) > 2 else None
        } for p in leads_data]

        policies = {
            "dedup_intra_campaign": camp.get("dedup_intra_campaign", 1) == 1,
            "dedup_cross_active": camp.get("dedup_cross_active", 1) == 1,
            "enable_cooldown": camp.get("enable_cooldown", 1) == 1,
            "cooldown_answered_hours": camp.get("cooldown_answered_hours", 24),
            "cooldown_missed_hours": camp.get("cooldown_missed_hours", 2),
            "exclude_dnd": camp.get("exclude_dnd", 1) == 1,
            "force_override": bool(payload.force_override)
        }
        eligible, skipped, summary = contacts_service.evaluate_lead_eligibility(candidates, campaign_id, policies)
        count = 0
        if eligible:
            sqlite_batch = [(l["phone_number"], l["name"], l.get("sheet_row_index")) for l in eligible]
            count = database.bulk_insert_leads(campaign_id, sqlite_batch)
        return {"success": True, "count": count, "imported_leads": count, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/campaigns/{campaign_id}/import-audience")
@app.post("/api/campaigns/{campaign_id}/import/audience")
def import_campaign_audience(campaign_id: str, payload: ImportAudienceFilterRequest):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rules = [f.model_dump() for f in payload.filters]
    database.update_campaign_settings(campaign_id, {"audience_filters": rules})
    summary = contacts_service.populate_campaign_leads(
        campaign_id, rules, force_override=bool(payload.force_override)
    )
    count = summary.get("enqueued_count", 0)
    return {"success": True, "count": count, "imported_leads": count, "summary": summary}

@app.get("/api/campaigns/{campaign_id}/export-skipped")
def export_skipped_leads(campaign_id: str):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    csv_content = contacts_service.export_skipped_leads_csv(campaign_id)
    safe_name = "".join(c for c in camp["name"] if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=skipped_leads_{safe_name}.csv"}
    )

@app.post("/api/campaigns/{campaign_id}/force-enqueue-skipped")
def force_enqueue_skipped_leads(campaign_id: str):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    skipped = contacts_service.get_skipped_leads(campaign_id)
    if not skipped:
        raise HTTPException(status_code=400, detail="No skipped leads in memory to force-enqueue.")

    sqlite_batch = [(s["phone_number"], s.get("name", "")) for s in skipped]
    count = database.bulk_insert_leads(campaign_id, sqlite_batch)

    # Sync to Supabase campaign_leads
    try:
        from supabase_client import supabase
        supabase_batch = [{
            "campaign_id": campaign_id,
            "phone_number": s["phone_number"],
            "name": s.get("name", ""),
            "status": "pending"
        } for s in skipped]
        for i in range(0, len(supabase_batch), 1000):
            supabase.insert("campaign_leads", supabase_batch[i:i+1000])
    except Exception as e:
        print(f"[Supabase] sync error: {e}")

    contacts_service.clear_skipped_leads(campaign_id)
    return {
        "success": True,
        "count": count,
        "enqueued_count": count,
        "message": f"Successfully forced and enqueued {count} previously skipped leads."
    }

# -------------------------------------------------------------
# REPORTING & EXPORT WITH ADVANCED FILTERS
# -------------------------------------------------------------
@app.get("/api/campaigns/{campaign_id}/export")
def export_campaign_report(
    campaign_id: str,
    format: str = Query("xlsx", regex="^(xlsx|csv)$"),
    status: str = Query("all"),
    dtmf: str = Query("all")
):
    camp = database.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    records = database.get_leads_for_export(campaign_id, status_filter=status, dtmf_filter=dtmf)
    safe_name = "".join(c for c in camp["name"] if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")

    if format == "csv":
        csv_data = export_records_to_csv_string(records)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={safe_name}_results.csv"}
        )
    else:
        excel_bytes = export_records_to_excel_bytes(records, campaign_name=camp["name"])
        return StreamingResponse(
            excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={safe_name}_results.xlsx"}
        )

# -------------------------------------------------------------
# GOOGLE SHEETS CONNECTOR (HEADER DISCOVERY)
# -------------------------------------------------------------
@app.post("/api/sheets/connect")
def connect_google_sheet(payload: GoogleSheetConnectRequest):
    result = google_sheets_service.connect(payload.sheet_url, payload.credentials_json)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

# -------------------------------------------------------------
# DID POOL CONFIGURATION
# -------------------------------------------------------------
@app.get("/api/dids")
def get_dids():
    return {
        "all_dids": config.available_dids,
        "dids": config.available_dids,
        "active_dids": config.active_dids,
        "did_mode": config.did_mode,
        "single_did": config.single_did,
        "total_count": len(config.available_dids)
    }

@app.post("/api/settings/dids")
def update_did_settings(payload: DIDSettingsRequest):
    if payload.did_mode in ["single", "round_robin"]:
        config.did_mode = payload.did_mode
    if payload.single_did and payload.single_did in config.available_dids:
        config.single_did = payload.single_did
    if payload.active_dids is not None:
        valid_dids = [d for d in payload.active_dids if d in config.available_dids]
        if valid_dids:
            config.active_dids = valid_dids
    return {"success": True, "settings": get_dids()}

# -------------------------------------------------------------
# IVR STUDIO & RECORDINGS ENDPOINTS
# -------------------------------------------------------------
@app.get("/api/ivrs")
def list_ivrs(refresh: bool = False):
    if refresh:
        ivrs = smartflo_client.fetch_ivrs()
    else:
        cached = database.get_cached_ivrs()
        ivrs = cached if cached else smartflo_client.fetch_ivrs()
    return {"ivrs": ivrs, "active_ivr_id": config.ivr_id, "active_ivr_name": config.ivr_name}

@app.get("/api/recordings")
def list_recordings(refresh: bool = False):
    if refresh:
        recordings = smartflo_client.fetch_recordings()
    else:
        cached = database.get_cached_recordings()
        recordings = cached if cached else smartflo_client.fetch_recordings()
    return {"recordings": recordings}

@app.post("/api/recordings/upload")
async def upload_audio_recording(
    file: UploadFile = File(...),
    audio_name: str = Form(...)
):
    if not audio_name.strip():
        raise HTTPException(status_code=400, detail="Audio Name is required")
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="File cannot be empty")
        
    res = smartflo_client.upload_audio_recording(
        audio_name=audio_name.strip(),
        file_bytes=contents,
        filename=file.filename or "recording.mp3"
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to upload recording to Smartflo"))
    return res

@app.post("/api/recordings/upload-url")
def upload_audio_from_url(payload: UploadAudioUrlRequest):
    if not payload.audio_name.strip() or not payload.audio_url.strip():
        raise HTTPException(status_code=400, detail="Audio Name and URL are required")
    res = smartflo_client.upload_audio_from_url(
        audio_name=payload.audio_name.strip(),
        audio_url=payload.audio_url.strip()
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to register audio URL with Smartflo"))
    return res

@app.post("/api/ivrs/create")
def create_new_ivr(payload: CreateIVRRequest):
    res = smartflo_client.create_ivr(
        name=payload.name,
        description=payload.description or "Created from Command Center",
        recording_id=payload.recording_id,
        timeout=payload.timeout,
        options=payload.options
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to create IVR"))
    
    new_id = str(res.get("ivr_id"))
    return {"success": True, "ivr_id": new_id, "name": payload.name}

# -------------------------------------------------------------
# BACKWARD COMPATIBILITY ENDPOINTS (FALLBACK)
# -------------------------------------------------------------
@app.get("/api/status")
def legacy_get_status():
    camps = database.list_campaigns()
    if not camps:
        return {"state": "idle", "concurrency": 15, "channel_slots": [], "total_leads": 0, "completed_leads": 0, "answered_leads": 0, "missed_leads": 0, "leads": []}
    first_camp = camps[0]
    summary = database.get_campaign_summary(first_camp["id"])
    runner = campaign_engine.get_runner(first_camp["id"])
    slots = runner.get_slots()
    paginated = database.get_paginated_leads(first_camp["id"], page=1, limit=50)
    
    return {
        "state": runner.status,
        "concurrency": first_camp["concurrency"],
        "channel_slots": [s.model_dump() for s in slots],
        "total_leads": summary["total_leads"],
        "completed_leads": summary["completed_leads"],
        "answered_leads": summary["answered_leads"],
        "missed_leads": summary["missed_leads"],
        "leads": paginated["items"],
        "active_ivr_id": first_camp["ivr_id"],
        "active_ivr_name": first_camp["ivr_name"],
        "did_mode": first_camp["did_mode"],
        "active_dids_count": len(config.active_dids),
        "google_sheet_connected": bool(first_camp.get("google_sheet_url")),
        "google_sheet_title": first_camp.get("google_sheet_url")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
