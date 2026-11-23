"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Phone,
  PhoneCall,
  PhoneOff,
  Layers,
  Settings,
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  Trash2,
  Plus,
  Search,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Volume2,
  RefreshCw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  FileText,
  Radio,
  Users,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Zap,
  LogOut,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Table as TableIcon,
  LayoutGrid,
  ListFilter,
  SlidersHorizontal,
  ArrowUpDown,
  BarChart3,
  Activity,
  X,
  Check,
  Webhook,
  FileCode
} from "lucide-react";
import { useAuth } from "../components/AuthContext";
import UserManagementModal from "../components/UserManagementModal";
import ChangePasswordModal from "../components/ChangePasswordModal";
import ContactsCRM from "../components/ContactsCRM";
import AudienceFilterBuilder, { FilterRule } from "../components/AudienceFilterBuilder";
import LeadTimelineDrawer from "../components/LeadTimelineDrawer";
import WebhooksModal from "../components/WebhooksModal";
import CampaignAudienceFilters from "../components/CampaignAudienceFilters";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:8000/api`;
    }
    return `${window.location.origin}/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
};

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  live_status?: string;
  concurrency: number;
  ivr_id: string;
  ivr_name: string;
  api_key?: string;
  did_mode: string;
  single_did?: string;
  inter_call_delay: number;
  google_sheet_url?: string;
  google_sheet_phone_col?: string;
  google_sheet_name_col?: string;
  audience_filters?: FilterRule[];
  total_leads: number;
  completed_leads: number;
  answered_leads: number;
  missed_leads: number;
  no_answer_leads?: number;
  rejected_leads?: number;
  busy_leads?: number;
  unreachable_leads?: number;
  quick_hangup_leads?: number;
  invalid_number_leads?: number;
  failed_leads?: number;
  pending_leads?: number;
  answer_rate?: number;
  dtmf_leads?: number;
  dtmf_counts?: Record<string, number>;
  dedup_intra_campaign?: number | boolean;
  dedup_cross_active?: number | boolean;
  enable_cooldown?: number | boolean;
  cooldown_answered_hours?: number;
  cooldown_missed_hours?: number;
  exclude_dnd?: number | boolean;
  created_at: string;
  updated_at: string;
}

interface ChannelSlot {
  channel_id: number;
  state: "idle" | "dialing" | "ringing" | "connected" | "completed";
  phone_number?: string;
  name?: string;
  did?: string;
  duration: number;
  dtmf?: string;
  started_at?: number;
  last_status?: string;
  last_phone?: string;
  last_duration?: number;
}

interface LeadItem {
  id: string;
  phone_number: string;
  name: string;
  status: string;
  dtmf?: string;
  duration: number;
  call_id?: string;
  ref_id?: string;
  call_time?: string;
  did_used?: string;
  error_message?: string;
}

interface TrunkStatus {
  total_capacity: number;
  active_channels: number;
  available_channels: number;
  running_campaigns: number;
  dids_count: number;
}

const DEFAULT_IVRS_FALLBACK = [
  { id: 89733, name: "DTMF Test IVR", description: "Captures any digit pressed (0-9)", recording: "219915", default_api_key: "865fac0f-bed8-491c-aa22-59c55c94d00c" },
  { id: 89718, name: "Generic Hindi All", description: "Hindi Voice Prompt Flow", recording: "219915", default_api_key: "865fac0f-bed8-491c-aa22-59c55c94d00c" },
  { id: 89717, name: "Generic Bengali All", description: "Bengali Voice Prompt Flow", recording: "219914", default_api_key: "" },
];

const DEFAULT_ALL_DIDS = [
  "917965561250", "917965561251", "917965561252", "917965561254", "917965561255",
  "917965561256", "917965561257", "917965561258", "917965561259", "917965561260",
  "917965561261", "917965561262", "917965561263", "917965561264", "917965561265",
  "917965561266", "917965561267", "917965561268", "917965561269", "917965561270",
  "917965561271", "917965561272", "917965561273", "917965561274", "917965561275",
  "917965561276", "917965561277", "917965561278", "917965561279", "917965561280",
  "917965561281", "917965561282", "917965561283", "917965561284", "917965561285",
  "917965561286", "917965561287", "917965561288", "917965561289", "917965561290",
  "917965561291", "917965561292", "917965561293", "917965561295"
];

export default function SmartfloDialerApp() {
  const API_BASE = getApiBase();
  const { user, isLoading: authLoading, isSuperadmin, isAdmin, isAgent, logout, token } = useAuth();
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Navigation & View State
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignTab, setCampaignTab] = useState<"overview" | "settings" | "leads" | "reports">("overview");

  // System Trunk & Campaigns Data
  const [trunkStatus, setTrunkStatus] = useState<TrunkStatus>({
    total_capacity: 15,
    active_channels: 0,
    available_channels: 15,
    running_campaigns: 0,
    dids_count: 44
  });
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [isCampaignsLoading, setIsCampaignsLoading] = useState(true);
  const [activeCampaignDetail, setActiveCampaignDetail] = useState<any | null>(null);
  const [activeSlots, setActiveSlots] = useState<ChannelSlot[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const selectedCampaignIdRef = useRef<string | null>(selectedCampaignId);
  useEffect(() => {
    selectedCampaignIdRef.current = selectedCampaignId;
  }, [selectedCampaignId]);

  // Search & Filter for Dashboard
  const [searchQuery, setSearchQuery] = useState("");
  const [currentAppView, setCurrentAppView] = useState<"campaigns" | "crm">("campaigns");
  const [campaignViewMode, setCampaignViewMode] = useState<"table" | "cards">("table");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<"all" | "running" | "paused" | "idle" | "completed">("all");
  const [campaignIvrFilter, setCampaignIvrFilter] = useState<string>("all");
  const [campaignSortBy, setCampaignSortBy] = useState<"newest" | "name" | "leads" | "answer_rate" | "concurrency">("newest");
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);

  // Modals
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isWebhooksModalOpen, setIsWebhooksModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // New Campaign Form
  const [newCampName, setNewCampName] = useState("");
  const [newCampConcurrency, setNewCampConcurrency] = useState(5);
  const [newCampIVRId, setNewCampIVRId] = useState("89733");
  const [newCampIVRName, setNewCampIVRName] = useState("DTMF Test IVR");
  const [newCampApiKey, setNewCampApiKey] = useState("865fac0f-bed8-491c-aa22-59c55c94d00c");
  const [newCampDelay, setNewCampDelay] = useState(3);
  const [newCampDidMode, setNewCampDidMode] = useState<"round_robin" | "single">("round_robin");
  const [newCampSingleDid, setNewCampSingleDid] = useState("917965561295");
  const [newCampAudienceFilters, setNewCampAudienceFilters] = useState<FilterRule[]>([]);
  const [newCampAudienceCount, setNewCampAudienceCount] = useState<number | null>(null);

  // New Campaign Deduplication & Cooldown Rules
  const [newCampDedupIntra, setNewCampDedupIntra] = useState(true);
  const [newCampDedupCross, setNewCampDedupCross] = useState(true);
  const [newCampEnableCooldown, setNewCampEnableCooldown] = useState(true);
  const [newCampCooldownAnswered, setNewCampCooldownAnswered] = useState(24);
  const [newCampCooldownMissed, setNewCampCooldownMissed] = useState(2);

  // Background Leads Ingestion Job Tracking (100K+ scale, survives page reloads)
  const [activeCampaignJob, setActiveCampaignJob] = useState<{
    id: string;
    status: string;
    total_rows: number;
    processed_rows: number;
    inserted_rows: number;
    percent: number;
    filename: string;
  } | null>(null);

  useEffect(() => {
    if (!activeCampaignJob || activeCampaignJob.status === "completed" || activeCampaignJob.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/import-jobs/${activeCampaignJob.id}`);
        if (res.ok) {
          const job = await res.json();
          setActiveCampaignJob(job);
          if (job.status === "completed") {
            if (selectedCampaignIdRef.current) {
              fetchCampaignDetail(selectedCampaignIdRef.current, false);
              fetchCampaignLeads(selectedCampaignIdRef.current, 1, leadsPageSize, "all", "");
            }
            fetchCampaignsList();
          }
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [activeCampaignJob?.id, activeCampaignJob?.status]);
  const [newCampExcludeDnd, setNewCampExcludeDnd] = useState(true);
  const [newCampForceOverride, setNewCampForceOverride] = useState(false);
  const [isDedupAccordionOpen, setIsDedupAccordionOpen] = useState(false);

  // Lead Timeline Drawer State
  const [selectedTimelineContact, setSelectedTimelineContact] = useState<{ id: string; phone?: string } | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);

  // Active Campaign Editable Settings
  const [editConcurrency, setEditConcurrency] = useState(5);
  const [editIVRId, setEditIVRId] = useState("89733");
  const [editIVRName, setEditIVRName] = useState("DTMF Test IVR");
  const [editApiKey, setEditApiKey] = useState("865fac0f-bed8-491c-aa22-59c55c94d00c");
  const [editDelay, setEditDelay] = useState(3);
  const [editDidMode, setEditDidMode] = useState("round_robin");
  const [editSingleDid, setEditSingleDid] = useState("917965561295");
  const [editDedupIntra, setEditDedupIntra] = useState(true);
  const [editDedupCross, setEditDedupCross] = useState(true);
  const [editEnableCooldown, setEditEnableCooldown] = useState(true);
  const [editCooldownAnswered, setEditCooldownAnswered] = useState(24);
  const [editCooldownMissed, setEditCooldownMissed] = useState(2);
  const [editExcludeDnd, setEditExcludeDnd] = useState(true);

  // Ingestion Summary Modal State
  const [ingestionSummary, setIngestionSummary] = useState<{
    total_candidates: number;
    enqueued_count: number;
    skipped_count: number;
    reasons: Record<string, number>;
    skipped_leads?: Array<{ phone_number: string; name?: string; reason: string; details?: string }>;
  } | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isForceEnqueuing, setIsForceEnqueuing] = useState(false);

  // Paginated Leads Table
  const [leadsList, setLeadsList] = useState<LeadItem[]>([]);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(50);
  const [leadsTotalCount, setLeadsTotalCount] = useState(0);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [leadsStatusFilter, setLeadsStatusFilter] = useState("all");
  const [leadsDtmfFilter, setLeadsDtmfFilter] = useState("all");
  const [jumpPageInput, setJumpPageInput] = useState("");

  // Ingestion inside Campaign
  const [ingestTab, setIngestTab] = useState<"audience" | "sheets" | "file" | "text">("audience");
  const [campAudienceFilters, setCampAudienceFilters] = useState<FilterRule[]>([]);
  const [campAudienceCount, setCampAudienceCount] = useState<number | null>(null);
  const [isEnqueuingAudience, setIsEnqueuingAudience] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetData, setSheetData] = useState<{
    title: string;
    headers: string[];
    row_count: number;
    suggested_phone?: string;
    suggested_name?: string;
  } | null>(null);
  const [selectedPhoneCol, setSelectedPhoneCol] = useState("");
  const [selectedNameCol, setSelectedNameCol] = useState("");
  const [rawTextNumbers, setRawTextNumbers] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export State
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const [exportStatus, setExportStatus] = useState("all");
  const [exportDTMF, setExportDTMF] = useState("all");

  // IVR & Audio Library
  const [availableIVRs, setAvailableIVRs] = useState<any[]>(DEFAULT_IVRS_FALLBACK);
  const [availableRecordings, setAvailableRecordings] = useState<any[]>([]);
  const [uploadAudioName, setUploadAudioName] = useState("");
  const [uploadAudioFile, setUploadAudioFile] = useState<File | null>(null);
  const [isAudioUploading, setIsAudioUploading] = useState(false);
  const [allDIDs, setAllDIDs] = useState<string[]>(DEFAULT_ALL_DIDS);

  const showNotification = (text: string, type: "success" | "error" | "info" = "info") => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // 1. Initial Load & Background Polling
  useEffect(() => {
    fetchTrunkStatus();
    fetchCampaignsList();
    fetchIVRs();
    fetchRecordings();
    fetchDIDs();

    const interval = setInterval(() => {
      fetchTrunkStatus();
      fetchCampaignsList();
      if (selectedCampaignIdRef.current) {
        fetchCampaignDetail(selectedCampaignIdRef.current, false);
        if (campaignTab === "leads") {
          fetchCampaignLeads(selectedCampaignIdRef.current, leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter);
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [campaignTab, leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter]);

  // 1B. Live WebSocket Telemetry Stream (Sub-second real-time push)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWebSocket = () => {
      try {
        const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = typeof window !== "undefined" ? window.location.hostname || "127.0.0.1" : "127.0.0.1";
        const wsPort = typeof window !== "undefined" && window.location.port === "3000"
          ? ":8000"
          : (typeof window !== "undefined" && window.location.port && window.location.port !== "80" && window.location.port !== "443" ? `:${window.location.port}` : "");
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${host}${wsPort}/ws/telemetry`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setWsConnected(true);
          const currentCid = selectedCampaignIdRef.current;
          if (currentCid) fetchCampaignDetail(currentCid, false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const currentCid = selectedCampaignIdRef.current;

            if (data.type === "slot_change" && data.slot) {
              if (currentCid && data.campaign_id && data.campaign_id !== currentCid) {
                return;
              }
              if (!currentCid) return;

              setActiveSlots((prev) => {
                const copy = [...prev];
                const idx = copy.findIndex((s) => s.channel_id === data.slot.channel_id);
                if (idx >= 0) {
                  copy[idx] = data.slot;
                } else {
                  copy.push(data.slot);
                }
                return copy.sort((a, b) => a.channel_id - b.channel_id);
              });
            } else if (data.type === "slot_tick") {
              if (currentCid && data.campaign_id && data.campaign_id !== currentCid) {
                return;
              }
              if (!currentCid) return;

              setActiveSlots((prev) =>
                prev.map((s) =>
                  s.channel_id === data.channel_id ? { ...s, duration: data.duration } : s
                )
              );
            } else if (data.type === "trunk_status" && data.trunk_status) {
              setTrunkStatus(data.trunk_status);
              fetchCampaignsList();
              if (currentCid) fetchCampaignDetail(currentCid, false);
            } else if (data.type === "lead_completed") {
              if (currentCid && (!data.campaign_id || data.campaign_id === currentCid)) {
                setLeadsList((prev) =>
                  prev.map((l) =>
                    l.id === data.lead_id
                      ? {
                          ...l,
                          status: data.status,
                          duration: data.duration,
                          dtmf: data.dtmf,
                          call_id: data.call_id,
                          did_used: data.did,
                          call_time: data.call_time
                        }
                      : l
                  )
                );
              }
              fetchTrunkStatus();
              fetchCampaignsList();
              if (currentCid) fetchCampaignDetail(currentCid, false);
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // When active campaign changes, reset leads page and load campaign details
  useEffect(() => {
    setActiveCampaignDetail(null);
    setActiveSlots([]);
    setLeadsList([]);
    setLeadsDtmfFilter("all");
    setLeadsStatusFilter("all");
    setLeadsSearch("");
    if (selectedCampaignId) {
      fetchCampaignDetail(selectedCampaignId, true);
      setLeadsPage(1);
      fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "", "all");
    }
  }, [selectedCampaignId]);

  // When leads pagination / filter changes
  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignLeads(selectedCampaignId, leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter);
    }
  }, [leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter]);

  // API Callers
  const fetchTrunkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/trunk/status`);
      if (res.ok) setTrunkStatus(await res.json());
    } catch {}
  };

  const fetchCampaignsList = async () => {
    try {
      const res = await fetch(`${API_BASE}/campaigns`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch {} finally {
      setIsCampaignsLoading(false);
    }
  };

  const fetchCampaignDetail = async (cid: string, syncForm = false) => {
    try {
      const res = await fetch(`${API_BASE}/campaigns/${cid}`);
      if (res.ok) {
        const data = await res.json();
        if (selectedCampaignIdRef.current !== cid) return;
        setActiveCampaignDetail(data);
        setActiveSlots((data.channel_slots || []).sort((a: any, b: any) => a.channel_id - b.channel_id));
        // Only sync form state when explicitly requested (campaign switch or after save)
        // This prevents polling from wiping out user's active dropdown selections!
        if (syncForm) {
          setEditConcurrency(data.concurrency || 5);
          setEditIVRId(data.ivr_id || "89733");
          setEditIVRName(data.ivr_name || "DTMF Test IVR");
          setEditApiKey(data.api_key || "865fac0f-bed8-491c-aa22-59c55c94d00c");
          setEditDelay(data.inter_call_delay ?? 3);
          setEditDidMode(data.did_mode || "round_robin");
          setEditSingleDid(data.single_did || "917965561295");
          setEditDedupIntra(data.dedup_intra_campaign !== 0);
          setEditDedupCross(data.dedup_cross_active !== 0);
          setEditEnableCooldown(data.enable_cooldown !== 0);
          setEditCooldownAnswered(data.cooldown_answered_hours ?? 24);
          setEditCooldownMissed(data.cooldown_missed_hours ?? 2);
          setEditExcludeDnd(data.exclude_dnd !== 0);
        }
      }
    } catch {}
  };

  const fetchCampaignLeads = async (
    cid: string,
    page: number,
    pageSize: number,
    status: string,
    search: string,
    dtmf: string = "all"
  ) => {
    try {
      const query = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        limit: String(pageSize),
        status: status,
        search: search.trim(),
        dtmf: dtmf
      });
      const res = await fetch(`${API_BASE}/campaigns/${cid}/leads?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (selectedCampaignIdRef.current !== cid) return;
        const items = data.items || data.leads || [];
        setLeadsList(items);
        setLeadsTotalCount(data.total_count ?? items.length);
        setLeadsTotalPages(data.total_pages ?? Math.max(1, Math.ceil((data.total_count ?? items.length) / pageSize)));
      }
    } catch {}
  };

  const fetchIVRs = async () => {
    try {
      const res = await fetch(`${API_BASE}/ivrs`);
      if (res.ok) {
        const data = await res.json();
        if (data.ivrs && data.ivrs.length > 0) {
          setAvailableIVRs(data.ivrs);
          return;
        }
      }
      setAvailableIVRs(DEFAULT_IVRS_FALLBACK);
    } catch {
      setAvailableIVRs(DEFAULT_IVRS_FALLBACK);
    }
  };

  const fetchRecordings = async () => {
    try {
      const res = await fetch(`${API_BASE}/recordings`);
      if (res.ok) {
        const data = await res.json();
        setAvailableRecordings(data.recordings || []);
      }
    } catch {}
  };

  const fetchDIDs = async () => {
    try {
      const res = await fetch(`${API_BASE}/dids`);
      if (res.ok) {
        const data = await res.json();
        const list = data.all_dids || data.dids || [];
        if (Array.isArray(list) && list.length > 0) {
          setAllDIDs(list);
          return;
        }
      }
      setAllDIDs(DEFAULT_ALL_DIDS);
    } catch {
      setAllDIDs(DEFAULT_ALL_DIDS);
    }
  };

  // Campaign Actions
  const handleCreateCampaign = async () => {
    if (!newCampName.trim()) {
      showNotification("Please enter a campaign name.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampName.trim(),
          concurrency: newCampConcurrency,
          ivr_id: newCampIVRId,
          ivr_name: newCampIVRName,
          api_key: newCampApiKey.trim() || "865fac0f-bed8-491c-aa22-59c55c94d00c",
          did_mode: newCampDidMode,
          single_did: newCampSingleDid,
          inter_call_delay: newCampDelay,
          audience_filters: newCampAudienceFilters,
          dedup_intra_campaign: newCampDedupIntra,
          dedup_cross_active: newCampDedupCross,
          enable_cooldown: newCampEnableCooldown,
          cooldown_answered_hours: newCampCooldownAnswered,
          cooldown_missed_hours: newCampCooldownMissed,
          exclude_dnd: newCampExcludeDnd,
          force_override: newCampForceOverride
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Campaign "${data.campaign.name}" created!`, "success");
        setIsNewCampaignOpen(false);
        setNewCampName("");
        setNewCampAudienceFilters([]);
        setNewCampAudienceCount(null);
        await fetchCampaignsList();
        setSelectedCampaignId(data.campaign.id);
        setCampaignTab("overview");
        if (data.ingestion_summary) {
          setIngestionSummary(data.ingestion_summary);
          setIsSummaryModalOpen(true);
        }
      } else {
        showNotification(data.detail || "Failed to create campaign", "error");
      }
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCampaignSettings = async () => {
    if (!selectedCampaignId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concurrency: editConcurrency,
          ivr_id: editIVRId,
          ivr_name: editIVRName,
          api_key: editApiKey.trim(),
          inter_call_delay: editDelay,
          did_mode: editDidMode,
          single_did: editSingleDid,
          dedup_intra_campaign: editDedupIntra,
          dedup_cross_active: editDedupCross,
          enable_cooldown: editEnableCooldown,
          cooldown_answered_hours: editCooldownAnswered,
          cooldown_missed_hours: editCooldownMissed,
          exclude_dnd: editExcludeDnd
        })
      });
      if (res.ok) {
        showNotification("Campaign settings updated successfully!", "success");
        await fetchCampaignDetail(selectedCampaignId, true);
        await fetchCampaignsList();
      } else {
        const err = await res.json();
        showNotification(err.detail || "Failed to update settings", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCampaignControl = async (cid: string, action: "start" | "pause" | "resume" | "stop") => {
    try {
      const res = await fetch(`${API_BASE}/campaigns/${cid}/${action}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        const msg = data.allocated_channels 
          ? `Campaign ${action.toUpperCase()} (${data.allocated_channels} channels active).`
          : `Campaign ${action.toUpperCase()} signal sent.`;
        showNotification(msg, "success");
        fetchCampaignsList();
        fetchTrunkStatus();
        if (selectedCampaignId === cid) fetchCampaignDetail(cid, false);
      } else {
        showNotification(data.message || data.detail || `Failed to ${action} campaign`, "error");
      }
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, "error");
    }
  };

  const handleDeleteCampaign = async (cid: string) => {
    if (!confirm("Are you sure you want to permanently delete this campaign and all its call history?")) return;
    try {
      const res = await fetch(`${API_BASE}/campaigns/${cid}`, { method: "DELETE" });
      if (res.ok) {
        showNotification("Campaign deleted.", "info");
        if (selectedCampaignId === cid) setSelectedCampaignId(null);
        fetchCampaignsList();
      }
    } catch {}
  };

  const handleRetryMissed = async (cid: string) => {
    try {
      const res = await fetch(`${API_BASE}/campaigns/${cid}/retry-missed`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Reset ${data.reset_count} missed calls to PENDING.`, "success");
        fetchCampaignDetail(cid, false);
        fetchCampaignLeads(cid, leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter);
      }
    } catch {}
  };

  const handleDeleteLead = async (leadId: string, phone: string) => {
    if (!selectedCampaignId) return;
    if (!confirm(`Are you sure you want to remove ${phone} from this campaign?`)) return;
    try {
      const res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/leads/${leadId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Removed ${phone} from leads list.`, "info");
        fetchCampaignDetail(selectedCampaignId, false);
        fetchCampaignLeads(selectedCampaignId, leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter);
      } else {
        showNotification(data.detail || data.message || "Failed to delete lead.", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    }
  };

  const handleClearAllLeads = async () => {
    if (!selectedCampaignId) return;
    if (!confirm("Are you sure you want to delete ALL leads from this campaign? This action cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/clear`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification("All leads have been cleared from this campaign.", "info");
        setLeadsPage(1);
        fetchCampaignDetail(selectedCampaignId, false);
        fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "");
      } else {
        showNotification(data.detail || data.message || "Failed to clear leads.", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    }
  };

  // Ingestion Handlers
  const handleEnqueueAudienceLeads = async () => {
    if (!selectedCampaignId) return;
    setIsEnqueuingAudience(true);
    try {
      const res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/import/audience`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: campAudienceFilters })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Successfully queued ${data.count?.toLocaleString()} leads into this campaign!`, "success");
        fetchCampaignsList();
        fetchCampaignDetail(selectedCampaignId, false);
        fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "", "all");
        if (data.summary) {
          setIngestionSummary(data.summary);
          setIsSummaryModalOpen(true);
        }
      } else {
        showNotification(data.detail || "Failed to queue leads", "error");
      }
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, "error");
    } finally {
      setIsEnqueuingAudience(false);
    }
  };

  const handleInspectSheet = async () => {
    if (!selectedCampaignId || !sheetUrl.trim()) {
      showNotification("Please provide a valid Google Sheet URL.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/sheets/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_url: sheetUrl.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSheetData(data);
        setSelectedPhoneCol(data.suggested_phone || data.headers[0] || "");
        setSelectedNameCol(data.suggested_name || "");
        showNotification(`Sheet connected: "${data.title}" (${data.row_count} rows found)`, "success");
      } else {
        showNotification(data.message || data.detail || "Failed to read Google Sheet.", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportSheet = async () => {
    if (!selectedCampaignId || !sheetUrl.trim() || !selectedPhoneCol) {
      showNotification("Please inspect sheet and select the Phone column.", "error");
      return;
    }
    setIsLoading(true);
    try {
      let res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/sheets/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet_url: sheetUrl.trim(),
          phone_column: selectedPhoneCol,
          name_column: selectedNameCol || null
        })
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/import-sheet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_url: sheetUrl.trim(),
            phone_column: selectedPhoneCol,
            name_column: selectedNameCol || null
          })
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        const count = data.imported_leads ?? data.count ?? 0;
        showNotification(`Imported ${count} leads from Google Sheets!`, "success");
        setSheetData(null);
        setSheetUrl("");
        setLeadsPage(1);
        setLeadsStatusFilter("all");
        setLeadsSearch("");
        fetchCampaignDetail(selectedCampaignId, false);
        fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "");
        if (data.summary) {
          setIngestionSummary(data.summary);
          setIsSummaryModalOpen(true);
        }
      } else {
        showNotification(data.detail || data.message || "Import failed.", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportRawText = async () => {
    if (!selectedCampaignId || !rawTextNumbers.trim()) {
      showNotification("Please paste at least one phone number.", "error");
      return;
    }
    setIsLoading(true);
    try {
      let res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/import/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawTextNumbers.trim() })
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/import-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: rawTextNumbers.trim() })
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        const count = data.imported_leads ?? data.count ?? 0;
        showNotification(`Successfully imported ${count} phone numbers!`, "success");
        setRawTextNumbers("");
        setLeadsPage(1);
        setLeadsStatusFilter("all");
        setLeadsSearch("");
        fetchCampaignDetail(selectedCampaignId, false);
        fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "");
        if (data.summary) {
          setIngestionSummary(data.summary);
          setIsSummaryModalOpen(true);
        }
      } else {
        showNotification(data.detail || data.message || "Failed to import numbers.", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaignId) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      let res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/import/file`, {
        method: "POST",
        body: formData
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/upload-file`, {
          method: "POST",
          body: formData
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.job_id) {
          showNotification(`File accepted (${data.total_rows?.toLocaleString() || "large"} rows). Ingesting in background!`, "success");
          setActiveCampaignJob({
            id: data.job_id,
            status: "processing",
            total_rows: data.total_rows || 0,
            processed_rows: 0,
            inserted_rows: 0,
            percent: 0,
            filename: data.filename || file.name
          });
        } else {
          const count = data.imported_leads ?? data.count ?? 0;
          showNotification(`File uploaded: Added ${count} leads.`, "success");
          setLeadsPage(1);
          setLeadsStatusFilter("all");
          setLeadsSearch("");
          fetchCampaignDetail(selectedCampaignId, false);
          fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "");
          if (data.summary) {
            setIngestionSummary(data.summary);
            setIsSummaryModalOpen(true);
          }
        }
      } else {
        showNotification(data.detail || data.message || "Failed to process file.", "error");
      }
    } catch (err: any) {
      showNotification(`Upload error: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleForceEnqueueSkipped = async () => {
    if (!selectedCampaignId) return;
    setIsForceEnqueuing(true);
    try {
      const res = await fetch(`${API_BASE}/campaigns/${selectedCampaignId}/force-enqueue-skipped`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Successfully force-queued ${data.enqueued_count} leads!`, "success");
        if (ingestionSummary) {
          setIngestionSummary({
            ...ingestionSummary,
            enqueued_count: ingestionSummary.enqueued_count + (ingestionSummary.skipped_count || 0),
            skipped_count: 0,
            reasons: {}
          });
        }
        fetchCampaignsList();
        fetchCampaignDetail(selectedCampaignId, false);
        fetchCampaignLeads(selectedCampaignId, 1, leadsPageSize, "all", "", "all");
      } else {
        showNotification(data.detail || "Failed to force enqueue", "error");
      }
    } catch (e: any) {
      showNotification(`Error: ${e?.message}`, "error");
    } finally {
      setIsForceEnqueuing(false);
    }
  };

  const handleDownloadSkippedCSV = () => {
    if (!selectedCampaignId) return;
    window.open(`${API_BASE}/campaigns/${selectedCampaignId}/export-skipped`, "_blank");
  };

  // Export Download Trigger
  const handleExportDownload = () => {
    if (!selectedCampaignId) return;
    const url = `${API_BASE}/campaigns/${selectedCampaignId}/export?format=${exportFormat}&status=${exportStatus}&dtmf=${exportDTMF}`;
    window.open(url, "_blank");
    showNotification(`Downloading ${exportFormat.toUpperCase()} report...`, "success");
  };

  // Audio Upload
  const handleUploadAudio = async () => {
    if (!uploadAudioName.trim() || !uploadAudioFile) {
      showNotification("Please provide audio name and file.", "error");
      return;
    }
    setIsAudioUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadAudioFile);
      formData.append("audio_name", uploadAudioName.trim());
      const res = await fetch(`${API_BASE}/recordings/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Audio uploaded to Smartflo CDN! ID: #${data.recording_id}`, "success");
        fetchRecordings();
        setUploadAudioName("");
        setUploadAudioFile(null);
        setIsAudioModalOpen(false);
      } else {
        showNotification(data.message || "Upload failed", "error");
      }
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, "error");
    } finally {
      setIsAudioUploading(false);
    }
  };

  // Distinct IVRs for filter dropdown
  const distinctIVRs = React.useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach(c => { if (c.ivr_name) set.add(c.ivr_name); });
    return Array.from(set).sort();
  }, [campaigns]);

  // Campaign Status Counts for filter tabs
  const campaignStatusCounts = React.useMemo(() => {
    return {
      all: campaigns.length,
      running: campaigns.filter(c => (c.live_status || c.status) === "running").length,
      paused: campaigns.filter(c => (c.live_status || c.status) === "paused").length,
      idle: campaigns.filter(c => (c.live_status || c.status) === "idle").length,
      completed: campaigns.filter(c => ["completed", "finished", "stopped"].includes(c.live_status || c.status)).length,
    };
  }, [campaigns]);

  // Filtered & Sorted campaigns for dashboard
  const filteredCampaigns = React.useMemo(() => {
    return campaigns
      .filter((camp) => {
        const status = camp.live_status || camp.status || "idle";
        // 1. Status Filter
        if (campaignStatusFilter === "running" && status !== "running") return false;
        if (campaignStatusFilter === "paused" && status !== "paused") return false;
        if (campaignStatusFilter === "idle" && status !== "idle") return false;
        if (campaignStatusFilter === "completed" && !["completed", "finished", "stopped"].includes(status)) return false;

        // 2. IVR Filter
        if (campaignIvrFilter !== "all" && camp.ivr_name !== campaignIvrFilter) return false;

        // 3. Search Query (name, id, ivr_name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (camp.name || "").toLowerCase().includes(q);
          const matchId = (camp.id || "").toLowerCase().includes(q);
          const matchIVR = (camp.ivr_name || "").toLowerCase().includes(q);
          if (!matchName && !matchId && !matchIVR) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (campaignSortBy === "name") {
          return (a.name || "").localeCompare(b.name || "");
        }
        if (campaignSortBy === "leads") {
          return (b.total_leads || 0) - (a.total_leads || 0);
        }
        if (campaignSortBy === "answer_rate") {
          const rateA = (a.completed_leads || 0) > 0 ? (a.answered_leads || 0) / a.completed_leads : 0;
          const rateB = (b.completed_leads || 0) > 0 ? (b.answered_leads || 0) / b.completed_leads : 0;
          return rateB - rateA;
        }
        if (campaignSortBy === "concurrency") {
          return (b.concurrency || 0) - (a.concurrency || 0);
        }
        // default "newest"
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
  }, [campaigns, campaignStatusFilter, campaignIvrFilter, searchQuery, campaignSortBy]);

  const baseCamp = campaigns.find(c => c.id === selectedCampaignId);
  const activeCamp = (activeCampaignDetail && activeCampaignDetail.id === selectedCampaignId)
    ? { ...(baseCamp || {}), ...activeCampaignDetail }
    : baseCamp;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-500">Authenticating Smartflo Console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col">
      {/* Toast Notification */}
      {actionMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-md text-xs font-medium transition-all ${
          actionMessage.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
          actionMessage.type === "error" ? "bg-rose-50 text-rose-800 border-rose-200" :
          "bg-blue-50 text-blue-800 border-blue-200"
        }`}>
          {actionMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {actionMessage.type === "error" && <XCircle className="w-4 h-4 text-rose-600" />}
          {actionMessage.type === "info" && <Clock className="w-4 h-4 text-blue-600" />}
          {actionMessage.text}
        </div>
      )}

      {/* TOP HEADER - Clean, Modern Shadcn Style */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setSelectedCampaignId(null)}>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 block leading-tight">Smartflo Dialer</span>
              <span className="text-[11px] text-slate-500 font-medium leading-none">Tata Tele Business Services</span>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200 mx-2 hidden sm:block" />

          {/* Navigation Views: Campaigns vs Contacts CRM */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setCurrentAppView("campaigns");
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                currentAppView === "campaigns"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Campaigns</span>
            </button>
            <button
              onClick={() => {
                setCurrentAppView("crm");
                setSelectedCampaignId(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                currentAppView === "crm"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Contacts CRM</span>
            </button>
          </div>

          {/* System Status Indicator - Clean & Executive */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 border border-slate-200 text-xs">
            <span className={`w-2 h-2 rounded-full ${trunkStatus.active_channels > 0 ? "bg-emerald-500 animate-pulse" : "bg-emerald-500"}`} />
            <span className="font-semibold text-slate-800">
              {trunkStatus.active_channels > 0 ? `${trunkStatus.active_channels} Active Calls` : "Trunk Ready"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500 font-medium">15 Trunk Channels</span>
          </div>
        </div>

        {/* Action Header Items */}
        <div className="flex items-center gap-2.5">
          {/* API Docs Button (Interactive Swagger) */}
          <a
            href={API_BASE.replace("/api", "/docs")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
            title="Open Interactive Swagger API Documentation (/docs)"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>API Docs</span>
          </a>

          {/* Webhook Integrations Modal Trigger */}
          {isAdmin && (
            <button
              onClick={() => setIsWebhooksModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
              title="Webhook Integrations & CRM Event Callbacks"
            >
              <Webhook className="w-3.5 h-3.5 text-indigo-600" />
              <span>Webhooks</span>
            </button>
          )}

          {/* Audio Studio (Admin & Superadmin) */}
          {isAdmin && (
            <button
              onClick={() => setIsAudioModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Audio Studio</span>
            </button>
          )}

          {/* Superadmin Team Management */}
          {isSuperadmin && (
            <button
              onClick={() => setIsUserManagementOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-xs font-semibold text-purple-700 shadow-2xs transition-colors"
              title="Team & Access Control (Superadmin Only)"
            >
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>Users</span>
            </button>
          )}

          {/* New Campaign (Admin & Superadmin) */}
          {isAdmin && (
            <button
              onClick={() => {
                setNewCampConcurrency(Math.min(5, Math.max(1, trunkStatus.available_channels || 5)));
                setIsNewCampaignOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Campaign</span>
            </button>
          )}

          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* User Profile Pill & Dropdown */}
          <div className="relative" ref={profileDropdownRef}>
            <button
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">
                {user?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="text-left hidden md:block">
                <span className="block text-xs font-semibold text-slate-800 leading-none">
                  {user?.full_name || user?.email?.split("@")[0] || "User"}
                </span>
                <span className={`inline-block text-[9px] font-bold uppercase tracking-wider mt-0.5 px-1.5 py-0.2 rounded ${
                  isSuperadmin ? "bg-purple-100 text-purple-700" :
                  user?.role === "admin" ? "bg-indigo-100 text-indigo-700" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {user?.role || "AGENT"}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user?.full_name || "Signed in"}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      isSuperadmin ? "bg-purple-50 text-purple-700 border-purple-200" :
                      user?.role === "admin" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                      "bg-slate-50 text-slate-600 border-slate-200"
                    }`}>
                      {isSuperadmin ? <ShieldAlert className="w-3 h-3 text-purple-600" /> : <ShieldCheck className="w-3 h-3 text-indigo-600" />}
                      <span>{user?.role}</span>
                    </span>
                  </div>
                </div>

                {isSuperadmin && (
                  <button
                    onClick={() => {
                      setIsProfileDropdownOpen(false);
                      setIsUserManagementOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 font-medium text-left transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    <span>Manage Team & Users</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    setIsChangePasswordOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 font-medium text-left transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  <span>Change Password</span>
                </button>

                <div className="border-t border-slate-100 my-1" />

                <button
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 font-semibold text-left transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {currentAppView === "crm" ? (
          <ContactsCRM
            apiBase={API_BASE}
            onSelectLead={(contactId, phone) => {
              setSelectedTimelineContact({ id: contactId, phone });
              setIsTimelineOpen(true);
            }}
          />
        ) : selectedCampaignId === null ? (
          <div className="space-y-6">
            {/* ======================================================== */}
            {/* EXECUTIVE CAMPAIGN OPERATIONS OVERVIEW                   */}
            {/* ======================================================== */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campaign Operations</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  High-volume outbound dialing campaigns, real-time pacing telemetry, and connect performance.
                </p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => {
                    setNewCampConcurrency(Math.min(5, Math.max(1, trunkStatus.available_channels || 5)));
                    setIsNewCampaignOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Campaign</span>
                </button>
              )}
            </div>

            {/* Top 4 Executive KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Card 1: Active Fleet */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
                <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Campaign Fleet</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {campaigns.length} <span className="text-xs font-normal text-slate-500">total</span>
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {campaignStatusCounts.running} running
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{campaignStatusCounts.paused} paused</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{campaignStatusCounts.completed} done</span>
                </div>
              </div>

              {/* Card 2: Channel Utilization */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Trunk Utilization</span>
                  <span className="text-xs font-bold text-indigo-600 font-mono">
                    {trunkStatus.active_channels} / {trunkStatus.total_capacity} Active
                  </span>
                </div>
                {/* Sleek single progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((trunkStatus.active_channels / (trunkStatus.total_capacity || 15)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  <span className="font-semibold text-slate-700">{trunkStatus.available_channels}</span> lines free for dialing
                </p>
              </div>

              {/* Card 3: Total Outreach */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
                <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Outreach Volume</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {campaigns.reduce((a, c) => a + (c.completed_leads || 0), 0).toLocaleString()}
                  <span className="text-xs font-normal text-slate-500 ml-1">dialed</span>
                </p>
                <p className="text-xs text-slate-500 mt-2 truncate">
                  Out of <span className="font-semibold text-slate-700">{campaigns.reduce((a, c) => a + (c.total_leads || 0), 0).toLocaleString()}</span> leads loaded
                </p>
              </div>

              {/* Card 4: Overall Connect Rate */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
                <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Connect Rate</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-extrabold text-emerald-600">
                    {(() => {
                      const comp = campaigns.reduce((a, c) => a + (c.completed_leads || 0), 0);
                      const ans = campaigns.reduce((a, c) => a + (c.answered_leads || 0), 0);
                      return comp > 0 ? ((ans / comp) * 100).toFixed(1) : "0.0";
                    })()}%
                  </p>
                  <span className="text-xs text-slate-500 font-medium">answered</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 truncate">
                  <span className="font-semibold text-slate-700">
                    {campaigns.reduce((a, c) => a + (c.answered_leads || 0), 0).toLocaleString()} connected
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-indigo-600 font-semibold">
                    {campaigns.reduce((a, c) => a + (c.dtmf_leads || 0), 0).toLocaleString()} DTMF
                  </span>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* MULTI-FILTER & OPERATIONS CONTROL TOOLBAR                */}
            {/* ======================================================== */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3.5">
              {/* Row 1: Status Filter Tabs & View Toggle Switch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                {/* Status Segmented Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setCampaignStatusFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      campaignStatusFilter === "all"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>All Campaigns</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      campaignStatusFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-700"
                    }`}>
                      {campaignStatusCounts.all}
                    </span>
                  </button>

                  <button
                    onClick={() => setCampaignStatusFilter("running")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      campaignStatusFilter === "running"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Running</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      campaignStatusFilter === "running" ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {campaignStatusCounts.running}
                    </span>
                  </button>

                  <button
                    onClick={() => setCampaignStatusFilter("paused")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      campaignStatusFilter === "paused"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Paused</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      campaignStatusFilter === "paused" ? "bg-amber-700 text-white" : "bg-amber-100 text-amber-800"
                    }`}>
                      {campaignStatusCounts.paused}
                    </span>
                  </button>

                  <button
                    onClick={() => setCampaignStatusFilter("completed")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      campaignStatusFilter === "completed"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>Completed</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      campaignStatusFilter === "completed" ? "bg-blue-700 text-white" : "bg-blue-100 text-blue-800"
                    }`}>
                      {campaignStatusCounts.completed}
                    </span>
                  </button>

                  <button
                    onClick={() => setCampaignStatusFilter("idle")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      campaignStatusFilter === "idle"
                        ? "bg-slate-700 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>Draft / Idle</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      campaignStatusFilter === "idle" ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-700"
                    }`}>
                      {campaignStatusCounts.idle}
                    </span>
                  </button>
                </div>

                {/* View Switcher (Table vs Cards) */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
                  <button
                    onClick={() => setCampaignViewMode("table")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      campaignViewMode === "table"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Dense Operations Table (Optimized for 30+ campaigns)"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Table View</span>
                  </button>
                  <button
                    onClick={() => setCampaignViewMode("cards")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      campaignViewMode === "cards"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Visual Card Grid"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Card Grid</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Search Input, IVR Filter, Sort By, and Reset */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Search Input */}
                  <div className="relative min-w-[240px] flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search campaigns by name or audio flow..."
                      className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* IVR Filter Dropdown */}
                  <div className="relative min-w-[180px]">
                    <select
                      value={campaignIvrFilter}
                      onChange={(e) => setCampaignIvrFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                    >
                      <option value="all">All Audio Flows ({distinctIVRs.length})</option>
                      {distinctIVRs.map((ivr) => (
                        <option key={ivr} value={ivr}>IVR: {ivr}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                  </div>

                  {/* Sort By Dropdown */}
                  <div className="relative min-w-[170px]">
                    <select
                      value={campaignSortBy}
                      onChange={(e) => setCampaignSortBy(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                    >
                      <option value="newest">Sort: Recently Created</option>
                      <option value="name">Sort: Name (A to Z)</option>
                      <option value="leads">Sort: Most Leads</option>
                      <option value="answer_rate">Sort: Highest Connect Rate</option>
                      <option value="concurrency">Sort: Most Channels</option>
                    </select>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                  </div>

                  {/* Clear Filters Reset */}
                  {(searchQuery || campaignStatusFilter !== "all" || campaignIvrFilter !== "all" || campaignSortBy !== "newest") && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCampaignStatusFilter("all");
                        setCampaignIvrFilter("all");
                        setCampaignSortBy("newest");
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
                      title="Reset all search and filter parameters"
                    >
                      <X className="w-3 h-3 text-slate-400" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-500 shrink-0 font-medium">
                  Showing <span className="font-bold text-slate-900 font-mono">{filteredCampaigns.length}</span> of {campaigns.length} campaigns
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* VIEW MODE A: HIGH-DENSITY OPERATIONS TABLE (BEST FOR 30+)*/}
            {/* ======================================================== */}
            {isCampaignsLoading ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-medium text-slate-500">Loading campaign fleet metrics...</p>
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="bg-white border border-slate-200 border-dashed rounded-xl p-12 text-center shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
                  <ListFilter className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No matching campaigns found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Try adjusting your search criteria, status tabs, or IVR audio flow filter.
                </p>
                <div className="flex justify-center gap-2 mt-4">
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setCampaignStatusFilter("all");
                      setCampaignIvrFilter("all");
                    }}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    Clear All Filters
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setIsNewCampaignOpen(true)}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 inline mr-1" />
                      New Campaign
                    </button>
                  )}
                </div>
              </div>
            ) : campaignViewMode === "table" ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4 min-w-[240px]">Campaign</th>
                        <th className="py-3 px-4 min-w-[120px]">Status</th>
                        <th className="py-3 px-4 min-w-[180px]">Outreach Progress</th>
                        <th className="py-3 px-4 min-w-[150px]">Connect Rate</th>
                        <th className="py-3 px-4 min-w-[140px]">Channels &amp; Guard</th>
                        <th className="py-3 px-4 text-right min-w-[140px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredCampaigns.map((camp) => {
                        const status = camp.live_status || camp.status || "idle";
                        const total = camp.total_leads || 0;
                        const answered = camp.answered_leads || 0;
                        const missed = camp.missed_leads || 0;
                        const completed = camp.completed_leads || 0;
                        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                        const answerRate = completed > 0 ? ((answered / completed) * 100).toFixed(1) : "0.0";
                        const isExpanded = expandedCampaignId === camp.id;
                        const remaining = Math.max(0, total - completed);

                        return (
                          <React.Fragment key={camp.id}>
                            <tr className={`transition-colors group ${isExpanded ? "bg-indigo-50/20" : "hover:bg-slate-50/70"}`}>
                              {/* Column 1: Campaign Name & Audio Flow */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-start gap-2.5">
                                  <button
                                    onClick={() => setExpandedCampaignId(isExpanded ? null : camp.id)}
                                    className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors mt-0.5"
                                    title={isExpanded ? "Collapse policy details" : "Expand policy & stats breakdown"}
                                  >
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                                        status === "running" ? "bg-emerald-500 animate-pulse" :
                                        status === "paused" ? "bg-amber-500" :
                                        status === "finished" || status === "completed" ? "bg-blue-500" :
                                        "bg-slate-300"
                                      }`} />
                                      <button
                                        onClick={() => {
                                          setSelectedCampaignId(camp.id);
                                          setCampaignTab("overview");
                                        }}
                                        className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate text-left text-sm"
                                        title={camp.name}
                                      >
                                        {camp.name}
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 pl-4 text-[11px] text-slate-500 truncate">
                                      <span className="text-slate-400">
                                        {camp.created_at ? new Date(camp.created_at.replace(" ", "T")).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Active"}
                                      </span>
                                      <span className="text-slate-300">·</span>
                                      <span className="inline-flex items-center gap-1 font-medium text-slate-600 truncate" title={`Audio Flow: ${camp.ivr_name}`}>
                                        <Volume2 className="w-3 h-3 text-indigo-500 shrink-0" />
                                        <span className="truncate">{camp.ivr_name || "Default IVR"}</span>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Column 2: Status */}
                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  status === "running" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  status === "paused" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  status === "finished" || status === "completed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-slate-100 text-slate-600 border-slate-200"
                                }`}>
                                  {status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                  <span>{status.toUpperCase()}</span>
                                </span>
                              </td>

                              {/* Column 3: Outreach Progress */}
                              <td className="py-3.5 px-4">
                                <div className="space-y-1.5 max-w-[180px]">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-slate-800 font-mono">{percent}%</span>
                                    <span className="text-slate-500 font-mono">{completed.toLocaleString()} / {total.toLocaleString()}</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        status === "running" ? "bg-emerald-500" : "bg-indigo-600"
                                      }`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-medium">
                                    {remaining.toLocaleString()} remaining
                                  </p>
                                </div>
                              </td>

                              {/* Column 4: Connect Rate */}
                              <td className="py-3.5 px-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold font-mono border ${
                                      Number(answerRate) >= 35 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                      Number(answerRate) >= 15 ? "bg-blue-50 text-blue-700 border-blue-200" :
                                      "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}>
                                      {answerRate}%
                                    </span>
                                    <span className="text-slate-500 text-[11px] font-mono">
                                      {answered} answered
                                    </span>
                                  </div>
                                  {camp.dtmf_leads ? (
                                    <div className="flex items-center gap-1 text-[11px] text-indigo-700 font-medium">
                                      <Zap className="w-3 h-3 text-indigo-500 shrink-0" />
                                      <span>{camp.dtmf_leads} keypresses</span>
                                    </div>
                                  ) : null}
                                </div>
                              </td>

                              {/* Column 5: Channels & Guard Policy */}
                              <td className="py-3.5 px-4">
                                <div className="space-y-1">
                                  <span className="text-xs font-semibold text-slate-800 font-mono">
                                    {camp.concurrency} lines
                                  </span>
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    {camp.dedup_intra_campaign !== 0 || camp.dedup_cross_active !== 0 ? (
                                      <>
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span title="Deduplication and collision protection active">Protected</span>
                                      </>
                                    ) : (
                                      <span className="text-slate-400">Standard</span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Column 6: Actions */}
                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {status !== "running" ? (
                                    <button
                                      onClick={() => handleCampaignControl(camp.id, status === "paused" ? "resume" : "start")}
                                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 text-emerald-600 transition-colors"
                                      title="Start / Resume calling"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-emerald-600" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleCampaignControl(camp.id, "pause")}
                                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 text-amber-600 transition-colors"
                                      title="Pause calling"
                                    >
                                      <Pause className="w-3.5 h-3.5 fill-amber-600" />
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      setSelectedCampaignId(camp.id);
                                      setCampaignTab("overview");
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-colors"
                                    title="Open campaign workspace"
                                  >
                                    <span>Open</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>

                                  {isSuperadmin && (
                                    <button
                                      onClick={() => handleDeleteCampaign(camp.id)}
                                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                                      title="Delete Campaign (Superadmin only)"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Expandable Policy & Stats Breakdown */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70 border-b border-slate-200">
                                <td colSpan={6} className="p-4 pl-12">
                                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                      <div className="flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-indigo-600" />
                                        <h4 className="font-bold text-xs text-slate-900">Campaign Policy &amp; Pacing Settings</h4>
                                      </div>
                                      <span className="text-[11px] text-slate-500">
                                        Pacing Delay: <strong className="font-mono text-slate-700">{camp.inter_call_delay ?? 3}s</strong> between calls
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Lead Deduplication</span>
                                        <p className="font-semibold text-slate-800 mt-0.5">
                                          {camp.dedup_intra_campaign !== 0 ? "✓ Enabled (Excludes duplicates)" : "Disabled"}
                                        </p>
                                      </div>

                                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Collision Guard</span>
                                        <p className="font-semibold text-slate-800 mt-0.5">
                                          {camp.dedup_cross_active !== 0 ? "✓ Active (Blocks cross-dialing)" : "Disabled"}
                                        </p>
                                      </div>

                                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Outcome Cooldown</span>
                                        <p className="font-semibold text-slate-800 mt-0.5">
                                          {camp.enable_cooldown !== 0 
                                            ? `✓ ${camp.cooldown_answered_hours ?? 24}h Answered / ${camp.cooldown_missed_hours ?? 2}h Missed`
                                            : "Disabled"}
                                        </p>
                                      </div>

                                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                                        <span className="text-[10px] uppercase font-bold text-slate-500">DND / Opt-Out</span>
                                        <p className="font-semibold text-slate-800 mt-0.5">
                                          {camp.exclude_dnd !== 0 ? "✓ Auto-skips DND Contacts" : "Disabled"}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Audience Targeting Filters Applied */}
                                    <CampaignAudienceFilters
                                      filters={camp.audience_filters}
                                      variant="drawer"
                                      totalLeads={camp.total_leads}
                                    />

                                    {/* Direct Quick Shortcuts */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                                      <div className="flex items-center gap-3 text-slate-500">
                                        <span>Completed: <strong className="text-slate-800 font-mono">{completed}</strong></span>
                                        <span>·</span>
                                        <span>Answered: <strong className="text-emerald-600 font-mono">{answered}</strong></span>
                                        <span>·</span>
                                        <span>Missed: <strong className="text-rose-600 font-mono">{missed}</strong></span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => {
                                            setSelectedCampaignId(camp.id);
                                            setCampaignTab("leads");
                                          }}
                                          className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs"
                                        >
                                          View Leads Queue
                                        </button>

                                        <button
                                          onClick={() => {
                                            setSelectedCampaignId(camp.id);
                                            setCampaignTab("overview");
                                          }}
                                          className="px-3.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs"
                                        >
                                          Enter Workspace →
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* ======================================================== */
              /* VIEW MODE B: VISUAL CARDS GRID                           */
              /* ======================================================== */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredCampaigns.map((camp) => {
                  const status = camp.live_status || camp.status || "idle";
                  const total = camp.total_leads || 0;
                  const answered = camp.answered_leads || 0;
                  const missed = camp.missed_leads || 0;
                  const completed = camp.completed_leads || 0;
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                  const answerRate = completed > 0 ? ((answered / completed) * 100).toFixed(1) : "0.0";

                  return (
                    <div
                      key={camp.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base text-slate-900 tracking-tight leading-snug truncate" title={camp.name}>
                              {camp.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 truncate">
                              <Volume2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="font-medium text-slate-700 truncate">{camp.ivr_name || "Default IVR"}</span>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${
                            status === "running" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            status === "paused" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            status === "finished" || status === "completed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                            {status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                            <span>{status.toUpperCase()}</span>
                          </span>
                        </div>

                        {/* Specs */}
                        <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                          <span className="bg-slate-100 px-2 py-0.5 rounded font-mono font-medium text-slate-700 text-[11px]">
                            {camp.concurrency} lines
                          </span>
                          {camp.dedup_intra_campaign !== 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-medium">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Protected</span>
                            </span>
                          )}
                        </div>

                        {/* Audience Filters Badge */}
                        <CampaignAudienceFilters filters={camp.audience_filters} variant="compact" />

                        {/* Progress Bar */}
                        <div className="mt-4">
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Outreach Progress</span>
                            <span className="font-medium text-slate-700">{percent}% ({completed}/{total})</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                status === "running" ? "bg-emerald-500" : "bg-indigo-600"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        {/* Metrics Mini-Row */}
                        <div className="grid grid-cols-4 gap-1.5 mt-4 pt-3 border-t border-slate-100 text-center text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">ANSWERED</span>
                            <span className="font-semibold text-emerald-600">{answered}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">CONNECT %</span>
                            <span className="font-semibold text-slate-800">{answerRate}%</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">DTMF</span>
                            <span className="font-semibold text-indigo-600">{camp.dtmf_leads || 0}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">MISSED</span>
                            <span className="font-semibold text-rose-500">{missed}</span>
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom Actions */}
                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {status !== "running" ? (
                            <button
                              onClick={() => handleCampaignControl(camp.id, status === "paused" ? "resume" : "start")}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                              title="Start / Resume Campaign"
                            >
                              <Play className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCampaignControl(camp.id, "pause")}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                              title="Pause Calling"
                            >
                              <Pause className="w-4 h-4 text-amber-600 fill-amber-600" />
                            </button>
                          )}

                          {isSuperadmin && (
                            <button
                              onClick={() => handleDeleteCampaign(camp.id)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                              title="Delete Campaign (Superadmin only)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Open Campaign Detail (Primary Enter Action) */}
                        <button
                          onClick={() => {
                            setSelectedCampaignId(camp.id);
                            setCampaignTab("overview");
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors"
                        >
                          <span>Open Campaign</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* VIEW 2: CAMPAIGN DETAIL VIEW (ENTERED CAMPAIGN)          */
          /* ======================================================== */
          <div className="space-y-6">
            {/* Top Breadcrumb & Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedCampaignId(null)}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors shadow-2xs"
                    title="Back to all campaigns"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div>
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                        {activeCamp?.name || "Campaign Details"}
                      </h1>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        (activeCamp?.live_status || activeCamp?.status) === "running" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        (activeCamp?.live_status || activeCamp?.status) === "paused" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-slate-100 text-slate-700 border-slate-200"
                      }`}>
                        {((activeCamp?.live_status || activeCamp?.status) || "IDLE").toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>IVR: <strong className="text-slate-700">{activeCamp?.ivr_name}</strong></span>
                      <span>•</span>
                      <span>Trunk: <strong className="text-slate-700">{activeCamp?.concurrency} channels</strong></span>
                      <span>•</span>
                      <span>Pacing: <strong className="text-slate-700">{activeCamp?.inter_call_delay}s</strong></span>
                    </p>
                  </div>
                </div>

                {/* Call Control Buttons */}
                <div className="flex items-center gap-2">
                  {(activeCamp?.live_status || activeCamp?.status) !== "running" ? (
                    <button
                      onClick={() => activeCamp?.id && handleCampaignControl(activeCamp.id, (activeCamp?.live_status || activeCamp?.status) === "paused" ? "resume" : "start")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Start Calling</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => activeCamp?.id && handleCampaignControl(activeCamp.id, "pause")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold shadow-xs transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5 fill-white" />
                        <span>Pause</span>
                      </button>
                      <button
                        onClick={() => activeCamp?.id && handleCampaignControl(activeCamp.id, "stop")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-colors"
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>Stop</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => activeCamp?.id && handleRetryMissed(activeCamp.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs"
                    title="Retry all calls marked as Missed"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Retry Missed</span>
                  </button>
                </div>
              </div>

              {/* 4 Clean Tabs */}
              <div className="flex items-center gap-1 border-t border-slate-100 mt-5 pt-3">
                <button
                  onClick={() => setCampaignTab("overview")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    campaignTab === "overview"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Overview & Live Telemetry</span>
                </button>

                <button
                  onClick={() => setCampaignTab("leads")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    campaignTab === "leads"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Add Data & Leads ({activeCamp?.total_leads || 0})</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => setCampaignTab("settings")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      campaignTab === "settings"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configure IVR & Settings</span>
                  </button>
                )}

                <button
                  onClick={() => setCampaignTab("reports")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    campaignTab === "reports"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Reports & Export</span>
                </button>
              </div>
            </div>

            {/* TAB CONTENT 1: OVERVIEW & LIVE TRUNK TELEMETRY */}
            {campaignTab === "overview" && (
              <div className="space-y-6">
                {/* Granular KPI Metrics */}
                {(() => {
                  const dtmfCountsObj: Record<string, number> = activeCamp?.dtmf_counts || {};
                  const totalDtmfCount = Object.values(dtmfCountsObj).reduce((a, b) => a + b, 0) || (activeCamp?.dtmf_leads || 0);
                  const dtmfKeyEntries = Object.entries(dtmfCountsObj).sort((a, b) => b[1] - a[1]);
                  const dtmfSummaryText = dtmfKeyEntries.length > 0
                    ? dtmfKeyEntries.slice(0, 3).map(([k, v]) => `Key ${k}: ${v}`).join(", ") + (dtmfKeyEntries.length > 3 ? "..." : "")
                    : (activeCamp?.answered_leads ? `${Math.round((totalDtmfCount / (activeCamp.answered_leads || 1)) * 100)}% of Answered` : "Key presses (0-9)");

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                        <span className="text-[11px] text-slate-500 font-medium">Total Leads</span>
                        <p className="text-xl font-bold text-slate-900 mt-1">{activeCamp?.total_leads || 0}</p>
                        <span className="text-[10px] text-slate-400">In Campaign</span>
                      </div>
                      <div className="bg-white border border-emerald-100 rounded-xl p-3.5 shadow-2xs bg-emerald-50/20">
                        <span className="text-[11px] text-emerald-700 font-medium">Answered</span>
                        <p className="text-xl font-bold text-emerald-600 mt-1">{activeCamp?.answered_leads || 0}</p>
                        <span className="text-[10px] text-emerald-600/80">{activeCamp?.answer_rate || 0}% Connect Rate</span>
                      </div>
                      <div 
                        onClick={() => {
                          setLeadsDtmfFilter("any");
                          setCampaignTab("leads");
                        }}
                        className="bg-white border border-indigo-200 rounded-xl p-3.5 shadow-2xs bg-indigo-50/30 cursor-pointer hover:border-indigo-400 hover:shadow-xs transition-all group"
                        title="Click to view all leads with DTMF inputs in Leads tab"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-indigo-700 font-medium">DTMF Pressed</span>
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            Filter
                          </span>
                        </div>
                        <p className="text-xl font-bold text-indigo-600 mt-1">{totalDtmfCount}</p>
                        <span className="text-[10px] text-indigo-600/80 truncate block" title={dtmfSummaryText}>
                          {dtmfSummaryText}
                        </span>
                      </div>
                      <div className="bg-white border border-amber-100 rounded-xl p-3.5 shadow-2xs bg-amber-50/20">
                        <span className="text-[11px] text-amber-700 font-medium">No Answer</span>
                        <p className="text-xl font-bold text-amber-600 mt-1">{activeCamp?.no_answer_leads || 0}</p>
                        <span className="text-[10px] text-amber-600/80">Rang 30s</span>
                      </div>
                      <div className="bg-white border border-purple-100 rounded-xl p-3.5 shadow-2xs bg-purple-50/20">
                        <span className="text-[11px] text-purple-700 font-medium">Rejected</span>
                        <p className="text-xl font-bold text-purple-600 mt-1">{activeCamp?.rejected_leads || 0}</p>
                        <span className="text-[10px] text-purple-600/80">Declined</span>
                      </div>
                      <div className="bg-white border border-orange-100 rounded-xl p-3.5 shadow-2xs bg-orange-50/20">
                        <span className="text-[11px] text-orange-700 font-medium">Busy</span>
                        <p className="text-xl font-bold text-orange-600 mt-1">{activeCamp?.busy_leads || 0}</p>
                        <span className="text-[10px] text-orange-600/80">Line Engaged</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs bg-slate-50/50">
                        <span className="text-[11px] text-slate-600 font-medium">Unreachable</span>
                        <p className="text-xl font-bold text-slate-700 mt-1">{activeCamp?.unreachable_leads || 0}</p>
                        <span className="text-[10px] text-slate-400">Switched Off</span>
                      </div>
                      <div className="bg-white border border-sky-100 rounded-xl p-3.5 shadow-2xs bg-sky-50/20">
                        <span className="text-[11px] text-sky-700 font-medium">Quick Hangup</span>
                        <p className="text-xl font-bold text-sky-600 mt-1">{activeCamp?.quick_hangup_leads || 0}</p>
                        <span className="text-[10px] text-sky-600/80">&lt; 3s Call</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Live Channels Grid for this campaign */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-indigo-600" />
                      <h2 className="text-sm font-semibold text-slate-900">
                        Live Trunk Channels ({activeSlots.filter(s => s.state !== "idle").length} of {activeSlots.length} active)
                      </h2>
                    </div>
                    <span className="text-xs text-slate-400">Updates live via Smartflo PBX</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {activeSlots.map((slot) => {
                      const isBusy = slot.state !== "idle";
                      return (
                        <div
                          key={slot.channel_id}
                          className={`p-3.5 rounded-lg border transition-all ${
                            slot.state === "connected"
                              ? "bg-emerald-50/70 border-emerald-200"
                              : slot.state === "ringing"
                              ? "bg-sky-50/70 border-sky-200"
                              : slot.state === "dialing"
                              ? "bg-amber-50/70 border-amber-200 animate-pulse"
                              : "bg-slate-50/60 border-slate-200 text-slate-400"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                            <span className="text-slate-700">CH #{slot.channel_id}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                              slot.state === "connected" ? "bg-emerald-200/60 text-emerald-800" :
                              slot.state === "ringing" ? "bg-sky-200/70 text-sky-800 animate-pulse" :
                              slot.state === "dialing" ? "bg-amber-200/60 text-amber-800" :
                              "bg-slate-200 text-slate-600"
                            }`}>
                              {slot.state.toUpperCase()}
                            </span>
                          </div>

                          {isBusy ? (
                            <div className="space-y-0.5 mt-2">
                              <p className="text-xs font-mono font-bold text-slate-900">{slot.phone_number}</p>
                              {slot.name && <p className="text-[11px] text-slate-600 truncate">{slot.name}</p>}
                              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                                <span>DID: ...{(slot.did || "").slice(-4)}</span>
                                <span className="font-semibold text-slate-700">{slot.duration}s</span>
                              </div>
                            </div>
                          ) : (
                            <div className="py-2 text-center text-xs text-slate-400">Idle slot</div>
                          )}

                          {slot.last_status && (
                            <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Prev:</span>
                              <span className={`px-1.5 py-0.5 rounded font-semibold text-[9px] ${
                                slot.last_status === "completed" || slot.last_status === "answered" ? "bg-emerald-100 text-emerald-800" :
                                slot.last_status === "rejected" ? "bg-purple-100 text-purple-800" :
                                slot.last_status === "busy" ? "bg-orange-100 text-orange-800" :
                                slot.last_status === "no_answer" ? "bg-rose-100 text-rose-800" :
                                slot.last_status === "unreachable" ? "bg-slate-200 text-slate-700" :
                                slot.last_status === "quick_hangup" ? "bg-sky-100 text-sky-800" :
                                "bg-slate-100 text-slate-600"
                              }`}>
                                {slot.last_status.replace("_", " ").toUpperCase()}{slot.last_duration ? ` (${slot.last_duration}s)` : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Audience Targeting & Dynamic Filters Card */}
                <CampaignAudienceFilters
                  filters={activeCamp?.audience_filters}
                  variant="card"
                  totalLeads={activeCamp?.total_leads}
                  onRefineClick={() => {
                    setCampaignTab("leads");
                    setIngestTab("audience");
                  }}
                />
              </div>
            )}

            {/* TAB CONTENT 2: CONFIGURE IVR & CAMPAIGN SETTINGS */}
            {campaignTab === "settings" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Campaign & Telephony Configuration</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure which IVR audio flows play, assign dedicated Smartflo Support routing keys, and tune channel allocation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* IVR Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Destination IVR Audio Flow
                    </label>
                    <select
                      value={editIVRId}
                      onChange={(e) => {
                        const sel = availableIVRs.find(i => String(i.id) === e.target.value);
                        setEditIVRId(e.target.value);
                        if (sel) {
                          setEditIVRName(sel.name);
                          if (sel.default_api_key) setEditApiKey(sel.default_api_key);
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      {availableIVRs.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} (ID #{i.id})
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Controls which audio recording and DTMF keypad menu the customer hears.
                    </span>
                  </div>

                  {/* Smartflo Routing Key */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Smartflo Support Routing Key (API Key)
                      </label>
                      <span className="text-[10px] text-indigo-600 font-medium">Binds audio on Tata switch</span>
                    </div>
                    <input
                      type="text"
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                      placeholder="e.g. 865fac0f-bed8-491c-aa22-59c55c94d00c"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      The Click-to-Call Support API Key from Smartflo Portal mapped to this IVR.
                    </span>
                  </div>

                  {/* Channel Allocation */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Trunk Channel Allocation
                      </label>
                      <span className="text-xs font-bold text-indigo-600 font-mono">{editConcurrency} channels</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max={15}
                      value={editConcurrency}
                      onChange={(e) => setEditConcurrency(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Max calls placed concurrently for this campaign (total trunk cap: 15 channels).
                    </span>
                  </div>

                  {/* Pacing Delay */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Inter-Call Pacing Delay (Seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={editDelay}
                      onChange={(e) => setEditDelay(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Cooldown buffer before a freed channel dials the next lead.
                    </span>
                  </div>

                  {/* Caller ID Mode */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Caller ID (DID) Strategy
                    </label>
                    <select
                      value={editDidMode}
                      onChange={(e) => setEditDidMode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="round_robin">Round-Robin Rotation (across all 44 DIDs)</option>
                      <option value="single">Fixed Single DID Number</option>
                    </select>
                  </div>

                  {editDidMode === "single" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Select Single DID (Caller ID)
                        </label>
                        <span className="text-[10px] text-slate-500 font-medium">{allDIDs.length} DIDs Available</span>
                      </div>
                      <select
                        value={editSingleDid}
                        onChange={(e) => setEditSingleDid(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        {allDIDs.map((d, idx) => (
                          <option key={d} value={d}>+{d} (DID #{idx + 1})</option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        All calls in this campaign will use this specific outbound Caller ID.
                      </span>
                    </div>
                  )}
                </div>

                {/* Deduplication & Cooldown Policy for Active Campaign */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">Lead Deduplication & Cooldown Policy</h3>
                      <p className="text-[11px] text-slate-500">Controls rules applied when adding new leads via audience segments, files, or sheets.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editDedupIntra}
                        onChange={(e) => setEditDedupIntra(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800">Intra-Campaign Deduplication</span>
                        <p className="text-[11px] text-slate-500">Do not add numbers that already exist in this campaign.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editDedupCross}
                        onChange={(e) => setEditDedupCross(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800">Cross-Campaign Active Collision Guard</span>
                        <p className="text-[11px] text-slate-500">Exclude numbers currently queued or dialing in other campaigns.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editEnableCooldown}
                        onChange={(e) => setEditEnableCooldown(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800">Outcome-Aware Cooldown</span>
                        <p className="text-[11px] text-slate-500">Prevent burning leads with calls too soon after recent attempts.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editExcludeDnd}
                        onChange={(e) => setEditExcludeDnd(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800">Exclude DND / Opt-Out Contacts</span>
                        <p className="text-[11px] text-slate-500">Skip contacts flagged as Do-Not-Disturb in the CRM.</p>
                      </div>
                    </label>
                  </div>

                  {editEnableCooldown && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Cooldown After Answered Call (Hours)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="720"
                          value={editCooldownAnswered}
                          onChange={(e) => setEditCooldownAnswered(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 font-mono"
                        />
                        <span className="text-[11px] text-slate-500">Hours to wait after a completed or answered conversation.</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Cooldown After Missed / Busy Call (Hours)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="168"
                          value={editCooldownMissed}
                          onChange={(e) => setEditCooldownMissed(Math.max(0, Number(e.target.value)))}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 font-mono"
                        />
                        <span className="text-[11px] text-slate-500">Hours to wait after a missed, rejected, or unanswered call.</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs">
                    {activeCampaignDetail && (
                      activeCampaignDetail.did_mode !== editDidMode ||
                      activeCampaignDetail.single_did !== editSingleDid ||
                      activeCampaignDetail.concurrency !== editConcurrency ||
                      activeCampaignDetail.api_key !== editApiKey ||
                      activeCampaignDetail.ivr_id !== editIVRId ||
                      activeCampaignDetail.inter_call_delay !== editDelay ||
                      activeCampaignDetail.dedup_intra_campaign !== (editDedupIntra ? 1 : 0) ||
                      activeCampaignDetail.dedup_cross_active !== (editDedupCross ? 1 : 0) ||
                      activeCampaignDetail.enable_cooldown !== (editEnableCooldown ? 1 : 0) ||
                      activeCampaignDetail.cooldown_answered_hours !== editCooldownAnswered ||
                      activeCampaignDetail.cooldown_missed_hours !== editCooldownMissed ||
                      activeCampaignDetail.exclude_dnd !== (editExcludeDnd ? 1 : 0)
                    ) ? (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Unsaved changes - click &quot;Save Configuration&quot; to apply
                      </span>
                    ) : (
                      <span className="text-slate-400">Settings synchronized with campaign database.</span>
                    )}
                  </div>
                  <button
                    onClick={handleUpdateCampaignSettings}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Settings className="w-4 h-4" />
                    <span>{isLoading ? "Saving..." : "Save Configuration"}</span>
                  </button>
                </div>
              </div>

              {/* Audience Targeting Criteria */}
              <CampaignAudienceFilters
                filters={activeCamp?.audience_filters}
                variant="card"
                totalLeads={activeCamp?.total_leads}
                onRefineClick={() => {
                  setCampaignTab("leads");
                  setIngestTab("audience");
                }}
              />
            </div>
            )}

            {/* TAB CONTENT 3: ADD DATA & LEADS TABLE */}
            {campaignTab === "leads" && (
              <div className="space-y-6">
                {/* Active Audience Filters Banner */}
                <CampaignAudienceFilters
                  filters={activeCamp?.audience_filters}
                  variant="banner"
                  totalLeads={activeCamp?.total_leads}
                  onRefineClick={() => setIngestTab("audience")}
                />

                {/* Active Campaign Leads Ingestion Banner */}
                {activeCampaignJob && (
                  <div className={`p-4 rounded-xl border transition-all ${
                    activeCampaignJob.status === "completed"
                      ? "bg-emerald-50 border-emerald-200"
                      : activeCampaignJob.status === "failed"
                      ? "bg-rose-50 border-rose-200"
                      : "bg-indigo-50/70 border-indigo-200"
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {activeCampaignJob.status === "completed" ? (
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : activeCampaignJob.status === "failed" ? (
                          <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0 animate-pulse">
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">
                              {activeCampaignJob.status === "completed"
                                ? `Campaign Leads Ingestion Complete: ${activeCampaignJob.filename}`
                                : activeCampaignJob.status === "failed"
                                ? `Import Failed: ${activeCampaignJob.filename}`
                                : `Ingesting Large Leads File in Background: "${activeCampaignJob.filename}"`}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              activeCampaignJob.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : activeCampaignJob.status === "failed"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-indigo-100 text-indigo-800 animate-pulse"
                            }`}>
                              {activeCampaignJob.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {activeCampaignJob.status === "completed"
                              ? `Added ${activeCampaignJob.inserted_rows.toLocaleString()} leads to this campaign.`
                              : "Processing in the background with deduplication & cooldown guard. You can safely close or reload this page!"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900">{activeCampaignJob.percent}%</span>
                          <span className="text-[11px] text-slate-500 block font-mono">
                            {activeCampaignJob.processed_rows.toLocaleString()} / {activeCampaignJob.total_rows.toLocaleString()} rows
                          </span>
                        </div>
                        {activeCampaignJob.status === "completed" && (
                          <button
                            onClick={() => setActiveCampaignJob(null)}
                            className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg shadow-2xs"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>

                    {activeCampaignJob.status !== "completed" && activeCampaignJob.status !== "failed" && (
                      <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden mt-3">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(1, activeCampaignJob.percent))}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* INGESTION SECTION */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Add Leads & Data Source</h2>
                      <p className="text-xs text-slate-500">Sync with Google Sheets, upload CSV/Excel files, or paste numbers.</p>
                    </div>

                    {/* Sub-tabs */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                      <button
                        onClick={() => setIngestTab("audience")}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                          ingestTab === "audience" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Audience Filter (CRM)
                      </button>
                      <button
                        onClick={() => setIngestTab("file")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                          ingestTab === "file" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        CSV / Excel File
                      </button>
                      <button
                        onClick={() => setIngestTab("sheets")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                          ingestTab === "sheets" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Google Sheets
                      </button>
                      <button
                        onClick={() => setIngestTab("text")}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                          ingestTab === "text" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Paste Numbers
                      </button>
                    </div>
                  </div>

                  {/* 0. Audience Segmentation from Contacts CRM */}
                  {ingestTab === "audience" && (
                    <div className="space-y-4">
                      <AudienceFilterBuilder
                        apiBase={API_BASE}
                        onFilterChange={(rules, count) => {
                          setCampAudienceFilters(rules);
                          setCampAudienceCount(count);
                        }}
                      />
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleEnqueueAudienceLeads}
                          disabled={isEnqueuingAudience}
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
                        >
                          {isEnqueuingAudience ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Users className="w-4 h-4" />
                          )}
                          <span>
                            {isEnqueuingAudience
                              ? "Queueing Leads into Campaign..."
                              : campAudienceCount !== null && campAudienceCount > 0
                              ? `Queue ${campAudienceCount.toLocaleString()} Matching Leads`
                              : "Queue Matching Contacts into Campaign"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 1. Google Sheets */}
                  {ingestTab === "sheets" && (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={sheetUrl}
                          onChange={(e) => setSheetUrl(e.target.value)}
                          placeholder="Paste Google Sheets link (e.g. https://docs.google.com/spreadsheets/d/...)"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                        <button
                          onClick={handleInspectSheet}
                          disabled={isLoading}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                        >
                          {isLoading ? "Inspecting..." : "Connect Sheet"}
                        </button>
                      </div>

                      <div className="flex items-start gap-2 p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs text-indigo-900">
                        <span className="font-semibold text-indigo-700 shrink-0">💡 Zero Setup:</span>
                        <span>In Google Sheets, click <strong>Share</strong> &rarr; change General Access to <strong>&quot;Anyone with the link can view&quot;</strong>, then paste the link above. It connects instantly with zero cloud setup!</span>
                      </div>

                      {sheetData && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                            <span>Found {sheetData.row_count} rows in "{sheetData.title}"</span>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Phone Column (Required):</label>
                              <select
                                value={selectedPhoneCol}
                                onChange={(e) => setSelectedPhoneCol(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                              >
                                {sheetData.headers.map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Customer Name Column (Optional):</label>
                              <select
                                value={selectedNameCol}
                                onChange={(e) => setSelectedNameCol(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                              >
                                <option value="">-- None --</option>
                                {sheetData.headers.map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <button
                            onClick={handleImportSheet}
                            disabled={isLoading}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-xs"
                          >
                            Import {sheetData.row_count} Leads into Campaign
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. File Upload */}
                  {ingestTab === "file" && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">Upload CSV or Excel file</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Drag and drop or browse your file (up to 50,000 numbers)</p>
                      <div className="mt-2.5 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const csv = "phone_number,name\n919876543210,Rahul Sharma\n919876543211,Priya Patel\n919876543212,Ananya Das";
                            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "sample_leads.csv";
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 transition-colors shadow-2xs"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download Sample CSV</span>
                        </button>
                        <a
                          href={`${API_BASE}/contacts/sample-template?format=xlsx`}
                          download="sample_leads.xlsx"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors shadow-2xs"
                        >
                          <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                          <span>Download Sample Excel</span>
                        </a>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv, .xlsx, .xls"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Select File</span>
                      </button>
                    </div>
                  )}

                  {/* 3. Paste Numbers */}
                  {ingestTab === "text" && (
                    <div className="space-y-3">
                      <textarea
                        rows={4}
                        value={rawTextNumbers}
                        onChange={(e) => setRawTextNumbers(e.target.value)}
                        placeholder="Paste phone numbers separated by commas, tabs, or newlines (e.g. +918695911105, 9876543210)..."
                        className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <button
                        onClick={handleImportRawText}
                        disabled={isLoading || !rawTextNumbers.trim()}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                      >
                        Import Pasted Numbers
                      </button>
                    </div>
                  )}
                </div>

                {/* PAGINATED LEADS TABLE */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                  {/* Table Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={leadsSearch}
                          onChange={(e) => {
                            setLeadsSearch(e.target.value);
                            setLeadsPage(1);
                          }}
                          placeholder="Search phone or name..."
                          className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <select
                        value={leadsStatusFilter}
                        onChange={(e) => {
                          setLeadsStatusFilter(e.target.value);
                          setLeadsPage(1);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                      >
                        <option value="all">All Statuses</option>
                        <option value="completed">Answered</option>
                        <option value="no_answer">No Answer (Rang 30s)</option>
                        <option value="rejected">Rejected / Declined</option>
                        <option value="busy">User Busy</option>
                        <option value="unreachable">Unreachable / Switched Off</option>
                        <option value="quick_hangup">Quick Hangup (&lt;3s)</option>
                        <option value="failed">Failed / System Error</option>
                        <option value="pending">Pending in Queue</option>
                        <option value="missed">All Unanswered (Summary)</option>
                      </select>

                      <select
                        value={leadsDtmfFilter}
                        onChange={(e) => {
                          setLeadsDtmfFilter(e.target.value);
                          setLeadsPage(1);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                      >
                        <option value="all">All DTMF</option>
                        <option value="any">Any Key Pressed</option>
                        <option value="none">No Key Pressed</option>
                        {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"].map((key) => {
                          const count = (activeCamp?.dtmf_counts || {})[key];
                          return (
                            <option key={key} value={key}>
                              Key {key} {count !== undefined ? `(${count})` : ""}
                            </option>
                          );
                        })}
                      </select>

                      <button
                        onClick={() => {
                          if (selectedCampaignId) {
                            fetchCampaignLeads(selectedCampaignId, leadsPage, leadsPageSize, leadsStatusFilter, leadsSearch, leadsDtmfFilter);
                            showNotification("Leads list refreshed.", "info");
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors text-xs font-medium"
                        title="Refresh Leads Table"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh</span>
                      </button>

                      {leadsTotalCount > 0 && (
                        <button
                          onClick={handleClearAllLeads}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors text-xs font-medium"
                          title="Delete all leads from this campaign"
                        >
                          <Trash2 className="w-3 h-3 text-rose-600" />
                          <span>Clear All</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Show:</span>
                      <select
                        value={leadsPageSize}
                        onChange={(e) => {
                          setLeadsPageSize(Number(e.target.value));
                          setLeadsPage(1);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
                      >
                        <option value={25}>25 per page</option>
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                      </select>
                    </div>
                  </div>

                  {/* Table Component */}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Phone Number</th>
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Talk Duration</th>
                          <th className="py-2.5 px-3">DTMF Key</th>
                          <th className="py-2.5 px-3">Caller DID</th>
                          <th className="py-2.5 px-3">Call Time</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {leadsList.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-400">
                              No leads found. Use the import options above to add data.
                            </td>
                          </tr>
                        ) : (
                          leadsList.map((lead, idx) => (
                            <tr
                              key={lead.id}
                              onClick={() => {
                                setSelectedTimelineContact({ id: lead.id, phone: lead.phone_number });
                                setIsTimelineOpen(true);
                              }}
                              className="hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                              title="Click to view contact timeline & profile"
                            >
                              <td className="py-2.5 px-3 text-slate-400 font-mono">
                                {(leadsPage - 1) * leadsPageSize + idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                                {lead.phone_number}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {lead.name || "—"}
                              </td>
                              <td className="py-2.5 px-3">
                                {(() => {
                                  const s = (lead.status || "").toLowerCase();
                                  if (s === "completed" || s === "answered") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        ANSWERED
                                      </span>
                                    );
                                  }
                                  if (s === "no_answer") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                        NO ANSWER
                                      </span>
                                    );
                                  }
                                  if (s === "rejected") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                        REJECTED
                                      </span>
                                    );
                                  }
                                  if (s === "busy") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                                        BUSY
                                      </span>
                                    );
                                  }
                                  if (s === "unreachable" || s === "invalid_number") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                                        {s === "invalid_number" ? "INVALID NUMBER" : "UNREACHABLE"}
                                      </span>
                                    );
                                  }
                                  if (s === "quick_hangup") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                                        QUICK HANGUP
                                      </span>
                                    );
                                  }
                                  if (s === "dialing" || s === "connected") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
                                        {s === "dialing" ? "RINGING" : "IN CALL"}
                                      </span>
                                    );
                                  }
                                  if (s === "failed") {
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200" title={lead.error_message || ""}>
                                        FAILED
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                      {lead.status.toUpperCase()}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-700">
                                {lead.duration > 0 ? `${lead.duration}s` : "0s"}
                              </td>
                              <td className="py-2.5 px-3">
                                {lead.dtmf !== null && lead.dtmf !== undefined ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold font-mono text-xs">
                                    {lead.dtmf}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                                {lead.did_used ? `...${lead.did_used.slice(-4)}` : "—"}
                              </td>
                              <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                                {lead.call_time || "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteLead(lead.id, lead.phone_number)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                  title={`Remove ${lead.phone_number}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 pt-2">
                    <div>
                      Showing {(leadsPage - 1) * leadsPageSize + (leadsList.length > 0 ? 1 : 0)} to{" "}
                      {Math.min(leadsPage * leadsPageSize, leadsTotalCount)} of {leadsTotalCount} leads
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setLeadsPage(1)}
                        disabled={leadsPage <= 1}
                        className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setLeadsPage(p => Math.max(1, p - 1))}
                        disabled={leadsPage <= 1}
                        className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <span className="px-2 font-medium text-slate-700">
                        Page {leadsPage} of {leadsTotalPages}
                      </span>

                      <button
                        onClick={() => setLeadsPage(p => Math.min(leadsTotalPages, p + 1))}
                        disabled={leadsPage >= leadsTotalPages}
                        className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setLeadsPage(leadsTotalPages)}
                        disabled={leadsPage >= leadsTotalPages}
                        className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1 ml-2">
                        <input
                          type="number"
                          placeholder="Jump"
                          value={jumpPageInput}
                          onChange={(e) => setJumpPageInput(e.target.value)}
                          className="w-14 px-2 py-1 bg-white border border-slate-200 rounded text-center text-xs text-slate-800"
                        />
                        <button
                          onClick={() => {
                            const p = parseInt(jumpPageInput);
                            if (p >= 1 && p <= leadsTotalPages) setLeadsPage(p);
                            setJumpPageInput("");
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs text-slate-700 font-medium"
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 4: REPORTS & EXPORT */}
            {campaignTab === "reports" && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Campaign Reports & Data Export</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Download detailed call records with customer talk time, CDR call IDs, DTMF keypad responses, and delivery status.
                  </p>
                </div>

                {/* Filter Options */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">File Format</label>
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as "xlsx" | "csv")}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium"
                    >
                      <option value="xlsx">Excel Workbook (.xlsx)</option>
                      <option value="csv">Standard CSV (.csv)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Call Outcome Filter</label>
                    <select
                      value={exportStatus}
                      onChange={(e) => setExportStatus(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium"
                    >
                      <option value="all">All Call Records</option>
                      <option value="completed">Answered Only (Talk Time &gt; 0)</option>
                      <option value="missed">Missed Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">DTMF Keypad Response</label>
                    <select
                      value={exportDTMF}
                      onChange={(e) => setExportDTMF(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium"
                    >
                      <option value="all">All Responses (or No Key)</option>
                      <option value="1">Pressed 1</option>
                      <option value="2">Pressed 2</option>
                      <option value="3">Pressed 3</option>
                      <option value="0">Pressed 0</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Includes true talk duration, Smartflo call IDs, and carrier hangup reasons.
                  </div>

                  <button
                    onClick={handleExportDownload}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download {exportFormat.toUpperCase()} Report</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODAL 1: CREATE NEW CAMPAIGN                             */}
      {/* ======================================================== */}
      {isNewCampaignOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Create New Outbound Campaign</h3>
              <button
                onClick={() => setIsNewCampaignOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Campaign Name:</label>
                <input
                  type="text"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="e.g. Bengali Festive Promo"
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Trunk Channel Allocation:</label>
                  <span className="font-bold text-indigo-600">{newCampConcurrency} channels</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max={15}
                  value={newCampConcurrency}
                  onChange={(e) => setNewCampConcurrency(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <span className="text-[11px] text-slate-500">
                  {trunkStatus.available_channels} channels currently free on your 15-channel trunk.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Destination IVR Audio Flow:</label>
                <select
                  value={newCampIVRId}
                  onChange={(e) => {
                    const sel = availableIVRs.find(i => String(i.id) === e.target.value);
                    setNewCampIVRId(e.target.value);
                    if (sel) {
                      setNewCampIVRName(sel.name);
                      if (sel.default_api_key) setNewCampApiKey(sel.default_api_key);
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900"
                >
                  {availableIVRs.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (ID #{i.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Smartflo Support Routing Key (API Key):</label>
                  <span className="text-[10px] text-indigo-600 font-medium">Binds audio</span>
                </div>
                <input
                  type="text"
                  value={newCampApiKey}
                  onChange={(e) => setNewCampApiKey(e.target.value)}
                  placeholder="e.g. 865fac0f-bed8-491c-aa22-59c55c94d00c"
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-mono text-slate-900"
                />
                <span className="text-[11px] text-slate-500">
                  Click-to-Call Support API Key generated in Smartflo Portal for this IVR flow.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Caller ID (DID) Strategy:</label>
                <select
                  value={newCampDidMode}
                  onChange={(e) => setNewCampDidMode(e.target.value as "round_robin" | "single")}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900"
                >
                  <option value="round_robin">Round-Robin Rotation (across all 44 DIDs)</option>
                  <option value="single">Fixed Single DID Number</option>
                </select>
              </div>

              {newCampDidMode === "single" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Select Fixed Single DID:</label>
                    <span className="text-[10px] text-slate-500 font-medium">{allDIDs.length} DIDs Available</span>
                  </div>
                  <select
                    value={newCampSingleDid}
                    onChange={(e) => setNewCampSingleDid(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-mono text-slate-900"
                  >
                    {allDIDs.map((d, idx) => (
                      <option key={d} value={d}>+{d} (DID #{idx + 1})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inter-Call Pacing Delay (Seconds):</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={newCampDelay}
                  onChange={(e) => setNewCampDelay(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900"
                />
              </div>

              {/* Collapsible Deduplication & Cooldown Rules Card */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setIsDedupAccordionOpen(!isDedupAccordionOpen)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <div>
                      <span className="font-semibold text-slate-800">Deduplication & Cooldown Rules</span>
                      <p className="text-[11px] text-slate-500">Prevent lead fatigue, duplicate calls, and concurrent dialing</p>
                    </div>
                  </div>
                  {isDedupAccordionOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {isDedupAccordionOpen && (
                  <div className="p-3 border-t border-slate-200 bg-white space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCampDedupIntra}
                        onChange={(e) => setNewCampDedupIntra(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="font-medium text-slate-800">Intra-Campaign Deduplication</span>
                        <p className="text-[11px] text-slate-500">Exclude phone numbers already present in this campaign&apos;s lead list.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCampDedupCross}
                        onChange={(e) => setNewCampDedupCross(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="font-medium text-slate-800">Cross-Campaign Active Collision Guard</span>
                        <p className="text-[11px] text-slate-500">Exclude numbers currently queued or dialing in another active campaign.</p>
                      </div>
                    </label>

                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newCampEnableCooldown}
                          onChange={(e) => setNewCampEnableCooldown(e.target.checked)}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="font-medium text-slate-800">Smart Outcome-Aware Cooldown</span>
                          <p className="text-[11px] text-slate-500">Protect contacts from repetitive calls based on their last call outcome.</p>
                        </div>
                      </label>

                      {newCampEnableCooldown && (
                        <div className="grid grid-cols-2 gap-3 pl-6 pt-1">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">Answered Call Cooldown:</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                max="720"
                                value={newCampCooldownAnswered}
                                onChange={(e) => setNewCampCooldownAnswered(Math.max(1, Number(e.target.value)))}
                                className="w-20 bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-900 font-mono"
                              />
                              <span className="text-[11px] text-slate-500">hours (Default: 24h)</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">Missed / Busy Cooldown:</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max="168"
                                value={newCampCooldownMissed}
                                onChange={(e) => setNewCampCooldownMissed(Math.max(0, Number(e.target.value)))}
                                className="w-20 bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-900 font-mono"
                              />
                              <span className="text-[11px] text-slate-500">hours (Default: 2h)</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-100">
                      <input
                        type="checkbox"
                        checked={newCampExcludeDnd}
                        onChange={(e) => setNewCampExcludeDnd(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="font-medium text-slate-800">Exclude DND / Opt-Out Contacts</span>
                        <p className="text-[11px] text-slate-500">Skip contacts flagged as Do-Not-Disturb in the CRM directory.</p>
                      </div>
                    </label>

                    <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/80 mt-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newCampForceOverride}
                          onChange={(e) => setNewCampForceOverride(e.target.checked)}
                          className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                        />
                        <div>
                          <span className="font-bold text-amber-900 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-amber-600" />
                            Force Override Power Mode
                          </span>
                          <p className="text-[11px] text-amber-700">
                            Bypass ALL deduplication, collision, and cooldown rules. Force-add every lead regardless of prior calls.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Audience Segmentation & Live Check Count Filter Builder */}
              <AudienceFilterBuilder
                apiBase={API_BASE}
                onFilterChange={(rules, count) => {
                  setNewCampAudienceFilters(rules);
                  setNewCampAudienceCount(count);
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsNewCampaignOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={isLoading || !newCampName.trim()}
                className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-xs disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: AUDIO STUDIO & RECORDING UPLOAD                 */}
      {/* ======================================================== */}
      {isAudioModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xl max-w-xl w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Smartflo Audio Studio</h3>
                <p className="text-xs text-slate-500">Preview prompts and upload new audio files to Smartflo's CDN.</p>
              </div>
              <button onClick={() => setIsAudioModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            {/* Audio Upload Box */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-slate-900">Upload New Audio File (MP3/WAV)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Audio Name (e.g. Diwali Offer Prompt)"
                  value={uploadAudioName}
                  onChange={(e) => setUploadAudioName(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                />
                <input
                  type="file"
                  accept="audio/mp3, audio/wav, audio/mpeg"
                  onChange={(e) => setUploadAudioFile(e.target.files?.[0] || null)}
                  className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700"
                />
              </div>
              <button
                onClick={handleUploadAudio}
                disabled={isAudioUploading || !uploadAudioName.trim() || !uploadAudioFile}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg shadow-xs disabled:opacity-50"
              >
                {isAudioUploading ? "Uploading to Smartflo CDN..." : "Upload & Register Recording"}
              </button>
            </div>

            {/* Existing Audio Recordings List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <h4 className="text-xs font-bold text-slate-700 mb-2">Available Recordings on Account</h4>
              {availableRecordings.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{rec.name}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">ID: #{rec.id}</span>
                  </div>

                  {rec.url && (
                    <audio controls className="h-7 w-48">
                      <source src={rec.url} type="audio/mpeg" />
                    </audio>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: LEAD PROFILE & LIFETIME CALL TIMELINE DRAWER     */}
      {/* ======================================================== */}
      {isTimelineOpen && (
        <LeadTimelineDrawer
          contactId={selectedTimelineContact?.id || null}
          phoneNumber={selectedTimelineContact?.phone}
          apiBase={API_BASE}
          onClose={() => {
            setIsTimelineOpen(false);
            setSelectedTimelineContact(null);
          }}
          onLeadUpdated={() => {
            fetchCampaignsList();
            if (selectedCampaignId) fetchCampaignDetail(selectedCampaignId, false);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* MODAL 4: SUPERADMIN USER & TEAM MANAGEMENT MODAL         */}
      {/* ======================================================== */}
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        apiBase={API_BASE}
      />

      {/* ======================================================== */}
      {/* MODAL 5: CHANGE PASSWORD MODAL                           */}
      {/* ======================================================== */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        apiBase={API_BASE}
      />

      {/* ======================================================== */}
      {/* MODAL 6: INGESTION REPORT & DEDUPLICATION BREAKDOWN      */}
      {/* ======================================================== */}
      {isSummaryModalOpen && ingestionSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl max-w-lg w-full space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Lead Ingestion Report</h3>
                  <p className="text-[11px] text-slate-500">Deduplication & Cooldown breakdown</p>
                </div>
              </div>
              <button
                onClick={() => setIsSummaryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Evaluated</span>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">{ingestionSummary.total_candidates.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80">
                <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Enqueued</span>
                <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{ingestionSummary.enqueued_count.toLocaleString()}</p>
              </div>
              <div className={`p-3 rounded-xl border ${ingestionSummary.skipped_count > 0 ? "bg-amber-50 border-amber-200/80" : "bg-slate-50 border-slate-200/80"}`}>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${ingestionSummary.skipped_count > 0 ? "text-amber-700" : "text-slate-500"}`}>Skipped</span>
                <p className={`text-xl font-extrabold mt-0.5 ${ingestionSummary.skipped_count > 0 ? "text-amber-700" : "text-slate-600"}`}>{ingestionSummary.skipped_count.toLocaleString()}</p>
              </div>
            </div>

            {/* Reasons Breakdown */}
            {ingestionSummary.skipped_count > 0 && (
              <div className="space-y-2 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/70 text-xs">
                <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider block mb-1">
                  Why Were Leads Skipped?
                </span>
                <div className="space-y-1.5">
                  {(ingestionSummary.reasons.intra_campaign_duplicate ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60">
                      <span>Already in this campaign</span>
                      <span className="font-bold font-mono text-slate-900">{ingestionSummary.reasons.intra_campaign_duplicate}</span>
                    </div>
                  )}
                  {(ingestionSummary.reasons.cross_active_conflict ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60">
                      <span>Active in another running campaign</span>
                      <span className="font-bold font-mono text-amber-700">{ingestionSummary.reasons.cross_active_conflict}</span>
                    </div>
                  )}
                  {(ingestionSummary.reasons.cooldown_answered ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60">
                      <span>In Cooldown (Answered call &lt; 24h ago)</span>
                      <span className="font-bold font-mono text-indigo-700">{ingestionSummary.reasons.cooldown_answered}</span>
                    </div>
                  )}
                  {(ingestionSummary.reasons.cooldown_missed ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60">
                      <span>In Cooldown (Missed call &lt; 2h ago)</span>
                      <span className="font-bold font-mono text-purple-700">{ingestionSummary.reasons.cooldown_missed}</span>
                    </div>
                  )}
                  {(ingestionSummary.reasons.dnd_excluded ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60">
                      <span>DND / Opt-Out Contact</span>
                      <span className="font-bold font-mono text-rose-700">{ingestionSummary.reasons.dnd_excluded}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              {ingestionSummary.skipped_count > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadSkippedCSV}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Skipped (CSV)</span>
                  </button>

                  <button
                    onClick={handleForceEnqueueSkipped}
                    disabled={isForceEnqueuing}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-50"
                  >
                    {isForceEnqueuing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>Force Queue All Anyway</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsSummaryModalOpen(false)}
                className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Integrations Modal */}
      <WebhooksModal
        isOpen={isWebhooksModalOpen}
        onClose={() => setIsWebhooksModalOpen(false)}
        apiBase={API_BASE}
      />
    </div>
  );
}
