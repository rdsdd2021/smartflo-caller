# Smartflo Auto-Dialer & DTMF Excel Logger

An automated, full-stack outbound calling system for **Tata Tele Business Services (Smartflo)**. Dials a list of numbers sequentially, connects them to an automated IVR audio prompt, collects whatever keypad digits the customer presses (DTMF), and saves the results in real time to both an on-screen live dashboard and an Excel spreadsheet (`smartflo_dtmf_records.xlsx`).

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------------+
|                                    NEXT.JS FRONTEND                                     |
|  - Campaign Control (Start, Pause, Resume, Stop, 1-Click "Retry Missed")                |
|  - Lead Import (Excel .xlsx / CSV Upload + Direct Copy-Paste Textarea)                  |
|  - Live Call Queue (Status badges: Pending, Dialing, Connected, Completed, Missed)      |
|  - Real-Time Analytics (Total Calls, Answered Rate, DTMF Keypad Breakdown Cards)        |
|  - Export Button (Download current run as formatted .xlsx / .csv)                       |
|  - Settings Panel (Pre-configured with your working DID, API Key, and Token)           |
+--------------------------------------------▲--------------------------------------------+
                                             │ REST API
+--------------------------------------------▼--------------------------------------------+
|                                    FASTAPI BACKEND                                      |
|  - Pacing Queue Manager (Calls leads one by one with 3-10s configurable delay)          |
|  - Smartflo Click-to-Call Support Client (/v1/click_to_call_support)                    |
|  - Real-Time CDR Poller (Extracts dtmf_input, duration, status from /v1/call/records)   |
|  - Local Excel Persistence (Auto-appends to smartflo_dtmf_records.xlsx in real time)   |
+-----------------------------------------------------------------------------------------+
```

---

## Pre-Configured Credentials

The system is pre-configured with your verified working Smartflo credentials:
- **Caller ID (DID)**: `917965561295`
- **Click-to-Call Support API Key**: `865fac0f-bed8-491c-aa22-59c55c94d00c`
- **Destination IVR**: `DTMF Test IVR` (ID: `89733`)
- **Keypad Mappings**: Options `0` through `9` configured to capture the pressed digit and complete the call cleanly.

---

## Quick Start

### 1. One-Click Launcher (Windows)
Double-click:
```bat
start.bat
```

### 2. Manual Startup
**Terminal 1 (Backend)**:
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend)**:
```bash
cd frontend
npm start
# or for development: npm run dev
```

Open your browser to:
👉 **http://localhost:3000**

---

## Features

1. **Flexible Lead Ingestion**:
   - Paste numbers directly into the textarea (e.g., `918695911105, John Doe`).
   - Drag & drop or upload `.xlsx`, `.xls`, or `.csv` files.
2. **Interactive Controls**:
   - **Start Queue**: Begins dialing leads one by one.
   - **Pause / Resume**: Temporarily freeze the queue and resume seamlessly.
   - **Stop**: Cancel current campaign.
   - **Retry Missed**: Re-queues only the leads that were missed or unanswered with 1 click.
3. **Real-time Live Table**:
   - Status indicators (`Pending`, `Dialing...`, `In IVR Audio`, `Answered`, `Missed`).
   - Highlighted DTMF keypad chips showing the exact button pressed.
   - Duration in seconds and timestamp.
4. **Excel Export**:
   - Real-time continuous writing to `smartflo_dtmf_records.xlsx` on disk.
   - 1-Click "Export Excel" download button directly from the UI header.
