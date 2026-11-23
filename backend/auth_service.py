"""
Authentication, Password Hashing, JWT Token Handling, and RBAC Service
Supports 3-tier Role-Based Access Control: superadmin, admin, agent.
Uses Python standard library (hashlib, hmac, base64, json, secrets) for 100% reliable execution.
"""
import os
import json
import base64
import hmac
import hashlib
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from config import config
from supabase_client import supabase

def _get_jwt_secret() -> str:
    env_secret = os.environ.get("JWT_SECRET")
    if env_secret and len(env_secret.strip()) >= 16:
        return env_secret.strip()

    secret_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".jwt_secret")
    try:
        if os.path.exists(secret_file):
            with open(secret_file, "r") as f:
                s = f.read().strip()
                if len(s) >= 32:
                    return s
    except Exception:
        pass

    new_secret = secrets.token_hex(32)
    try:
        with open(secret_file, "w") as f:
            f.write(new_secret)
    except Exception:
        pass
    return new_secret

JWT_SECRET = _get_jwt_secret()
TOKEN_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))

def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Enforces enterprise password requirements: min 8 characters with letters and numbers."""
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not any(c.isalpha() for c in password):
        return False, "Password must contain at least one letter."
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number."
    return True, ""

def hash_password(password: str) -> str:
    """Hashes password using PBKDF2-HMAC-SHA256 with random 16-byte salt (100,000 rounds)."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"pbkdf2_sha256$100000${salt}${dk.hex()}"

def verify_password(plain_password: str, hashed: str) -> bool:
    """Verifies plain password against stored PBKDF2 hash using constant-time comparison."""
    try:
        parts = hashed.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = parts[2]
        expected_hash = parts[3]
        dk = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), iterations)
        return hmac.compare_digest(dk.hex(), expected_hash)
    except Exception:
        return False

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")

def _b64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generates standard Base64URL HS256 JWT access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.now(timezone.utc)
    exp = now + (expires_delta or timedelta(hours=TOKEN_EXPIRY_HOURS))
    
    payload = dict(data)
    payload["iat"] = int(now.timestamp())
    payload["exp"] = int(exp.timestamp())

    header_b64 = _b64url_encode(json.dumps(header).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload).encode("utf-8"))

    msg = f"{header_b64}.{payload_b64}".encode("utf-8")
    sig = hmac.new(JWT_SECRET.encode("utf-8"), msg, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)

    return f"{header_b64}.{payload_b64}.{sig_b64}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Validates and decodes HS256 JWT access token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        msg = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), msg, hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        exp = payload.get("exp")
        if exp and exp < datetime.now(timezone.utc).timestamp():
            return None

        return payload
    except Exception:
        return None

class AuthService:
    _failed_attempts: Dict[str, List[float]] = {}

    def check_login_rate_limit(self, email: str, ip: str) -> Tuple[bool, int]:
        """
        Enforces maximum 5 failed login attempts per 15-minute window per IP or email.
        Returns (is_locked, remaining_lockout_seconds).
        """
        now = time.time()
        window = 900  # 15 minutes lockout window
        max_attempts = 5

        for key in [f"email:{email.strip().lower()}", f"ip:{ip}"]:
            attempts = [t for t in self._failed_attempts.get(key, []) if now - t < window]
            self._failed_attempts[key] = attempts
            if len(attempts) >= max_attempts:
                oldest = attempts[0]
                remaining = int(window - (now - oldest))
                return True, max(1, remaining)
        return False, 0

    def record_failed_attempt(self, email: str, ip: str) -> None:
        """Records a timestamped failed login attempt for both the target email and source IP."""
        now = time.time()
        for key in [f"email:{email.strip().lower()}", f"ip:{ip}"]:
            attempts = self._failed_attempts.get(key, [])
            attempts.append(now)
            self._failed_attempts[key] = attempts

    def reset_failed_attempts(self, email: str, ip: str) -> None:
        """Clears failed login attempts upon successful credential verification."""
        for key in [f"email:{email.strip().lower()}", f"ip:{ip}"]:
            self._failed_attempts.pop(key, None)

    def init_default_superadmin(self) -> None:
        """Seeds initial default superadmin if no users exist in app_users."""
        try:
            users = supabase.select("app_users", {"role": "eq.superadmin", "limit": 1})
            if not users:
                default_email = os.environ.get("INITIAL_SUPERADMIN_EMAIL", "admin@smartflo.ai")
                # Generate cryptographically secure random password if not explicitly configured in env
                default_password = os.environ.get("INITIAL_SUPERADMIN_PASSWORD") or secrets.token_urlsafe(16)
                default_name = "System Superadmin"
                
                payload = {
                    "email": default_email.lower().strip(),
                    "password_hash": hash_password(default_password),
                    "full_name": default_name,
                    "role": "superadmin",
                    "is_active": True
                }
                supabase.insert("app_users", payload)
                print(f"[Auth Security] Seeded initial Superadmin account: {default_email}")
                if not os.environ.get("INITIAL_SUPERADMIN_PASSWORD"):
                    print(f"[Auth Security] Generated initial password: {default_password} (Please change immediately upon first login!)")
        except Exception as e:
            print(f"[Auth] Notice during default superadmin check: {e}")

    def authenticate(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """Verifies email and password; returns user dict (without password_hash) if valid."""
        clean_email = email.strip().lower()
        users = supabase.select("app_users", {"email": f"eq.{clean_email}", "limit": 1})
        if not users:
            return None
        
        user = users[0]
        if not user.get("is_active", True):
            return None

        if not verify_password(password, user.get("password_hash", "")):
            return None

        # Update last_login_at
        supabase.update("app_users", {"id": user["id"]}, {"last_login_at": datetime.now(timezone.utc).isoformat()})

        # Return sanitized user
        user.pop("password_hash", None)
        return user

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        user = supabase.select_one("app_users", {"id": user_id})
        if user:
            user.pop("password_hash", None)
        return user

    def list_users(self) -> List[Dict[str, Any]]:
        """Returns all registered users ordered by creation date."""
        users = supabase.select("app_users", {"order": "created_at.desc"})
        for u in users:
            u.pop("password_hash", None)
        return users

    def create_user(self, email: str, password: str, full_name: str, role: str = "agent") -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Creates a new user account. Role must be superadmin, admin, or agent."""
        clean_email = email.strip().lower()
        clean_role = role.strip().lower()
        if clean_role not in ["superadmin", "admin", "agent"]:
            clean_role = "agent"

        # Check existing
        existing = supabase.select("app_users", {"email": f"eq.{clean_email}", "limit": 1})
        if existing:
            return False, "A user with this email address already exists.", None

        is_strong, pwd_err = validate_password_strength(password)
        if not is_strong:
            return False, pwd_err, None

        payload = {
            "email": clean_email,
            "password_hash": hash_password(password),
            "full_name": full_name.strip() or clean_email.split("@")[0],
            "role": clean_role,
            "is_active": True
        }
        res = supabase.insert("app_users", payload)
        if res and len(res) > 0:
            created = res[0]
            created.pop("password_hash", None)
            return True, "User created successfully.", created
        return False, "Failed to create user in database.", None

    def update_user(self, user_id: str, updates: Dict[str, Any]) -> Tuple[bool, str]:
        """Updates user role, active status, name, or password."""
        payload: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        if "role" in updates:
            r = str(updates["role"]).lower()
            if r in ["superadmin", "admin", "agent"]:
                payload["role"] = r

        if "full_name" in updates and updates["full_name"]:
            payload["full_name"] = str(updates["full_name"]).strip()

        if "is_active" in updates:
            payload["is_active"] = bool(updates["is_active"])

        if "password" in updates and updates["password"]:
            is_strong, pwd_err = validate_password_strength(str(updates["password"]))
            if not is_strong:
                return False, pwd_err
            payload["password_hash"] = hash_password(str(updates["password"]))

        ok = supabase.update("app_users", {"id": user_id}, payload)
        return ok, "User updated successfully." if ok else "Failed to update user."

    def delete_user(self, user_id: str, current_user_id: str) -> Tuple[bool, str]:
        """Deletes user account (prevents deleting current self-account)."""
        if user_id == current_user_id:
            return False, "You cannot delete your own account."
        ok = supabase.delete("app_users", {"id": user_id})
        return ok, "User deleted successfully." if ok else "Failed to delete user."

    def change_password(self, user_id: str, current_password: str, new_password: str) -> Tuple[bool, str]:
        """Changes user password after verifying current password."""
        user = supabase.select_one("app_users", {"id": user_id})
        if not user:
            return False, "User not found."

        if not verify_password(current_password, user.get("password_hash", "")):
            return False, "Incorrect current password."

        is_strong, pwd_err = validate_password_strength(new_password)
        if not is_strong:
            return False, pwd_err

        payload = {
            "password_hash": hash_password(new_password),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        ok = supabase.update("app_users", {"id": user_id}, payload)
        return ok, "Password changed successfully." if ok else "Failed to update password."

auth_service = AuthService()
