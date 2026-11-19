import os
from typing import List, Optional
from pydantic import BaseModel

ALL_DIDS = [
    "917965561250", "917965561251", "917965561252", "917965561254", "917965561255",
    "917965561256", "917965561257", "917965561258", "917965561259", "917965561260",
    "917965561261", "917965561262", "917965561263", "917965561264", "917965561265",
    "917965561266", "917965561267", "917965561268", "917965561269", "917965561270",
    "917965561271", "917965561272", "917965561273", "917965561274", "917965561275",
    "917965561276", "917965561277", "917965561278", "917965561279", "917965561280",
    "917965561281", "917965561282", "917965561283", "917965561284", "917965561285",
    "917965561286", "917965561287", "917965561288", "917965561289", "917965561290",
    "917965561291", "917965561292", "917965561293", "917965561294", "917965561295"
]

class AppConfig(BaseModel):
    smartflo_token: str = os.environ.get(
        "SMARTFLO_TOKEN",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NTUzOTMiLCJjciI6ZmFsc2UsImlzcyI6Imh0dHA6Ly9jbG91ZHBob25lLnRhdGF0ZWxlc2VydmljZXMuY29tL2Nvbm5lY3QvYXBpL3YxL2FwaS10b2tlbiIsImlhdCI6MTc5NDkyMTQ3NSwibmJmIjoxNzk0OTIxNDc1LCJleHAiOjE4MDI2OTc0NzUsImp0aSI6Ijd3bUM3M0tUVDJKWWk4bDMifQ.pVgdK9agkvnWZ2zb909OhW8iV0ffC_uNIjFV-W2FfLM"
    )
    smartflo_api_key: str = os.environ.get("SMARTFLO_API_KEY", "865fac0f-bed8-491c-aa22-59c55c94d00c")
    
    # DID Pool Settings
    available_dids: List[str] = ALL_DIDS
    active_dids: List[str] = ALL_DIDS
    did_mode: str = "round_robin"  # "round_robin" or "single"
    single_did: str = "917965561295"
    
    # Concurrency & Channels (1-15)
    concurrency: int = 15
    inter_call_delay: int = 3
    customer_ring_timeout: int = 30
    call_timeout: int = 180
    
    # Active IVR
    ivr_id: str = "89733"
    ivr_name: str = "DTMF Test IVR"
    
    # Storage & Sheets
    excel_file: str = os.environ.get("EXCEL_PATH", os.path.abspath("smartflo_dtmf_records.xlsx"))
    google_sheet_url: Optional[str] = None
    google_sheet_phone_col: Optional[str] = None
    google_sheet_name_col: Optional[str] = None
    google_service_account_info: Optional[dict] = None

config = AppConfig()
