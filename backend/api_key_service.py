"""
Scoped External API Key Management & Enforcement Service.
Supports Global Full Access, Read-Only, and Campaign-Specific API keys.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

import database


class APIKeyService:
    KEY_PREFIX = "sf_live_"
    VALID_SCOPES = ("full", "read_only", "campaign_only")

    @staticmethod
    def hash_key(raw_key: str) -> str:
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def create_key(
        self,
        name: str,
        scope: str = "full",
        campaign_id: Optional[str] = None,
        expires_days: Optional[int] = None
    ) -> Dict[str, Any]:
        """Generates a new scoped API key. Raw key is returned once and only its SHA-256 hash is stored."""
        clean_name = (name or "").strip()
        if not clean_name:
            raise ValueError("API key name is required")
        if scope not in self.VALID_SCOPES:
            raise ValueError(f"Invalid scope. Must be one of: {', '.join(self.VALID_SCOPES)}")
        if scope == "campaign_only" and not (campaign_id and campaign_id.strip()):
            raise ValueError("campaign_id is required when scope is 'campaign_only'")

        raw_secret = f"{self.KEY_PREFIX}{secrets.token_hex(20)}"
        key_prefix = f"{raw_secret[:14]}...{raw_secret[-4:]}"
        key_hash = self.hash_key(raw_secret)
        key_id = f"key_{uuid.uuid4().hex[:12]}"

        expires_at = None
        if expires_days and expires_days > 0:
            expires_at = (datetime.now() + timedelta(days=expires_days)).strftime("%Y-%m-%d %H:%M:%S")

        record = database.create_api_key_record(
            key_id=key_id,
            name=clean_name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            scope=scope,
            campaign_id=campaign_id if scope == "campaign_only" else None,
            expires_at=expires_at
        )
        record["raw_key"] = raw_secret
        return record

    def list_keys(self) -> List[Dict[str, Any]]:
        return database.list_api_keys()

    def toggle_key(self, key_id: str, is_active: bool) -> bool:
        return database.toggle_api_key(key_id, is_active)

    def delete_key(self, key_id: str) -> bool:
        return database.delete_api_key(key_id)

    def validate_and_authorize(
        self,
        raw_key: str,
        method: str,
        path: str
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Validates an external API key and enforces its scope against the HTTP method and path.
        Returns (allowed, error_message, key_record).
        """
        key_hash = self.hash_key(raw_key.strip())
        key_rec = database.get_api_key_by_hash(key_hash)
        if not key_rec:
            return False, "Invalid API key.", None
        if not key_rec.get("is_active"):
            return False, "API key is disabled.", None

        expires_at = key_rec.get("expires_at")
        if expires_at:
            try:
                exp_dt = datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
                if datetime.now() > exp_dt:
                    return False, "API key has expired.", None
            except ValueError:
                pass

        scope = key_rec.get("scope", "full")
        method_upper = method.upper()

        if scope == "read_only" and method_upper not in ("GET", "HEAD", "OPTIONS"):
            return False, "Read-only API key cannot perform write or delete operations.", key_rec

        if scope == "campaign_only":
            allowed_cid = key_rec.get("campaign_id")
            # Allow health/events/docs, and campaign-scoped paths matching allowed_cid
            if "/campaigns/" in path:
                parts = path.split("/campaigns/", 1)[1].split("/")
                target_cid = parts[0] if parts else ""
                if target_cid != allowed_cid:
                    return False, f"API key is scoped exclusively to campaign '{allowed_cid}'.", key_rec
            elif path.startswith("/api/inbound/call-now"):
                pass  # Body campaign_id checked in endpoint if needed
            elif path not in ("/api/health", "/api/webhooks/events", "/api/contacts/fields"):
                return False, f"Campaign-scoped API key cannot access global endpoint '{path}'.", key_rec

        try:
            database.record_api_key_usage(key_rec["id"])
        except Exception:
            pass

        return True, None, key_rec


api_key_service = APIKeyService()
