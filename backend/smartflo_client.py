import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import urllib3
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from config import config
import database

# Indian Standard Time (IST, UTC+5:30) for Tata Smartflo PBX compatibility
IST = timezone(timedelta(hours=5, minutes=30))

# Suppress insecure SSL warnings since we use verify=False to prevent cert expiry failures
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class SmartfloClient:
    BASE_URL = "https://api-smartflo.tatateleservices.com"

    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        
        # Configure connection pooling and automatic retries for transient carrier errors
        retries = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            raise_on_status=False
        )
        adapter = HTTPAdapter(
            pool_connections=40,
            pool_maxsize=40,
            max_retries=retries,
            pool_block=False
        )
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        # In-memory shared CDR cache to prevent 15 parallel workers from hitting rate limits
        self._cached_cdrs: List[Dict[str, Any]] = []
        self._last_cdr_fetch_time: float = 0.0

    def get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {config.smartflo_token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    def initiate_call(self, customer_number: str, caller_id: Optional[str] = None, api_key: Optional[str] = None, call_timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Triggers outbound Click-to-Call Support to customer with specified or rotated DID
        and specific campaign routing API key.
        """
        selected_did = caller_id or config.single_did
        selected_api_key = api_key or config.smartflo_api_key
        actual_call_timeout = call_timeout or config.call_timeout
        url = f"{self.BASE_URL}/v1/click_to_call_support"
        payload = {
            "customer_number": customer_number,
            "api_key": selected_api_key,
            "caller_id": selected_did,
            "async": 1,
            "customer_ring_timeout": config.customer_ring_timeout,
            "call_timeout": actual_call_timeout
        }
        
        try:
            resp = self.session.post(url, json=payload, headers=self.get_headers(), timeout=15)
            try:
                data = resp.json()
            except Exception:
                data = {"message": resp.text[:200] if resp.text else f"HTTP {resp.status_code}"}

            success = (resp.status_code == 200) and bool(data.get("success", False))
            msg = data.get("message") or (resp.text[:200] if resp.text else "")
            
            return {
                "status_code": resp.status_code,
                "success": success,
                "message": msg,
                "ref_id": data.get("ref_id", ""),
                "did_used": selected_did
            }
        except Exception as e:
            return {
                "status_code": 500,
                "success": False,
                "message": str(e),
                "ref_id": "",
                "did_used": selected_did
            }

    def _get_recent_cdrs(self) -> List[Dict[str, Any]]:
        """
        Fetches the latest CDR records with a 1.2s cache.
        When 15 parallel channels check CDRs simultaneously, they all share this cached batch,
        reducing carrier API calls from 450/min down to ~50/min and eliminating 429 errors.
        """
        now = time.time()
        if self._cached_cdrs and (now - self._last_cdr_fetch_time < 1.2):
            return self._cached_cdrs

        now_ist = datetime.now(IST)
        to_date = (now_ist + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        from_date = (now_ist - timedelta(minutes=45)).strftime("%Y-%m-%d %H:%M:%S")
        url = f"{self.BASE_URL}/v1/call/records?from_date={from_date}&to_date={to_date}&limit=100"

        try:
            resp = self.session.get(url, headers=self.get_headers(), timeout=10)
            if resp.status_code == 200:
                self._cached_cdrs = resp.json().get("results", [])
                self._last_cdr_fetch_time = now
            elif resp.status_code == 429:
                # Rate limited: serve existing cache gracefully
                pass
        except Exception as e:
            print(f"[SmartfloClient] CDR fetch error: {e}")

        return self._cached_cdrs

    def fetch_latest_cdr_for_number(self, customer_number: str, ref_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Queries recent CDR records.
        If ref_id is provided, matches the exact outbound click-to-call session by ref_id.
        Falls back to matching by 10-digit customer number.
        """
        results = self._get_recent_cdrs()
        clean_target = "".join(c for c in customer_number if c.isdigit())[-10:]

        # 1. Exact ref_id matching (highest precision)
        if ref_id and str(ref_id).strip():
            target_ref = str(ref_id).strip()
            for call in results:
                call_ref = str(call.get("ref_id") or "")
                if call_ref and call_ref.strip() == target_ref:
                    return self._format_cdr(call)

        # 2. Number matching fallback if ref_id not matched yet
        for call in results:
            client_num = "".join(c for c in str(call.get("client_number") or "") if c.isdigit())
            if clean_target in client_num:
                return self._format_cdr(call)

        return None

    def _format_cdr(self, call: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "call_id": call.get("call_id"),
            "ref_id": call.get("ref_id"),
            "status": call.get("status"),
            "description": call.get("description"),
            "detailed_description": call.get("detailed_description"),
            "dtmf": call.get("dtmf_input"),
            "duration": int(call.get("call_duration") or 0),
            "answered_seconds": int(call.get("answered_seconds") or 0),
            "total_call_duration": int(call.get("total_call_duration") or call.get("call_duration") or 0),
            "hangup_cause": call.get("hangup_cause"),
            "date_time": f"{call.get('date')} {call.get('time')}",
            "uuid": call.get("uuid"),
            "did_number": call.get("did_number"),
            "call_flow": call.get("call_flow") or []
        }

    def fetch_ivrs(self) -> List[Dict[str, Any]]:
        """Retrieves all IVRs available on the Smartflo account with persistent caching & fallback."""
        url = f"{self.BASE_URL}/v1/ivrs"
        try:
            resp = self.session.get(url, headers=self.get_headers(), timeout=10)
            if resp.status_code == 200:
                ivrs = resp.json().get("ivrs", [])
                if ivrs:
                    database.cache_ivrs(ivrs)
                    return ivrs
            else:
                print(f"[SmartfloClient] fetch_ivrs non-200 ({resp.status_code}): {resp.text[:120]}")
        except Exception as e:
            print(f"[SmartfloClient] fetch_ivrs error: {e}")
            
        return database.get_cached_ivrs()

    def fetch_recordings(self) -> List[Dict[str, Any]]:
        """Retrieves all System Audio Recordings from Smartflo with persistent caching & fallback."""
        url = f"{self.BASE_URL}/v1/recordings"
        try:
            resp = self.session.get(url, headers=self.get_headers(), timeout=10)
            if resp.status_code == 200:
                recordings = resp.json()
                if isinstance(recordings, list) and recordings:
                    database.cache_recordings(recordings)
                    return recordings
            else:
                print(f"[SmartfloClient] fetch_recordings non-200 ({resp.status_code}): {resp.text[:120]}")
        except Exception as e:
            print(f"[SmartfloClient] fetch_recordings error: {e}")
            
        return database.get_cached_recordings()

    def _stage_audio_file(self, file_bytes: bytes, filename: str) -> Optional[str]:
        """Stages audio temporarily to get a publicly reachable URL for Smartflo ingestion."""
        # 1. Try Catbox
        try:
            r = self.session.post(
                "https://catbox.moe/user/api.php", 
                data={"reqtype": "fileupload"}, 
                files={"fileToUpload": (filename, file_bytes, "audio/mpeg")}, 
                timeout=15
            )
            if r.status_code == 200 and r.text.startswith("https://"):
                return r.text.strip()
        except Exception as e:
            print(f"[SmartfloClient] Catbox stage failed: {e}")

        # 2. Try TmpFiles
        try:
            r = self.session.post(
                "https://tmpfiles.org/api/v1/upload", 
                files={"file": (filename, file_bytes, "audio/mpeg")}, 
                timeout=15
            )
            if r.status_code == 200:
                raw_url = r.json().get("data", {}).get("url", "")
                if raw_url:
                    return raw_url.replace("tmpfiles.org/", "tmpfiles.org/dl/")
        except Exception as e:
            print(f"[SmartfloClient] Tmpfiles stage failed: {e}")

        return None

    def upload_audio_recording(self, audio_name: str, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Stages file and registers recording with Smartflo."""
        public_url = self._stage_audio_file(file_bytes, filename)
        if not public_url:
            return {"success": False, "message": "Failed to stage audio file for Smartflo ingestion."}

        return self.upload_audio_from_url(audio_name, public_url)

    def upload_audio_from_url(self, audio_name: str, audio_url: str) -> Dict[str, Any]:
        """Registers a remote audio URL with Smartflo via POST /v1/recording and awaits processing."""
        url = f"{self.BASE_URL}/v1/recording"
        payload = {
            "audio_name": audio_name,
            "type": "url",
            "data": audio_url
        }
        
        try:
            resp = self.session.post(url, json=payload, headers=self.get_headers(), timeout=20)
            data = resp.json()
            if resp.status_code != 200 or not data.get("success"):
                return {"success": False, "message": data.get("message", "Smartflo rejected audio registration.")}

            batch_id = data.get("batch_id")
            if not batch_id:
                return {"success": True, "message": "Upload initiated", "recording_id": None}

            # Poll for completion (up to 20 seconds)
            for _ in range(10):
                time.sleep(2)
                status_res = self.session.get(f"{self.BASE_URL}/v1/recording/status/{batch_id}", headers=self.get_headers(), timeout=10)
                if status_res.status_code == 200:
                    status_data = status_res.json()
                    if status_data.get("status") == "uploaded":
                        return {
                            "success": True,
                            "recording_id": str(status_data.get("recording_id")),
                            "name": audio_name,
                            "message": "Audio file uploaded and ready to use."
                        }
                    elif status_data.get("status") == "failed":
                        return {"success": False, "message": status_data.get("message", "Audio conversion failed.")}

            return {
                "success": True,
                "batch_id": batch_id,
                "message": "Audio uploaded and is processing on Smartflo."
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    def create_ivr(self, name: str, description: str, recording_id: str, timeout: int = 30, options: List[int] = None) -> Dict[str, Any]:
        """Creates a new IVR on Smartflo via POST /v1/ivr."""
        url = f"{self.BASE_URL}/v1/ivr"
        opts = options or [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
        destinations = ["hangup||1"] * len(opts)
        
        rec_val = recording_id if "||" in recording_id else f"recording||{recording_id}"
        fallback_rec = "recording||9177"
        
        payload = {
            "name": name,
            "description": description,
            "recording": rec_val,
            "timeout": timeout,
            "option": opts,
            "destination": destinations,
            "incorrect_count": 2,
            "invalid_recording": fallback_rec,
            "invalid_destination": "hangup||1",
            "timeout_retry_recording": fallback_rec,
            "timeout_recording": fallback_rec,
            "timeout_destination": "hangup||1",
            "timeout_tries": 2,
            "recording_invalid": fallback_rec,
            "timeout_retries": 2
        }
        
        try:
            resp = self.session.post(url, json=payload, headers=self.get_headers(), timeout=15)
            data = resp.json()
            return {
                "success": resp.status_code == 200 and data.get("success", False),
                "ivr_id": data.get("ivr_id"),
                "message": data.get("message", resp.text)
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

smartflo_client = SmartfloClient()
