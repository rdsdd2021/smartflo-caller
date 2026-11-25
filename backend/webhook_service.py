import hmac
import hashlib
import json
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor
import requests

from database import (
    create_webhook_sub,
    list_webhook_subs,
    delete_webhook_sub,
    toggle_webhook_sub,
    get_matching_webhook_subs,
    create_webhook_delivery,
    update_webhook_delivery,
    list_webhook_deliveries,
    get_webhook_delivery
)

logger = logging.getLogger("smartflo_webhooks")
logger.setLevel(logging.INFO)

# Background executor for non-blocking webhook delivery with retries
_webhook_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="webhook_dispatch")

WEBHOOK_EVENT_CATALOG: List[Dict[str, Any]] = [
    # Call & DTMF Events
    {"event": "call.ringing", "category": "Call & DTMF", "description": "Fired immediately when an outbound call starts ringing"},
    {"event": "call.completed", "category": "Call & DTMF", "description": "Fired when any call finishes with status, talk time, DTMF, recording & CRM datapoints"},
    {"event": "call.answered", "category": "Call & DTMF", "description": "Fired specifically when a customer answers the call"},
    {"event": "call.missed", "category": "Call & DTMF", "description": "Fired when a call is missed, busy, rejected, unreachable, or quick hangup"},
    {"event": "lead.dtmf_pressed", "category": "Call & DTMF", "description": "Fired when a customer presses a DTMF keypad digit (1, 2, 3, etc.)"},
    {"event": "smartflo.callback", "category": "Call & DTMF", "description": "Raw inbound webhook callback forwarded from Tata Smartflo"},
    # Campaign Lifecycle Events
    {"event": "campaign.created", "category": "Campaign Lifecycle", "description": "Fired when a new campaign is created"},
    {"event": "campaign.started", "category": "Campaign Lifecycle", "description": "Fired when a campaign begins or resumes dialing"},
    {"event": "campaign.paused", "category": "Campaign Lifecycle", "description": "Fired when a running campaign is paused"},
    {"event": "campaign.stopped", "category": "Campaign Lifecycle", "description": "Fired when a campaign is manually stopped"},
    {"event": "campaign.completed", "category": "Campaign Lifecycle", "description": "Fired automatically when all pending leads in a campaign finish dialing"},
    {"event": "campaign.settings_updated", "category": "Campaign Lifecycle", "description": "Fired when campaign IVR, DID, concurrency, or policy settings change"},
    {"event": "campaign.deleted", "category": "Campaign Lifecycle", "description": "Fired when a campaign is deleted"},
    # Lead & Import Events
    {"event": "lead.added", "category": "Leads & Imports", "description": "Fired when lead(s) are added via UI, CSV, Audience Filter, or Inbound API"},
    {"event": "lead.deleted", "category": "Leads & Imports", "description": "Fired when a lead is removed from a campaign"},
    {"event": "campaign.leads_cleared", "category": "Leads & Imports", "description": "Fired when all leads in a campaign queue are cleared"},
    {"event": "import.completed", "category": "Leads & Imports", "description": "Fired when a background bulk CSV/Excel import job finishes"},
    {"event": "import.failed", "category": "Leads & Imports", "description": "Fired if a background bulk import job fails"},
    # Contacts CRM Events
    {"event": "contact.created", "category": "Contacts CRM", "description": "Fired when a new contact is created or upserted in Master CRM"},
    {"event": "contact.updated", "category": "Contacts CRM", "description": "Fired when contact attributes or details are updated"},
    {"event": "contact.deleted", "category": "Contacts CRM", "description": "Fired when a contact is deleted from Master CRM"},
    {"event": "datapoint.created", "category": "Contacts CRM", "description": "Fired when a new custom CRM datapoint is defined"},
]


class WebhookService:
    MAX_RETRY_ATTEMPTS = 3
    RETRY_BACKOFF_SECONDS = [0, 2, 5]

    def get_event_catalog(self) -> List[Dict[str, Any]]:
        return WEBHOOK_EVENT_CATALOG

    def list_subscriptions(self, campaign_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return list_webhook_subs(campaign_id=campaign_id)

    def create_subscription(
        self,
        url: str,
        events: List[str],
        secret: Optional[str] = None,
        description: Optional[str] = None,
        campaign_id: Optional[str] = None
    ) -> Dict[str, Any]:
        url_clean = url.strip()
        if not url_clean.startswith("http://") and not url_clean.startswith("https://"):
            raise ValueError("Webhook URL must start with http:// or https://")
        if not events:
            events = ["*"]
        return create_webhook_sub(
            url=url_clean,
            events=events,
            secret=secret.strip() if secret else None,
            description=description.strip() if description else None,
            campaign_id=campaign_id.strip() if campaign_id else None
        )

    def delete_subscription(self, sub_id: str) -> bool:
        return delete_webhook_sub(sub_id)

    def toggle_subscription(self, sub_id: str, is_active: bool) -> bool:
        return toggle_webhook_sub(sub_id, is_active)

    def list_deliveries(
        self,
        subscription_id: Optional[str] = None,
        campaign_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        return list_webhook_deliveries(
            subscription_id=subscription_id,
            campaign_id=campaign_id,
            status=status,
            limit=limit
        )

    def generate_signature(self, payload_bytes: bytes, secret: str) -> str:
        """Computes HMAC-SHA256 signature for payload verification."""
        return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()

    def _enrich_attributes(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Attaches Master Contacts CRM attributes (School, Year, City, etc.) when phone_number is present."""
        if "attributes" in data and isinstance(data["attributes"], dict) and data["attributes"]:
            return data
        phone = data.get("phone_number")
        if not phone:
            return data
        try:
            from supabase_client import supabase
            contact = supabase.select_one("contacts", {"phone_number": str(phone).strip()})
            if contact and contact.get("attributes"):
                enriched = dict(data)
                enriched["attributes"] = contact.get("attributes") or {}
                if not enriched.get("name") and contact.get("name"):
                    enriched["name"] = contact.get("name")
                return enriched
        except Exception:
            pass
        return data

    def dispatch_event(self, event: str, data: Dict[str, Any], campaign_id: Optional[str] = None):
        """Dispatches event asynchronously in background thread with campaign scoping, CRM enrichment, and retries."""
        try:
            cid = campaign_id or data.get("campaign_id")
            matching_subs = get_matching_webhook_subs(event, campaign_id=cid)
            if not matching_subs:
                return

            _webhook_executor.submit(
                self._prepare_and_dispatch_all,
                event,
                dict(data),
                cid,
                matching_subs
            )
        except Exception as e:
            logger.warning(f"Failed to queue webhook dispatch: {e}")

    def _prepare_and_dispatch_all(
        self,
        event: str,
        data: Dict[str, Any],
        campaign_id: Optional[str],
        matching_subs: List[Dict[str, Any]]
    ):
        # Enrich with custom CRM datapoints in background worker so dialer loop is never blocked
        enriched_data = self._enrich_attributes(data)
        now_iso = datetime.now(timezone.utc).isoformat()

        for sub in matching_subs:
            delivery_id = f"dlv_{uuid.uuid4().hex[:12]}"
            payload = {
                "event": event,
                "timestamp": now_iso,
                "delivery_id": delivery_id,
                "campaign_id": campaign_id,
                "data": enriched_data
            }
            payload_json = json.dumps(payload)
            try:
                create_webhook_delivery(
                    delivery_id=delivery_id,
                    subscription_id=sub["id"],
                    event=event,
                    url=sub["url"],
                    request_payload=payload_json,
                    campaign_id=campaign_id,
                    status="retrying",
                    attempts=1
                )
            except Exception as e:
                logger.warning(f"Failed to log webhook delivery {delivery_id}: {e}")

            _webhook_executor.submit(
                self._deliver_with_retries,
                delivery_id,
                sub["url"],
                sub.get("secret"),
                event,
                payload_json.encode("utf-8")
            )

    def _deliver_with_retries(
        self,
        delivery_id: str,
        url: str,
        secret: Optional[str],
        event: str,
        payload_bytes: bytes
    ):
        """Delivers HTTP POST with up to 3 attempts, exponential backoff, and full audit logging."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Smartflo-Dialer-Webhooks/4.0",
            "X-Smartflo-Event": event,
            "X-Smartflo-Delivery": delivery_id
        }
        if secret:
            sig = self.generate_signature(payload_bytes, secret)
            headers["X-Smartflo-Signature"] = f"sha256={sig}"

        last_status_code: Optional[int] = None
        last_latency_ms: Optional[int] = None
        last_body: Optional[str] = None
        last_error: Optional[str] = None

        for attempt_idx in range(1, self.MAX_RETRY_ATTEMPTS + 1):
            backoff = self.RETRY_BACKOFF_SECONDS[attempt_idx - 1]
            if backoff > 0:
                time.sleep(backoff)

            start_ts = time.time()
            try:
                resp = requests.post(url, data=payload_bytes, headers=headers, timeout=6)
                last_latency_ms = round((time.time() - start_ts) * 1000)
                last_status_code = resp.status_code
                last_body = resp.text[:500] if resp.text else "(empty)"

                if 200 <= resp.status_code < 300:
                    update_webhook_delivery(
                        delivery_id=delivery_id,
                        status="success",
                        attempts=attempt_idx,
                        status_code=last_status_code,
                        latency_ms=last_latency_ms,
                        response_body=last_body,
                        error_message=None
                    )
                    return

                last_error = f"HTTP {resp.status_code}"
                # Do not retry permanent 4xx client errors (except 429 Too Many Requests)
                if 400 <= resp.status_code < 500 and resp.status_code != 429:
                    break
            except Exception as err:
                last_latency_ms = round((time.time() - start_ts) * 1000)
                last_error = str(err)

            if attempt_idx < self.MAX_RETRY_ATTEMPTS:
                update_webhook_delivery(
                    delivery_id=delivery_id,
                    status="retrying",
                    attempts=attempt_idx,
                    status_code=last_status_code,
                    latency_ms=last_latency_ms,
                    response_body=last_body,
                    error_message=last_error
                )

        update_webhook_delivery(
            delivery_id=delivery_id,
            status="failed",
            attempts=self.MAX_RETRY_ATTEMPTS if last_status_code is None or last_status_code >= 500 or last_status_code == 429 else 1,
            status_code=last_status_code,
            latency_ms=last_latency_ms,
            response_body=last_body,
            error_message=last_error
        )

    def replay_delivery(self, delivery_id: str) -> Dict[str, Any]:
        """Replays a previous webhook delivery synchronously and records a new delivery log entry."""
        orig = get_webhook_delivery(delivery_id)
        if not orig:
            return {"success": False, "error": "Delivery log not found"}

        new_delivery_id = f"dlv_{uuid.uuid4().hex[:12]}"
        payload_str = orig["request_payload"]
        url = orig["url"]
        event = orig["event"]
        secret = orig.get("secret")
        campaign_id = orig.get("campaign_id")

        create_webhook_delivery(
            delivery_id=new_delivery_id,
            subscription_id=orig["subscription_id"],
            event=event,
            url=url,
            request_payload=payload_str,
            campaign_id=campaign_id,
            status="retrying",
            attempts=1
        )

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Smartflo-Dialer-Webhooks/4.0",
            "X-Smartflo-Event": event,
            "X-Smartflo-Delivery": new_delivery_id,
            "X-Smartflo-Replay-Of": delivery_id
        }
        payload_bytes = payload_str.encode("utf-8")
        if secret:
            sig = self.generate_signature(payload_bytes, secret)
            headers["X-Smartflo-Signature"] = f"sha256={sig}"

        start_ts = time.time()
        try:
            resp = requests.post(url, data=payload_bytes, headers=headers, timeout=6)
            latency_ms = round((time.time() - start_ts) * 1000)
            ok = 200 <= resp.status_code < 300
            body = resp.text[:500] if resp.text else "(empty)"
            update_webhook_delivery(
                delivery_id=new_delivery_id,
                status="success" if ok else "failed",
                attempts=1,
                status_code=resp.status_code,
                latency_ms=latency_ms,
                response_body=body,
                error_message=None if ok else f"HTTP {resp.status_code}"
            )
            return {
                "success": ok,
                "delivery_id": new_delivery_id,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "response_body": body
            }
        except Exception as e:
            latency_ms = round((time.time() - start_ts) * 1000)
            update_webhook_delivery(
                delivery_id=new_delivery_id,
                status="failed",
                attempts=1,
                status_code=None,
                latency_ms=latency_ms,
                response_body=None,
                error_message=str(e)
            )
            return {
                "success": False,
                "delivery_id": new_delivery_id,
                "latency_ms": latency_ms,
                "error": str(e)
            }

    def test_webhook_url(
        self,
        url: str,
        event: str = "call.completed",
        secret: Optional[str] = None,
        campaign_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Dispatches a realistic test event payload synchronously (including sample CRM attributes)."""
        url_clean = url.strip()
        if not url_clean.startswith("http://") and not url_clean.startswith("https://"):
            return {"success": False, "error": "URL must begin with http:// or https://"}

        now_iso = datetime.now(timezone.utc).isoformat()
        test_payload = {
            "event": event,
            "timestamp": now_iso,
            "delivery_id": f"test_{uuid.uuid4().hex[:12]}",
            "campaign_id": campaign_id or "camp_test_sample",
            "data": {
                "campaign_id": campaign_id or "camp_test_sample",
                "campaign_name": "Product Launch Outreach",
                "phone_number": "919876543210",
                "name": "Rahul Sharma",
                "status": "answered",
                "duration": 48,
                "dtmf": "1",
                "did_used": "917965561295",
                "call_time": now_iso,
                "attributes": {
                    "school": "Delhi Public School",
                    "city": "Delhi",
                    "stream": "Science",
                    "year": "2027"
                }
            }
        }
        payload_json = json.dumps(test_payload)
        payload_bytes = payload_json.encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Smartflo-Dialer-Webhooks/4.0",
            "X-Smartflo-Event": event,
            "X-Smartflo-Delivery": test_payload["delivery_id"]
        }
        if secret:
            sig = self.generate_signature(payload_bytes, secret)
            headers["X-Smartflo-Signature"] = f"sha256={sig}"

        start_time = time.time()
        try:
            resp = requests.post(url_clean, data=payload_bytes, headers=headers, timeout=5)
            latency_ms = round((time.time() - start_time) * 1000)
            return {
                "success": 200 <= resp.status_code < 300,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "response_body": resp.text[:500] if resp.text else "(empty)",
                "delivery_id": test_payload["delivery_id"]
            }
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000)
            return {
                "success": False,
                "status_code": None,
                "latency_ms": latency_ms,
                "error": str(e),
                "delivery_id": test_payload["delivery_id"]
            }

webhook_service = WebhookService()
