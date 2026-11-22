from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from enum import Enum

class CallStatus(str, Enum):
    PENDING = "pending"
    DIALING = "dialing"
    RINGING = "ringing"
    CONNECTED = "connected"
    COMPLETED = "completed"
    ANSWERED = "answered"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    REJECTED = "rejected"
    UNREACHABLE = "unreachable"
    QUICK_HANGUP = "quick_hangup"
    INVALID_NUMBER = "invalid_number"
    MISSED = "missed"
    FAILED = "failed"

class CampaignState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    FINISHED = "finished"

class ChannelState(str, Enum):
    IDLE = "idle"
    DIALING = "dialing"
    RINGING = "ringing"
    CONNECTED = "connected"
    COMPLETED = "completed"

class ChannelSlot(BaseModel):
    channel_id: int
    state: ChannelState = ChannelState.IDLE
    phone_number: Optional[str] = None
    name: Optional[str] = None
    did: Optional[str] = None
    duration: int = 0
    dtmf: Optional[str] = None
    started_at: Optional[float] = None
    last_status: Optional[str] = None
    last_phone: Optional[str] = None
    last_duration: Optional[int] = None

class Lead(BaseModel):
    id: str
    phone_number: str
    name: Optional[str] = ""
    status: CallStatus = CallStatus.PENDING
    dtmf: Optional[str] = None
    duration: int = 0
    call_id: Optional[str] = None
    ref_id: Optional[str] = None
    call_time: Optional[str] = None
    did_used: Optional[str] = None
    sheet_row_index: Optional[int] = None # For 1-to-1 Google Sheet write-back
    error_message: Optional[str] = None

class CampaignStatus(BaseModel):
    state: CampaignState = CampaignState.IDLE
    concurrency: int = 15
    channel_slots: List[ChannelSlot] = []
    total_leads: int = 0
    completed_leads: int = 0
    answered_leads: int = 0
    missed_leads: int = 0
    leads: List[Lead] = []
    active_ivr_id: str
    active_ivr_name: str
    did_mode: str
    active_dids_count: int
    google_sheet_connected: bool = False
    google_sheet_title: Optional[str] = None

class GoogleSheetConnectRequest(BaseModel):
    sheet_url: str
    credentials_json: Optional[str] = None # Optional custom service account json string

class GoogleSheetImportRequest(BaseModel):
    sheet_url: str
    phone_column: str
    name_column: Optional[str] = None

class CreateIVRRequest(BaseModel):
    name: str
    description: Optional[str] = "Custom IVR created via Command Center"
    recording_id: str # e.g. "219915" or "recording||219915"
    timeout: int = 30
    options: List[int] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]

class DIDSettingsRequest(BaseModel):
    did_mode: str # "round_robin" or "single"
    single_did: Optional[str] = None
    active_dids: Optional[List[str]] = None

class ConcurrencyRequest(BaseModel):
    concurrency: int # 1 to 15
    inter_call_delay: Optional[int] = 3

class ImportNumbersRequest(BaseModel):
    raw_text: Optional[str] = None
    numbers: Optional[List[dict]] = None

class UploadAudioUrlRequest(BaseModel):
    audio_name: str
    audio_url: str

class AudienceFilterRule(BaseModel):
    field: str
    operator: str = "equals"  # equals, not_equals, contains, in
    value: Optional[str] = None
    values: Optional[List[str]] = None

class CheckCountRequest(BaseModel):
    filters: List[AudienceFilterRule] = []

class CreateFieldMetaRequest(BaseModel):
    label: str
    field_type: str = "text"
    options: Optional[List[str]] = []

class UpdateFieldMetaRequest(BaseModel):
    label: Optional[str] = None
    field_type: Optional[str] = None
    options: Optional[List[str]] = None
    is_filter_enabled: Optional[bool] = None

class UpdateContactRequest(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None

class CreateCampaignRequest(BaseModel):
    name: str
    concurrency: int = 5
    ivr_id: str = "89733"
    ivr_name: str = "DTMF Test IVR"
    api_key: Optional[str] = "865fac0f-bed8-491c-aa22-59c55c94d00c"
    did_mode: str = "round_robin"
    single_did: Optional[str] = "917965561295"
    inter_call_delay: int = 3
    audience_filters: Optional[List[AudienceFilterRule]] = []
    google_sheet_url: Optional[str] = None
    google_sheet_phone_col: Optional[str] = None
    google_sheet_name_col: Optional[str] = None

class UpdateCampaignRequest(BaseModel):
    name: Optional[str] = None
    concurrency: Optional[int] = None
    ivr_id: Optional[str] = None
    ivr_name: Optional[str] = None
    api_key: Optional[str] = None
    did_mode: Optional[str] = None
    single_did: Optional[str] = None
    inter_call_delay: Optional[int] = None
    google_sheet_url: Optional[str] = None
    google_sheet_phone_col: Optional[str] = None
    google_sheet_name_col: Optional[str] = None

class PaginatedLeadsResponse(BaseModel):
    items: List[Dict[str, Any]]
    leads: Optional[List[Dict[str, Any]]] = None
    total_count: int
    page: int
    limit: int
    total_pages: int

class CampaignSummaryResponse(BaseModel):
    campaign: Dict[str, Any]
    total_leads: int
    completed_leads: int
    answered_leads: int
    missed_leads: int
    dialing_leads: int
    pending_leads: int
    answer_rate: float
    total_duration: int
    avg_duration: float
    dtmf_counts: Dict[str, int]
    dtmf_leads: Optional[int] = 0
    channel_slots: List[ChannelSlot] = []

class TrunkStatusResponse(BaseModel):
    total_capacity: int = 15
    active_channels: int
    available_channels: int
    running_campaigns_count: int
    campaigns: List[Dict[str, Any]]

class UpdateSettingsRequest(BaseModel):
    smartflo_token: Optional[str] = None
    smartflo_api_key: Optional[str] = None
    caller_id: Optional[str] = None
    inter_call_delay: Optional[int] = None
