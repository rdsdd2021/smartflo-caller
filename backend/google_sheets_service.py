import os
import io
import csv
import json
import re
from typing import Dict, Any, List, Optional, Tuple
import requests
import gspread
from google.oauth2.service_account import Credentials
from config import config

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

class GoogleSheetsService:
    def __init__(self):
        self._client: Optional[gspread.Client] = None
        self._current_sheet_url: Optional[str] = None
        self._header_cache: Dict[str, int] = {} # column_name -> column_index (1-based)

    def _extract_sheet_id_and_gid(self, sheet_url: str) -> Tuple[Optional[str], Optional[str]]:
        """Extracts the unique spreadsheet key and optional sheet GID from any Google Sheets link."""
        id_match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', sheet_url)
        sheet_id = id_match.group(1) if id_match else None
        gid_match = re.search(r'[#&?]gid=([0-9]+)', sheet_url)
        gid = gid_match.group(1) if gid_match else None
        return sheet_id, gid

    def _fetch_public_sheet_csv(self, sheet_url: str) -> Optional[List[List[str]]]:
        """
        Attempts to read the sheet as a link-shared / public document without requiring 
        Google Service Account credentials.
        Works whenever the sheet's Share setting is set to 'Anyone with the link can view'.
        """
        sheet_id, gid = self._extract_sheet_id_and_gid(sheet_url)
        if not sheet_id:
            return None

        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
        if gid:
            csv_url += f"&gid={gid}"

        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            resp = requests.get(csv_url, timeout=12, headers=headers, allow_redirects=True)
            content_type = resp.headers.get("content-type", "").lower()
            if resp.status_code == 200 and "text/html" not in content_type:
                reader = csv.reader(io.StringIO(resp.text))
                rows = [row for row in reader if any(cell.strip() for cell in row)]
                if rows:
                    return rows
        except Exception as e:
            print(f"[GoogleSheets] Public CSV fetch attempt: {e}")

        return None

    def _get_credentials(self, credentials_json_str: Optional[str] = None) -> Optional[Credentials]:
        if credentials_json_str:
            try:
                info = json.loads(credentials_json_str)
                config.google_service_account_info = info
                return Credentials.from_service_account_info(info, scopes=SCOPES)
            except Exception as e:
                print(f"[GoogleSheets] Error parsing credentials json string: {e}")

        if config.google_service_account_info:
            return Credentials.from_service_account_info(config.google_service_account_info, scopes=SCOPES)

        # Look for local service_account.json file
        local_path = os.path.abspath("service_account.json")
        if os.path.exists(local_path):
            return Credentials.from_service_account_file(local_path, scopes=SCOPES)

        return None

    def connect(self, sheet_url: str, credentials_json_str: Optional[str] = None) -> Dict[str, Any]:
        """
        Connects to a Google Sheet using either:
        1. Google Service Account (if configured / provided)
        2. Zero-setup Public / Link-Shared access (if sheet is set to 'Anyone with the link can view')
        """
        creds = self._get_credentials(credentials_json_str)

        # Strategy 1: Try Service Account authentication if credentials exist
        if creds:
            try:
                self._client = gspread.authorize(creds)
                spreadsheet = self._client.open_by_url(sheet_url)
                worksheet = spreadsheet.sheet1
                all_values = worksheet.get_all_values()

                if not all_values:
                    return {"success": False, "message": "The selected sheet is completely empty."}

                headers = [h.strip() for h in all_values[0] if h.strip()]
                sample_rows = all_values[1:4] if len(all_values) > 1 else []

                suggested_phone = self._detect_phone_column(headers, sample_rows)
                suggested_name = self._detect_name_column(headers)

                config.google_sheet_url = sheet_url
                self._current_sheet_url = sheet_url

                return {
                    "success": True,
                    "title": spreadsheet.title,
                    "headers": headers,
                    "suggested_phone": suggested_phone,
                    "suggested_name": suggested_name,
                    "row_count": max(0, len(all_values) - 1),
                    "sample_preview": sample_rows,
                    "mode": "service_account"
                }
            except Exception as e:
                print(f"[GoogleSheets] gspread access failed, attempting link-shared fallback: {e}")

        # Strategy 2: Zero-setup Public / Link-shared direct CSV extraction
        public_rows = self._fetch_public_sheet_csv(sheet_url)
        if public_rows and len(public_rows) > 0:
            headers = [h.strip() for h in public_rows[0] if h.strip()]
            sample_rows = public_rows[1:4] if len(public_rows) > 1 else []
            suggested_phone = self._detect_phone_column(headers, sample_rows)
            suggested_name = self._detect_name_column(headers)

            config.google_sheet_url = sheet_url
            self._current_sheet_url = sheet_url

            return {
                "success": True,
                "title": "Google Sheet (Link-Shared)",
                "headers": headers,
                "suggested_phone": suggested_phone,
                "suggested_name": suggested_name,
                "row_count": max(0, len(public_rows) - 1),
                "sample_preview": sample_rows,
                "mode": "link_shared"
            }

        # If both fail, provide clear actionable guidance
        return {
            "success": False,
            "message": (
                "Could not access Google Sheet. Please either:\n"
                "1. Click 'Share' in your Google Sheet and change General Access to 'Anyone with the link can view' (Instant Zero-Setup), OR\n"
                "2. Place a service_account.json in the backend folder and share the sheet with your service account email as Editor."
            )
        }

    def _detect_phone_column(self, headers: List[str], sample_rows: List[List[str]]) -> Optional[str]:
        # 1. Header name heuristics
        phone_keywords = ["phone", "mobile", "contact", "cell", "number", "telephone", "customer_number"]
        for h in headers:
            h_lower = h.lower().replace(" ", "_")
            if any(k in h_lower for k in phone_keywords):
                return h

        # 2. Check data contents for 10-12 digit strings
        for col_idx, h in enumerate(headers):
            for row in sample_rows:
                if col_idx < len(row):
                    digits = re.sub(r"\D", "", str(row[col_idx]))
                    if 10 <= len(digits) <= 13:
                        return h
        return headers[0] if headers else None

    def _detect_name_column(self, headers: List[str]) -> Optional[str]:
        name_keywords = ["name", "client", "customer", "lead", "contact_name", "first_name", "full_name"]
        for h in headers:
            h_lower = h.lower().replace(" ", "_")
            if any(k in h_lower for k in name_keywords):
                return h
        return None

    def import_leads(self, sheet_url: str, phone_col: str, name_col: Optional[str] = None) -> List[Tuple[str, str, int]]:
        """
        Reads leads from Google Sheet and pairs them with their 1-based row index in the sheet.
        Supports both Service Account mode and Link-Shared mode.
        Returns: [(phone, name, row_index)]
        """
        all_values: Optional[List[List[str]]] = None

        # Try gspread if authorized
        if self._client:
            try:
                spreadsheet = self._client.open_by_url(sheet_url)
                worksheet = spreadsheet.sheet1
                all_values = worksheet.get_all_values()
            except Exception as e:
                print(f"[GoogleSheets] gspread import error: {e}")

        # Fallback to public CSV if gspread not configured or failed
        if not all_values:
            all_values = self._fetch_public_sheet_csv(sheet_url)

        if not all_values or len(all_values) < 2:
            return []

        headers = [h.strip() for h in all_values[0]]
        try:
            phone_idx = headers.index(phone_col)
        except ValueError:
            raise Exception(f"Column '{phone_col}' not found in sheet headers.")

        name_idx = None
        if name_col and name_col in headers:
            name_idx = headers.index(name_col)

        leads = []
        for row_idx, row in enumerate(all_values[1:], start=2): # 1-based index: row 1 is header, row 2 is first lead
            if phone_idx < len(row):
                raw_phone = row[phone_idx]
                digits = re.sub(r"\D", "", raw_phone)
                if len(digits) >= 10:
                    name_val = row[name_idx] if (name_idx is not None and name_idx < len(row)) else ""
                    leads.append((digits, name_val, row_idx))

        return leads

    def write_back_call_result(self, row_index: int, status: str, dtmf: Optional[str], duration: int, did_used: str, call_time: str, sheet_url: Optional[str] = None):
        """
        Writes back call results directly into the matching row of the Google Sheet (requires Service Account).
        Auto-creates required result columns in Row 1 if missing.
        """
        target_url = sheet_url or config.google_sheet_url
        if not target_url or not self._client:
            return

        try:
            spreadsheet = self._client.open_by_url(target_url)
            worksheet = spreadsheet.sheet1
            
            # Fetch headers
            headers = [h.strip() for h in worksheet.row_values(1)]
            result_columns = {
                "Call Status": status.capitalize(),
                "DTMF Pressed": str(dtmf) if dtmf is not None else "None",
                "Duration (s)": str(duration),
                "Caller ID (DID)": str(did_used),
                "Call Time": str(call_time)
            }

            # Check if headers exist; if not, append them to row 1
            headers_to_add = []
            for col_name in result_columns.keys():
                if col_name not in headers:
                    headers.append(col_name)
                    headers_to_add.append(col_name)

            if headers_to_add:
                worksheet.update([headers], "A1")

            # Update the specific cells in row_index
            cells_to_update = []
            for col_name, value in result_columns.items():
                col_num = headers.index(col_name) + 1 # 1-based column
                cells_to_update.append(gspread.Cell(row=row_index, col=col_num, value=value))

            worksheet.update_cells(cells_to_update)
            print(f"[GoogleSheets] Updated row {row_index} with Status={status}, DTMF={dtmf}")

        except Exception as e:
            print(f"[GoogleSheets] Write-back error for row {row_index}: {e}")

google_sheets_service = GoogleSheetsService()
