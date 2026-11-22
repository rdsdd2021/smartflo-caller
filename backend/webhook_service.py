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
    get_matching_webhook_subs
)

logger = logging.getLogger("smartflo_webhooks")
logger.setLevel(logging.INFO)

# Background executor for non-blocking webhook delivery
_webhook_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="webhook_dispatch")

class WebhookService:
    def __init__(self):
        pass

    def list_subscriptions(self) -> List[Dict[str, Any]]:
        return list_webhook_subs()

    def create_subscription(
        self,
        url: str,
        events: List[str],
        secret: Optional[str] = None,
        description: Optional[str] = None
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
            description=description.strip() if description else None
        )

    def delete_subscription(self, sub_id: str) -> bool:
        return delete_webhook_sub(sub_id)

    def toggle_subscription(self, sub_id: str, is_active: bool) -> bool:
        return toggle_webhook_sub(sub_id, is_active)

    def generate_signature(self, payload_bytes: bytes, secret: str) -> str:
        """Computes HMAC-SHA256 signature for payload verification."""
        return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()

    def dispatch_event(self, event: str, data: Dict[str, Any]):
        """Dispatches event asynchronously in background thread."""
        try:
            matching_subs = get_matching_webhook_subs(event)
            if not matching_subs:
                return

            now_iso = datetime.now(timezone.utc).isoformat()
            payload = {
                "event": event,
                "timestamp": now_iso,
                "delivery_id": f"dlv_{uuid.uuid4().hex[:12]}",
                "data": data
            }
            payload_json = json.dumps(payload)
            payload_bytes = payload_json.encode("utf-8")

            for sub in matching_subs:
                _webhook_executor.submit(
                    self._deliver_payload,
                    sub["url"],
                    sub.get("secret"),
                    event,
                    payload["delivery_id"],
                    payload_bytes
                )
        except Exception as e:
            logger.warning(f"Failed to queue webhook dispatch: {e}")

    def _deliver_payload(self, url: str, secret: Optional[str], event: str, delivery_id: str, payload_bytes: bytes):
        """Sends HTTP POST to subscriber with signature header."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Smartflo-Dialer-Webhooks/3.1",
            "X-Smartflo-Event": event,
            "X-Smartflo-Delivery": delivery_id
        }
        if secret:
            sig = self.generate_signature(payload_bytes, secret)
            headers["X-Smartflo-Signature"] = f"sha256={sig}"

        try:
            resp = requests.post(url, data=payload_bytes, headers=headers, timeout=4)
            if resp.status_code >= 400:
                logger.warning(f"Webhook {url} responded with status {resp.status_code}")
        except Exception as err:
            logger.warning(f"Webhook delivery failed for {url}: {err}")

    def test_webhook_url(
        self,
        url: str,
        event: str = "call.completed",
        secret: Optional[str] = None
    ) -> Dict[str, Any]:
        """Dispatches a test event synchronously and returns status code, response, and latency."""
        url_clean = url.strip()
        if not url_clean.startswith("http://") and not url_clean.startswith("https://"):
            return {"success": False, "error": "URL must begin with http:// or https://"}

        now_iso = datetime.now(timezone.utc).isoformat()
        test_payload = {
            "event": event,
            "timestamp": now_iso,
            "delivery_id": f"test_{uuid.uuid4().hex[:12]}",
            "data": {
                "campaign_id": "camp_test_sample",
                "campaign_name": "Product Launch Outreach",
                "phone_number": "919876543210",
                "lead_name": "Rahul Sharma",
                "status": "answered",
                "duration": 48,
                "dtmf": "1",
                "did_used": "917965561295",
                "call_time": now_iso
            }
        }
        payload_json = json.dumps(test_payload)
        payload_bytes = payload_json.encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Smartflo-Dialer-Webhooks/3.1",
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
