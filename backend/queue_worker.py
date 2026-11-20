import asyncio
import time
from datetime import datetime
from typing import List, Optional, Dict, Any
from config import config
from models import ChannelSlot, ChannelState, CallStatus
from smartflo_client import smartflo_client
from excel_service import log_lead_to_excel
from google_sheets_service import google_sheets_service
import database
from ws_manager import ws_manager

TOTAL_TRUNK_CAPACITY = 15

class CampaignRunner:
    """Manages background parallel dialing for a single campaign."""
    def __init__(self, campaign_id: str, campaign_data: Dict[str, Any]):
        self.campaign_id = campaign_id
        self.campaign_data = campaign_data
        self.concurrency = min(TOTAL_TRUNK_CAPACITY, max(1, campaign_data.get("concurrency", 5)))
        self.status = campaign_data.get("status", "idle")
        self.channel_slots: List[ChannelSlot] = [
            ChannelSlot(channel_id=i) for i in range(1, self.concurrency + 1)
        ]
        self._did_index: int = 0
        self._pause_event: Optional[asyncio.Event] = None
        self._originate_lock: Optional[asyncio.Lock] = None
        self._in_flight_ids: set = set()
        self._worker_tasks: List[asyncio.Task] = []
        self._pool_task: Optional[asyncio.Task] = None
        self._queue: Optional[asyncio.Queue] = None

    def _get_pause_event(self) -> asyncio.Event:
        if self._pause_event is None:
            self._pause_event = asyncio.Event()
            self._pause_event.set()
        return self._pause_event

    def _get_originate_lock(self) -> asyncio.Lock:
        if self._originate_lock is None:
            self._originate_lock = asyncio.Lock()
        return self._originate_lock

    def get_next_did(self) -> str:
        did_mode = self.campaign_data.get("did_mode", "round_robin")
        single_did = self.campaign_data.get("single_did")
        if did_mode == "single" and single_did:
            return single_did

        dids = config.active_dids if config.active_dids else config.available_dids
        if not dids:
            return single_did or "917965561295"
            
        did = dids[self._did_index % len(dids)]
        self._did_index += 1
        return did

    def set_concurrency(self, new_concurrency: int):
        self.concurrency = min(TOTAL_TRUNK_CAPACITY, max(1, new_concurrency))
        self.channel_slots = [
            ChannelSlot(channel_id=i) for i in range(1, self.concurrency + 1)
        ]
        self.campaign_data["concurrency"] = self.concurrency

    def get_slots(self) -> List[ChannelSlot]:
        now = time.time()
        for slot in self.channel_slots:
            if slot.state == ChannelState.CONNECTED and slot.started_at:
                slot.duration = int(now - slot.started_at)
        return self.channel_slots

    def _reset_slots(self):
        for slot in self.channel_slots:
            slot.state = ChannelState.IDLE
            slot.phone_number = None
            slot.name = None
            slot.did = None
            slot.duration = 0
            slot.dtmf = None
            slot.started_at = None

    def start(self):
        if self.status == "running":
            return
        if self.status == "paused":
            self.resume()
            return

        self.status = "running"
        database.update_campaign_status(self.campaign_id, "running")
        self._get_pause_event().set()

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        self._pool_task = loop.create_task(self._run_pool())

    def pause(self):
        if self.status == "running":
            self.status = "paused"
            database.update_campaign_status(self.campaign_id, "paused")
            self._get_pause_event().clear()

    def resume(self):
        if self.status == "paused":
            self.status = "running"
            database.update_campaign_status(self.campaign_id, "running")
            self._get_pause_event().set()

    def stop(self):
        self.status = "stopped"
        database.update_campaign_status(self.campaign_id, "stopped")
        database.reset_unended_calls(self.campaign_id)
        self._in_flight_ids.clear()
        self._get_pause_event().set()
        for t in self._worker_tasks:
            if not t.done():
                t.cancel()
        self._worker_tasks = []
        if self._pool_task and not self._pool_task.done():
            self._pool_task.cancel()
        self._reset_slots()

    async def _run_pool(self):
        self._queue = asyncio.Queue()
        self._worker_tasks = []
        self._in_flight_ids.clear()

        # Clean up any stuck dialing/connected leads from previous interrupted runs
        database.reset_unended_calls(self.campaign_id)

        # Start designated number of concurrent channel workers
        for i in range(self.concurrency):
            task = asyncio.create_task(self._channel_worker(i + 1))
            self._worker_tasks.append(task)

        # Continuous replenishment loop: keeps queue stocked so channels NEVER starve
        target_buffer = self.concurrency * 2
        while self.status == "running":
            await self._get_pause_event().wait()

            current_qsize = self._queue.qsize()
            if current_qsize < target_buffer:
                needed = target_buffer - current_qsize
                # Fetch pending leads from SQLite
                batch = database.get_next_pending_leads(self.campaign_id, limit=needed + len(self._in_flight_ids) + 20)
                added = 0
                for lead in batch:
                    lid = lead["id"]
                    if lid not in self._in_flight_ids:
                        self._in_flight_ids.add(lid)
                        await self._queue.put(lead)
                        added += 1
                        if added >= needed:
                            break

                # If no leads were added and queue is empty, check if all active calls are done
                if added == 0 and current_qsize == 0:
                    active_working = sum(1 for s in self.channel_slots if s.state != ChannelState.IDLE)
                    if active_working == 0:
                        # Double check database one last time in case retries were added
                        recheck = database.get_next_pending_leads(self.campaign_id, limit=1)
                        if not recheck:
                            break

            await asyncio.sleep(0.4)

        # Stop workers once finished
        for t in self._worker_tasks:
            t.cancel()
        self._worker_tasks = []
        self._in_flight_ids.clear()
        self._reset_slots()

        if self.status != "stopped":
            self.status = "completed"
            database.update_campaign_status(self.campaign_id, "completed")

        database.sync_campaign_counters(self.campaign_id)

    async def _channel_worker(self, channel_id: int):
        slot = self.channel_slots[channel_id - 1]
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        try:
            while True:
                await self._get_pause_event().wait()
                lead = await self._queue.get()
                lead_id = lead["id"]

                # Double check lead status from DB in case it was modified
                did = self.get_next_did()
                phone = lead["phone_number"]
                name = lead.get("name", "")
                call_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                # Update channel slot for live UI
                slot.state = ChannelState.DIALING
                slot.phone_number = phone
                slot.name = name
                slot.did = did
                slot.duration = 0
                slot.dtmf = None
                slot.started_at = time.time()

                database.update_lead(lead_id, {
                    "status": "dialing",
                    "did_used": did,
                    "call_time": call_time
                })
                await ws_manager.broadcast({
                    "type": "slot_change",
                    "campaign_id": self.campaign_id,
                    "slot": slot.model_dump(),
                    "lead_id": lead_id,
                    "status": "dialing"
                })

                # 1. Initiate outbound call via Smartflo with rate-limit pacing and automatic retry
                camp_api_key = self.campaign_data.get("api_key") or config.smartflo_api_key
                max_originate_attempts = 3
                call_res = None

                for attempt in range(1, max_originate_attempts + 1):
                    async with self._get_originate_lock():
                        call_res = await loop.run_in_executor(None, smartflo_client.initiate_call, phone, did, camp_api_key)
                        # Stagger consecutive originates across all channels by 250ms to prevent Smartflo burst 429 errors
                        await asyncio.sleep(0.25)

                    if call_res.get("success"):
                        break

                    status_code = call_res.get("status_code", 0)
                    msg = (call_res.get("message") or "").lower()
                    is_retryable = (
                        status_code in [429, 500, 502, 503, 504] or
                        "too many requests" in msg or
                        "timeout" in msg or
                        "connection" in msg
                    )

                    if is_retryable and attempt < max_originate_attempts:
                        backoff = attempt * 1.5
                        print(f"[Channel-{channel_id}] Smartflo transient originate error ({call_res.get('status_code')}: {call_res.get('message')}). Retrying in {backoff}s (attempt {attempt}/{max_originate_attempts})...")
                        await asyncio.sleep(backoff)
                    else:
                        break

                if not call_res.get("success"):
                    database.update_lead(lead_id, {
                        "status": "failed",
                        "error_message": call_res.get("message", "Call originate rejected")
                    })
                    database.sync_campaign_counters(self.campaign_id)
                    slot.state = ChannelState.IDLE
                    self._in_flight_ids.discard(lead_id)
                    await ws_manager.broadcast({
                        "type": "slot_change",
                        "campaign_id": self.campaign_id,
                        "slot": slot.model_dump()
                    })
                    self._queue.task_done()
                    pacing = self.campaign_data.get("inter_call_delay", 2)
                    if pacing > 0:
                        await asyncio.sleep(pacing)
                    continue

                ref_id = call_res.get("ref_id", "")
                slot.state = ChannelState.CONNECTED
                database.update_lead(lead_id, {"ref_id": ref_id, "status": "connected"})
                await ws_manager.broadcast({
                    "type": "slot_change",
                    "campaign_id": self.campaign_id,
                    "slot": slot.model_dump(),
                    "lead_id": lead_id,
                    "status": "connected"
                })

                # 2. Poll Smartflo CDR with tight 2-second interval for real-time responsiveness
                cdr_record = None
                for _ in range(45): # Up to 90 seconds (45 x 2s)
                    await asyncio.sleep(2)
                    await self._get_pause_event().wait()
                    if self.status == "stopped":
                        break

                    # Update live elapsed duration tick
                    if slot.started_at:
                        slot.duration = int(time.time() - slot.started_at)
                        await ws_manager.broadcast({
                            "type": "slot_tick",
                            "campaign_id": self.campaign_id,
                            "channel_id": slot.channel_id,
                            "duration": slot.duration
                        })

                    # Match by exact ref_id so we never bind to older calls to the same number
                    cdr = await loop.run_in_executor(None, smartflo_client.fetch_latest_cdr_for_number, phone, ref_id)
                    if cdr and cdr.get("call_id"):
                        cdr_record = cdr
                        break

                # 3. Apply ACCURATE IVR ANSWER VALIDATION
                if cdr_record:
                    call_id = str(cdr_record.get("call_id") or "")
                    dtmf_raw = cdr_record.get("dtmf")
                    dtmf_pressed = str(dtmf_raw) if dtmf_raw is not None and str(dtmf_raw).strip() != "" and str(dtmf_raw).lower() != "none" else None
                    answered_sec = int(cdr_record.get("answered_seconds") or 0)
                    raw_duration = int(cdr_record.get("duration") or 0)
                    total_dur = int(cdr_record.get("total_call_duration") or raw_duration)
                    raw_status = (cdr_record.get("status") or "").lower()
                    description = (cdr_record.get("description") or "").lower()
                    detailed_desc = (cdr_record.get("detailed_description") or "").lower()
                    hangup_cause = str(cdr_record.get("hangup_cause") or "")
                    call_time_str = cdr_record.get("date_time")

                    # Accurate IVR Answer Classification:
                    # In Smartflo IVR outbound calls:
                    # 1. Any DTMF input means customer answered and pressed an option
                    # 2. "Call received" in description or IVR prompt in call_flow means customer answered
                    # 3. answered_seconds > 0 or raw_status has "answer"/"connected"
                    # 4. raw_duration >= 3 and not "missed by customer" and hangup is not "No answer"/"Call rejected"
                    is_answered = False
                    if dtmf_pressed is not None:
                        is_answered = True
                    elif answered_sec > 0:
                        is_answered = True
                    elif "call received" in description or "call received" in detailed_desc:
                        is_answered = True
                    elif "answer" in raw_status or "connected" in raw_status:
                        is_answered = True
                    elif raw_duration >= 3 and "missed by customer" not in description and hangup_cause.lower() not in ["no answer", "call rejected", "user busy"]:
                        is_answered = True

                    if is_answered:
                        final_status = "completed"
                        final_duration = answered_sec if answered_sec > 0 else (raw_duration if raw_duration > 0 else total_dur)
                    else:
                        final_duration = 0
                        hangup_lower = hangup_cause.lower()
                        if "no answer" in hangup_lower or "no user response" in hangup_lower:
                            final_status = "no_answer"
                        elif "call rejected" in hangup_lower or "rejected" in hangup_lower:
                            final_status = "rejected"
                        elif "busy" in hangup_lower:
                            final_status = "busy"
                        elif "unallocated" in hangup_lower or "interworking" in hangup_lower or "out of service" in hangup_lower:
                            final_status = "unreachable"
                        elif "invalid" in hangup_lower:
                            final_status = "invalid_number"
                        elif "normal clearing" in hangup_lower:
                            final_status = "quick_hangup"
                        else:
                            final_status = "no_answer"

                    slot.duration = final_duration
                    slot.dtmf = dtmf_pressed

                    database.update_lead(lead_id, {
                        "status": final_status,
                        "dtmf": dtmf_pressed,
                        "duration": final_duration,
                        "call_id": call_id,
                        "call_time": call_time_str or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "did_used": did,
                        "error_message": f"Hangup: {hangup_cause}" if final_status != "completed" else None
                    })
                else:
                    final_status = "no_answer"
                    final_duration = 0
                    dtmf_pressed = None
                    call_id = ""
                    database.update_lead(lead_id, {
                        "status": "no_answer",
                        "duration": 0,
                        "error_message": "No CDR returned / Unanswered"
                    })

                database.sync_campaign_counters(self.campaign_id)

                # Broadcast instant lead completion and slot release
                await ws_manager.broadcast({
                    "type": "lead_completed",
                    "campaign_id": self.campaign_id,
                    "lead_id": lead_id,
                    "status": final_status,
                    "duration": final_duration,
                    "dtmf": dtmf_pressed,
                    "call_id": call_id,
                    "did": did,
                    "call_time": call_time_str or call_time
                })

                # 4. Live Write-Back to Google Sheet (if configured for this campaign)
                sheet_url = self.campaign_data.get("google_sheet_url")
                sheet_row = lead.get("sheet_row_index")
                if sheet_url and sheet_row:
                    try:
                        google_sheets_service.write_back_call_result(
                            row_index=sheet_row,
                            status=final_status,
                            dtmf=dtmf_pressed,
                            duration=final_duration,
                            did_used=did,
                            call_time=call_time
                        )
                    except Exception as e:
                        print(f"[Campaign-{self.campaign_id}] Google Sheet write-back error: {e}")

                # Reset channel slot for next call
                slot.state = ChannelState.IDLE
                slot.phone_number = None
                slot.name = None
                slot.did = None
                slot.duration = 0
                slot.dtmf = None
                slot.started_at = None

                await ws_manager.broadcast({
                    "type": "slot_change",
                    "campaign_id": self.campaign_id,
                    "slot": slot.model_dump()
                })

                self._in_flight_ids.discard(lead_id)
                self._queue.task_done()

                # Inter-call pacing
                pacing = self.campaign_data.get("inter_call_delay", 2)
                if pacing > 0:
                    await asyncio.sleep(pacing)

        except asyncio.CancelledError:
            slot.state = ChannelState.IDLE
        except Exception as e:
            print(f"[CampaignRunner-{self.campaign_id}] Worker {channel_id} exception: {e}")
            slot.state = ChannelState.IDLE
            self._in_flight_ids.discard(lead_id)
            self._queue.task_done()


class MultiCampaignEngine:
    """Arbiter managing all campaign runners and splitting the 15-channel trunk."""
    def __init__(self):
        self.runners: Dict[str, CampaignRunner] = {}
        self._ensure_default_campaign()

    def _ensure_default_campaign(self):
        camps = database.list_campaigns()
        if not camps:
            default_camp = database.create_campaign(
                name="Main Outbound Campaign",
                concurrency=10,
                ivr_id="89733",
                ivr_name="DTMF Test IVR",
                did_mode="round_robin",
                single_did="917965561295",
                inter_call_delay=3
            )
            cid = default_camp["id"]
        else:
            cid = camps[0]["id"]
            default_camp = camps[0]

        if cid not in self.runners:
            self.runners[cid] = CampaignRunner(cid, default_camp)

    def get_runner(self, campaign_id: str) -> CampaignRunner:
        if campaign_id not in self.runners:
            camp_data = database.get_campaign(campaign_id)
            if not camp_data:
                raise ValueError(f"Campaign {campaign_id} not found in database")
            self.runners[campaign_id] = CampaignRunner(campaign_id, camp_data)
        return self.runners[campaign_id]

    def get_total_active_channels(self) -> int:
        total = 0
        for runner in self.runners.values():
            if runner.status == "running":
                total += runner.concurrency
        return total

    def get_available_channels(self) -> int:
        return max(0, TOTAL_TRUNK_CAPACITY - self.get_total_active_channels())

    def start_campaign(self, campaign_id: str) -> Dict[str, Any]:
        runner = self.get_runner(campaign_id)
        if runner.status == "running":
            return {"success": True, "status": "running"}

        # Validate channel capacity
        active_channels = self.get_total_active_channels()
        if active_channels + runner.concurrency > TOTAL_TRUNK_CAPACITY:
            available = TOTAL_TRUNK_CAPACITY - active_channels
            raise ValueError(
                f"Cannot start campaign '{runner.campaign_data.get('name')}': Requires {runner.concurrency} channels, "
                f"but only {available} channels are available on the 15-channel trunk. "
                f"Please reduce this campaign's concurrency or pause another running campaign."
            )

        runner.start()
        return {"success": True, "status": runner.status}

    def pause_campaign(self, campaign_id: str) -> Dict[str, Any]:
        runner = self.get_runner(campaign_id)
        runner.pause()
        return {"success": True, "status": runner.status}

    def resume_campaign(self, campaign_id: str) -> Dict[str, Any]:
        runner = self.get_runner(campaign_id)
        active_channels = self.get_total_active_channels()
        if active_channels + runner.concurrency > TOTAL_TRUNK_CAPACITY:
            available = TOTAL_TRUNK_CAPACITY - active_channels
            raise ValueError(
                f"Cannot resume campaign: Requires {runner.concurrency} channels, but only {available} are available."
            )
        runner.resume()
        return {"success": True, "status": runner.status}

    def stop_campaign(self, campaign_id: str) -> Dict[str, Any]:
        runner = self.get_runner(campaign_id)
        runner.stop()
        return {"success": True, "status": runner.status}

    def retry_missed(self, campaign_id: str) -> Dict[str, Any]:
        count = database.reset_missed_leads(campaign_id)
        if count > 0:
            self.start_campaign(campaign_id)
        return {"success": True, "reset_count": count}

    def get_trunk_status(self) -> Dict[str, Any]:
        active_channels = self.get_total_active_channels()
        running_count = sum(1 for r in self.runners.values() if r.status == "running")
        camps = database.list_campaigns()
        return {
            "total_capacity": TOTAL_TRUNK_CAPACITY,
            "active_channels": active_channels,
            "available_channels": TOTAL_TRUNK_CAPACITY - active_channels,
            "running_campaigns_count": running_count,
            "campaigns": camps
        }

campaign_engine = MultiCampaignEngine()
