import os
import io
import csv
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from typing import List, Tuple
from config import config
from models import Lead

def init_excel_file():
    if not os.path.exists(config.excel_file):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "DTMF Responses"
        headers = [
            "Call Date & Time",
            "Customer Number",
            "Customer Name",
            "DID / Caller ID",
            "DTMF Button Pressed",
            "Call Status",
            "Call Duration (sec)",
            "Call ID",
            "Ref ID"
        ]
        ws.append(headers)
        fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
        font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = fill
            cell.font = font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 24
        wb.save(config.excel_file)

def log_lead_to_excel(lead: Lead):
    """Appends a completed lead to the master Excel file on disk."""
    init_excel_file()
    wb = openpyxl.load_workbook(config.excel_file)
    ws = wb.active
    
    row_data = [
        lead.call_time or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        lead.phone_number,
        lead.name or "",
        config.caller_id,
        str(lead.dtmf if lead.dtmf is not None else "None"),
        lead.status.value,
        lead.duration,
        lead.call_id or "",
        lead.ref_id or ""
    ]
    ws.append(row_data)
    wb.save(config.excel_file)

def export_records_to_excel_bytes(records: List[dict], campaign_name: str = "Campaign") -> io.BytesIO:
    """Exports a list of database lead dictionaries to a styled Excel file."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Call Results"
    
    headers = [
        "Customer Number",
        "Name",
        "Call Status",
        "DTMF Button Pressed",
        "Talk Duration (sec)",
        "DID Used",
        "Call Timestamp",
        "Smartflo Call ID",
        "Smartflo Ref ID",
        "Notes / Error"
    ]
    ws.append(headers)
    
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="38BDF8")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 22
        
    for r in records:
        ws.append([
            r.get("phone_number", ""),
            r.get("name", "") or "",
            r.get("status", "").upper(),
            str(r.get("dtmf") if r.get("dtmf") is not None else "No Input"),
            r.get("duration", 0),
            r.get("did_used", "") or "",
            r.get("call_time", "") or "",
            r.get("call_id", "") or "",
            r.get("ref_id", "") or "",
            r.get("error_message", "") or ""
        ])
        
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output

def export_records_to_csv_string(records: List[dict]) -> str:
    """Exports a list of database lead dictionaries to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Phone Number",
        "Name",
        "Status",
        "DTMF Pressed",
        "Talk Duration (s)",
        "Caller ID (DID)",
        "Call Time",
        "Smartflo Call ID",
        "Smartflo Ref ID",
        "Notes"
    ])
    for r in records:
        writer.writerow([
            r.get("phone_number", ""),
            r.get("name", "") or "",
            r.get("status", "").upper(),
            str(r.get("dtmf") if r.get("dtmf") is not None else "No Input"),
            r.get("duration", 0),
            r.get("did_used", "") or "",
            r.get("call_time", "") or "",
            r.get("call_id", "") or "",
            r.get("ref_id", "") or "",
            r.get("error_message", "") or ""
        ])
    return output.getvalue()

def export_queue_to_excel_bytes(leads: List[Lead]) -> io.BytesIO:
    """Creates an in-memory Excel file of the current leads queue for download."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Campaign Results"
    
    headers = [
        "Customer Number",
        "Name",
        "Status",
        "DTMF Pressed",
        "Duration (sec)",
        "Call Time",
        "Call ID",
        "Ref ID"
    ]
    ws.append(headers)
    
    header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 22
        
    for lead in leads:
        ws.append([
            lead.phone_number,
            lead.name or "",
            lead.status.value,
            str(lead.dtmf if lead.dtmf is not None else "None"),
            lead.duration,
            lead.call_time or "",
            lead.call_id or "",
            lead.ref_id or ""
        ])
        
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output

def clean_phone_digits(val: str) -> str:
    """Strips non-digits and handles common prefixes."""
    digits = "".join(c for c in str(val) if c.isdigit())
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits

def is_phone_number_candidate(val: str) -> bool:
    """Checks if a string represents a phone number (10 to 14 digits)."""
    digits = "".join(c for c in str(val) if c.isdigit())
    return 10 <= len(digits) <= 14

def parse_numbers_from_text(raw_text: str) -> List[Tuple[str, str]]:
    """
    Robustly parses phone numbers and optional names from plain text.
    Handles:
      - Line-separated numbers: 918695911105
      - Comma/semicolon-separated list: 9876543210, 9876543211, 9876543212
      - Space-separated numbers: 9876543210 9876543211
      - Paired phone & name: 9876543210, John Doe OR John Doe, 9876543210
      - Formatted numbers: +91 98765-43210, (022) 1234567890
    """
    import re
    leads: List[Tuple[str, str]] = []
    lines = raw_text.strip().splitlines()
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check delimiters: comma, semicolon, tab, pipe
        parts = [p.strip() for p in re.split(r'[,;\t|]+', line) if p.strip()]
        
        if len(parts) > 1:
            # Check if all or multiple items look like phone numbers
            phone_count = sum(1 for p in parts if is_phone_number_candidate(p))
            
            if phone_count == len(parts):
                # Every item is a phone number (e.g. pasted comma-separated list of numbers)
                for p in parts:
                    clean = clean_phone_digits(p)
                    if len(clean) >= 10:
                        leads.append((clean, ""))
            elif len(parts) == 2 and phone_count == 1:
                # Exactly one is phone and the other is name
                if is_phone_number_candidate(parts[0]):
                    leads.append((clean_phone_digits(parts[0]), parts[1]))
                else:
                    leads.append((clean_phone_digits(parts[1]), parts[0]))
            else:
                # Mixed list: extract all valid phone numbers
                for p in parts:
                    if is_phone_number_candidate(p):
                        clean = clean_phone_digits(p)
                        if len(clean) >= 10:
                            leads.append((clean, ""))
        else:
            # Single item or space-separated line
            single_val = parts[0] if parts else line
            tokens = single_val.split()
            
            if len(tokens) > 1:
                token_phone_count = sum(1 for t in tokens if is_phone_number_candidate(t))
                if token_phone_count == len(tokens):
                    for t in tokens:
                        clean = clean_phone_digits(t)
                        if len(clean) >= 10:
                            leads.append((clean, ""))
                elif token_phone_count == 1:
                    phone_token = next(t for t in tokens if is_phone_number_candidate(t))
                    name_tokens = [t for t in tokens if t != phone_token]
                    leads.append((clean_phone_digits(phone_token), " ".join(name_tokens)))
                else:
                    # Might be a single formatted number with spaces: e.g. +91 98765 43210
                    clean = clean_phone_digits(single_val)
                    if len(clean) >= 10:
                        leads.append((clean, ""))
            else:
                clean = clean_phone_digits(single_val)
                if len(clean) >= 10:
                    leads.append((clean, ""))
                    
    return leads

def parse_numbers_from_file(file_bytes: bytes, filename: str) -> List[Tuple[str, str]]:
    """Parses Excel (.xlsx) or CSV files for numbers and names."""
    leads = []
    filename_lower = filename.lower()
    
    if filename_lower.endswith(".csv"):
        text = file_bytes.decode("utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(text))
        for row in reader:
            if not row:
                continue
            row_str = " ".join(row).lower()
            if "phone" in row_str or "number" in row_str or "mobile" in row_str:
                continue # Skip header
            for val in row:
                val = val.strip()
                digits = "".join(c for c in val if c.isdigit())
                if len(digits) >= 10:
                    name = row[0] if row[0] != val else ""
                    leads.append((digits, name))
                    break
    elif filename_lower.endswith((".xlsx", ".xls")):
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        for row in ws.iter_rows(values_only=True):
            if not row:
                continue
            row_str = " ".join(str(c or "") for c in row).lower()
            if "phone" in row_str or "number" in row_str or "mobile" in row_str:
                continue # Skip header
            for idx, cell in enumerate(row):
                if cell is None:
                    continue
                val = str(cell).strip()
                digits = "".join(c for c in val if c.isdigit())
                if len(digits) >= 10:
                    name = str(row[0]) if idx != 0 and row[0] else ""
                    leads.append((digits, name))
                    break
                    
    return leads
