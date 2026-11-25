"use client";

import React, { useState, useEffect } from "react";
import {
  Webhook,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  X,
  RefreshCw,
  Send,
  Zap,
  Radio,
  FileCode,
  Copy,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Lock,
  Layers
} from "lucide-react";

export interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  description?: string;
  campaign_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  campaign_id?: string | null;
  event: string;
  url: string;
  request_payload: string;
  status: "success" | "failed" | "retrying";
  attempts: number;
  status_code?: number | null;
  latency_ms?: number | null;
  response_body?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  scope: "full" | "read_only" | "campaign_only";
  campaign_id?: string | null;
  is_active: boolean;
  last_used_at?: string | null;
  request_count: number;
  expires_at?: string | null;
  created_at: string;
}

export interface WebhookEventDef {
  event: string;
  category: string;
  description: string;
}

interface WebhooksAndApiPanelProps {
  apiBase: string;
  campaignId?: string | null;
  campaignName?: string | null;
  campaigns?: { id: string; name: string }[];
}

export default function WebhooksAndApiPanel({
  apiBase,
  campaignId = null,
  campaignName = null,
  campaigns = []
}: WebhooksAndApiPanelProps) {
  const [activeTab, setActiveTab] = useState<"webhooks" | "deliveries" | "keys" | "inbound">("webhooks");

  // Event Catalog
  const [eventCatalog, setEventCatalog] = useState<WebhookEventDef[]>([]);

  // Outbound Webhooks State
  const [subscriptions, setSubscriptions] = useState<WebhookSub[]>([]);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newScopeCampaignId, setNewScopeCampaignId] = useState<string>(campaignId || "");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["call.completed", "lead.dtmf_pressed"]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [testingSubId, setTestingSubId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    subId: string;
    success: boolean;
    latency_ms?: number;
    status_code?: number;
    error?: string;
  } | null>(null);

  // Delivery Logs State
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>("all");
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<"full" | "read_only" | "campaign_only">(
    campaignId ? "campaign_only" : "full"
  );
  const [newKeyCampaignId, setNewKeyCampaignId] = useState<string>(campaignId || "");
  const [newKeyExpiresDays, setNewKeyExpiresDays] = useState<string>("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [revealedRawKey, setRevealedRawKey] = useState<string | null>(null);

  // Copy states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    setNewScopeCampaignId(campaignId || "");
    if (campaignId) {
      setNewKeyScope("campaign_only");
      setNewKeyCampaignId(campaignId);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchEventsCatalog();
    fetchSubscriptions();
    fetchDeliveries();
    fetchApiKeys();
  }, [campaignId]);

  const fetchEventsCatalog = async () => {
    try {
      const res = await fetch(`${apiBase}/webhooks/events`);
      if (res.ok) {
        const data = await res.json();
        setEventCatalog(data.events || []);
      }
    } catch {}
  };

  const fetchSubscriptions = async () => {
    setIsLoadingSubs(true);
    try {
      const q = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : "";
      const res = await fetch(`${apiBase}/webhooks/subscriptions${q}`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch {} finally {
      setIsLoadingSubs(false);
    }
  };

  const fetchDeliveries = async (statusOverride?: string) => {
    setIsLoadingDeliveries(true);
    try {
      const params = new URLSearchParams({ limit: "60" });
      if (campaignId) params.set("campaign_id", campaignId);
      const st = statusOverride !== undefined ? statusOverride : deliveryStatusFilter;
      if (st && st !== "all") params.set("status", st);
      const res = await fetch(`${apiBase}/webhooks/deliveries?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    } catch {} finally {
      setIsLoadingDeliveries(false);
    }
  };

  const fetchApiKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const res = await fetch(`${apiBase}/keys`);
      if (res.ok) {
        const data = await res.json();
        const all: ApiKeyItem[] = data.keys || [];
        setApiKeys(campaignId ? all.filter((k) => !k.campaign_id || k.campaign_id === campaignId) : all);
      }
    } catch {} finally {
      setIsLoadingKeys(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!newUrl.trim() || (!newUrl.startsWith("http://") && !newUrl.startsWith("https://"))) {
      showToast("Please enter a valid URL (http:// or https://)", "error");
      return;
    }
    setIsRegistering(true);
    try {
      const targetCid = campaignId || (newScopeCampaignId.trim() || null);
      const res = await fetch(`${apiBase}/webhooks/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: selectedEvents.length > 0 ? selectedEvents : ["*"],
          secret: newSecret.trim() || null,
          description: newDescription.trim() || null,
          campaign_id: targetCid
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Webhook subscription registered!");
        setNewUrl("");
        setNewDescription("");
        setNewSecret("");
        fetchSubscriptions();
      } else {
        showToast(data.detail || "Failed to register webhook", "error");
      }
    } catch (e: any) {
      showToast(`Error: ${e?.message}`, "error");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleToggleSub = async (subId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${apiBase}/webhooks/subscriptions/${subId}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive })
      });
      if (res.ok) {
        showToast(currentActive ? "Webhook paused" : "Webhook activated");
        fetchSubscriptions();
      }
    } catch {}
  };

  const handleDeleteSub = async (subId: string) => {
    if (!confirm("Permanently remove this webhook subscription?")) return;
    try {
      const res = await fetch(`${apiBase}/webhooks/subscriptions/${subId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Webhook deleted");
        fetchSubscriptions();
      }
    } catch {}
  };

  const handleTestSub = async (sub: WebhookSub) => {
    setTestingSubId(sub.id);
    setTestResult(null);
    try {
      const res = await fetch(`${apiBase}/webhooks/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sub.url,
          event: sub.events[0] === "*" ? "call.completed" : sub.events[0] || "call.completed",
          secret: sub.secret || null,
          campaign_id: sub.campaign_id || campaignId || null
        })
      });
      const data = await res.json();
      setTestResult({
        subId: sub.id,
        success: data.success,
        latency_ms: data.latency_ms,
        status_code: data.status_code,
        error: data.error
      });
    } catch (e: any) {
      setTestResult({ subId: sub.id, success: false, error: e?.message || "Network error" });
    } finally {
      setTestingSubId(null);
    }
  };

  const handleReplayDelivery = async (deliveryId: string) => {
    setReplayingId(deliveryId);
    try {
      const res = await fetch(`${apiBase}/webhooks/deliveries/${deliveryId}/replay`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Replayed successfully (HTTP ${data.status_code}, ${data.latency_ms}ms)`);
      } else {
        showToast(data.error || `Replay failed (HTTP ${data.status_code || "err"})`, "error");
      }
      fetchDeliveries();
    } catch (e: any) {
      showToast(`Replay error: ${e?.message}`, "error");
    } finally {
      setReplayingId(null);
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) {
      showToast("Enter a name for the API key", "error");
      return;
    }
    const targetCid = newKeyScope === "campaign_only" ? (campaignId || newKeyCampaignId) : null;
    if (newKeyScope === "campaign_only" && !targetCid) {
      showToast("Select a campaign for campaign-scoped key", "error");
      return;
    }
    setIsCreatingKey(true);
    try {
      const res = await fetch(`${apiBase}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scope: newKeyScope,
          campaign_id: targetCid,
          expires_days: newKeyExpiresDays ? Number(newKeyExpiresDays) : null
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRevealedRawKey(data.api_key?.raw_key || null);
        setNewKeyName("");
        setNewKeyExpiresDays("");
        showToast("API key generated! Copy it now — it won't be shown again.");
        fetchApiKeys();
      } else {
        showToast(data.detail || "Failed to create API key", "error");
      }
    } catch (e: any) {
      showToast(`Error: ${e?.message}`, "error");
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleToggleApiKey = async (keyId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${apiBase}/keys/${keyId}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive })
      });
      if (res.ok) {
        showToast(currentActive ? "API key disabled" : "API key enabled");
        fetchApiKeys();
      }
    } catch {}
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm("Revoke and permanently delete this API key? Any external app using it will stop working.")) return;
    try {
      const res = await fetch(`${apiBase}/keys/${keyId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("API key revoked");
        fetchApiKeys();
      }
    } catch {}
  };

  const toggleEvent = (ev: string) => {
    if (ev === "*") {
      setSelectedEvents(selectedEvents.includes("*") ? [] : ["*"]);
      return;
    }
    const withoutWildcard = selectedEvents.filter((x) => x !== "*");
    if (withoutWildcard.includes(ev)) {
      setSelectedEvents(withoutWildcard.filter((x) => x !== ev));
    } else {
      setSelectedEvents([...withoutWildcard, ev]);
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const categories = Array.from(new Set(eventCatalog.map((e) => e.category)));
  const inboundCampId = campaignId || campaigns[0]?.id || "YOUR_CAMPAIGN_ID";
  const smartfloInboundUrl = `${apiBase}/webhooks/smartflo`;
  const pushLeadUrl = `${apiBase}/inbound/campaigns/${inboundCampId}/push-lead`;
  const bulkPushUrl = `${apiBase}/inbound/campaigns/${inboundCampId}/push-leads-bulk`;
  const callNowUrl = `${apiBase}/inbound/call-now`;

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`px-4 py-2.5 rounded-xl shadow-md text-xs font-semibold text-white flex items-center gap-2 ${
            toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
          }`}
        >
          {toast.type === "error" ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("webhooks")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "webhooks"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Outbound Webhooks ({subscriptions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("deliveries");
              fetchDeliveries();
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "deliveries"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Delivery Logs & Replay ({deliveries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("keys");
              fetchApiKeys();
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "keys"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>API Keys ({apiKeys.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("inbound")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === "inbound"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Inbound Triggers & API Docs</span>
          </button>
        </div>

        <a
          href={apiBase.replace("/api", "/docs")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
        >
          <FileCode className="w-3.5 h-3.5 text-indigo-600" />
          <span>Swagger / OpenAPI</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </a>
      </div>

      {/* ================================================================ */}
      {/* TAB 1: OUTBOUND WEBHOOKS                                         */}
      {/* ================================================================ */}
      {activeTab === "webhooks" && (
        <div className="space-y-5">
          {/* Register New Webhook Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>
                  {campaignName
                    ? `Add Webhook for "${campaignName}"`
                    : "Register Outbound Webhook Subscription"}
                </span>
              </h4>
              <span className="text-[11px] text-slate-500">
                Includes 3x auto-retries & full CRM datapoints
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Target Endpoint URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/... or https://your-crm.com/webhook"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Description / Integration Name
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g. Admissions CRM Sync, Slack Alerts"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  HMAC-SHA256 Signing Secret (Optional)
                </label>
                <input
                  type="text"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  placeholder="Leave blank or enter secret for X-Smartflo-Signature"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              {!campaignId && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Campaign Scope
                  </label>
                  <select
                    value={newScopeCampaignId}
                    onChange={(e) => setNewScopeCampaignId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-700"
                  >
                    <option value="">Global (All Campaigns & Platform Events)</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        Campaign Only: {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Event Selector */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-700">
                  Subscribed Events
                </label>
                <button
                  type="button"
                  onClick={() => toggleEvent("*")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                    selectedEvents.includes("*")
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {selectedEvents.includes("*") ? "✓ All Platform Events (*)" : "Select All Events (*)"}
                </button>
              </div>

              {!selectedEvents.includes("*") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {categories.map((cat) => (
                    <div key={cat} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {cat}
                      </span>
                      {eventCatalog
                        .filter((e) => e.category === cat)
                        .map((ev) => {
                          const checked = selectedEvents.includes(ev.event);
                          return (
                            <label
                              key={ev.event}
                              className="flex items-start gap-2 cursor-pointer text-xs hover:bg-slate-50 p-1 rounded"
                              title={ev.description}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEvent(ev.event)}
                                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div>
                                <span className="font-mono font-semibold text-slate-800 block leading-tight">
                                  {ev.event}
                                </span>
                                <span className="text-[10px] text-slate-400 leading-tight block">
                                  {ev.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleRegisterWebhook}
                disabled={isRegistering}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isRegistering ? "Registering..." : "Register Webhook"}</span>
              </button>
            </div>
          </div>

          {/* Registered Subscriptions List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900">
                Active & Paused Endpoints ({subscriptions.length})
              </h4>
              <button
                type="button"
                onClick={fetchSubscriptions}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingSubs ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="text-center py-8 border border-slate-200 border-dashed rounded-xl bg-slate-50/50 text-xs text-slate-500">
                No webhooks registered {campaignName ? `for "${campaignName}"` : "yet"}. Add one above to start streaming real-time events.
              </div>
            ) : (
              <div className="space-y-2">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className={`border rounded-xl p-3.5 transition-colors ${
                      sub.is_active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-75"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sub.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {sub.is_active ? "ACTIVE" : "PAUSED"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sub.campaign_id
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {sub.campaign_id ? `Campaign: ${sub.campaign_id}` : "GLOBAL"}
                          </span>
                          {sub.secret && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <ShieldCheck className="w-3 h-3" />
                              HMAC Signed
                            </span>
                          )}
                          {sub.description && (
                            <span className="text-xs font-bold text-slate-800">{sub.description}</span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-600 truncate">{sub.url}</p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {sub.events.map((ev) => (
                            <span
                              key={ev}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-medium"
                            >
                              {ev === "*" ? "ALL EVENTS (*)" : ev}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTestSub(sub)}
                          disabled={testingSubId === sub.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          <span>{testingSubId === sub.id ? "Testing..." : "Test"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSub(sub.id, sub.is_active)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                        >
                          {sub.is_active ? "Pause" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSub(sub.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete webhook"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {testResult && testResult.subId === sub.id && (
                      <div
                        className={`mt-2.5 px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                          testResult.success
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                            : "bg-rose-50 border border-rose-200 text-rose-800"
                        }`}
                      >
                        <span className="font-semibold">
                          {testResult.success
                            ? `✓ Test delivered! HTTP ${testResult.status_code} (${testResult.latency_ms}ms)`
                            : `✗ Test failed: ${testResult.error || `HTTP ${testResult.status_code}`}`}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: DELIVERY LOGS & ONE-CLICK REPLAY                          */}
      {/* ================================================================ */}
      {activeTab === "deliveries" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Recent Webhook Deliveries</span>
              <select
                value={deliveryStatusFilter}
                onChange={(e) => {
                  setDeliveryStatusFilter(e.target.value);
                  fetchDeliveries(e.target.value);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success (2xx)</option>
                <option value="failed">Failed</option>
                <option value="retrying">Retrying</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => fetchDeliveries()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingDeliveries ? "animate-spin" : ""}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-center py-10 border border-slate-200 border-dashed rounded-xl bg-slate-50/50 text-xs text-slate-500">
              No webhook deliveries recorded yet. Events dispatched to active endpoints will appear here with full payloads and replay controls.
            </div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {deliveries.map((dlv) => {
                const isExpanded = expandedDeliveryId === dlv.id;
                return (
                  <div key={dlv.id} className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            dlv.status === "success"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : dlv.status === "failed"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {dlv.status} {dlv.status_code ? `(${dlv.status_code})` : ""}
                        </span>
                        <span className="font-mono font-bold text-slate-800">{dlv.event}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 font-mono truncate max-w-[220px]">{dlv.url}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400">
                          {dlv.attempts}/3 tries {dlv.latency_ms ? `· ${dlv.latency_ms}ms` : ""} · {dlv.created_at}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleReplayDelivery(dlv.id)}
                          disabled={replayingId === dlv.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px]"
                        >
                          <RotateCcw className={`w-3 h-3 ${replayingId === dlv.id ? "animate-spin" : ""}`} />
                          <span>Replay</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedDeliveryId(isExpanded ? null : dlv.id)}
                          className="p-1 text-slate-400 hover:text-slate-700"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {dlv.error_message && (
                      <div className="text-[11px] text-rose-600 font-medium">Error: {dlv.error_message}</div>
                    )}

                    {isExpanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Request Payload
                          </span>
                          <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-lg text-[10px] font-mono overflow-x-auto max-h-48">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(dlv.request_payload), null, 2);
                              } catch {
                                return dlv.request_payload;
                              }
                            })()}
                          </pre>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Target Response
                          </span>
                          <pre className="bg-slate-100 text-slate-800 p-2.5 rounded-lg text-[10px] font-mono overflow-x-auto max-h-48">
                            {dlv.response_body || "(no response body)"}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 3: SCOPED EXTERNAL API KEYS                                  */}
      {/* ================================================================ */}
      {activeTab === "keys" && (
        <div className="space-y-4">
          {revealedRawKey && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  New API Key Generated — Copy It Now!
                </span>
                <button
                  type="button"
                  onClick={() => setRevealedRawKey(null)}
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-emerald-800">
                For security, this secret key will not be shown again. Pass it via <code className="font-mono font-bold">X-API-Key</code> header or <code className="font-mono font-bold">?api_key=</code>.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-emerald-200 px-3 py-2 rounded-lg text-xs font-mono font-bold text-slate-900 select-all">
                  {revealedRawKey}
                </code>
                <button
                  type="button"
                  onClick={() => copyText("raw_key", revealedRawKey)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  {copiedId === "raw_key" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === "raw_key" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Create API Key Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Generate Scoped API Key</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Zapier Lead Sync"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Access Scope</label>
                <select
                  value={newKeyScope}
                  onChange={(e) => setNewKeyScope(e.target.value as any)}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  <option value="full">Global Full Access</option>
                  <option value="read_only">Read-Only (GET Reports/Data)</option>
                  <option value="campaign_only">Campaign-Specific Only</option>
                </select>
              </div>
              {newKeyScope === "campaign_only" && !campaignId && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Target Campaign</label>
                  <select
                    value={newKeyCampaignId}
                    onChange={(e) => setNewKeyCampaignId(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="">Select campaign...</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Expires In (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={newKeyExpiresDays}
                  onChange={(e) => setNewKeyExpiresDays(e.target.value)}
                  placeholder="Never (blank)"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateApiKey}
                disabled={isCreatingKey}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isCreatingKey ? "Generating..." : "Create API Key"}</span>
              </button>
            </div>
          </div>

          {/* Existing API Keys */}
          <div className="space-y-2">
            {apiKeys.length === 0 ? (
              <div className="text-center py-8 border border-slate-200 border-dashed rounded-xl text-xs text-slate-500">
                No external API keys created yet. Generate one above for Zapier, n8n, or custom CRM integrations.
              </div>
            ) : (
              apiKeys.map((k) => (
                <div
                  key={k.id}
                  className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{k.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          k.scope === "full"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : k.scope === "read_only"
                            ? "bg-sky-50 text-sky-700 border border-sky-200"
                            : "bg-purple-50 text-purple-700 border border-purple-200"
                        }`}
                      >
                        {k.scope.replace("_", " ")}
                      </span>
                      {k.campaign_id && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {k.campaign_id}
                        </span>
                      )}
                      {!k.is_active && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">
                          DISABLED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono flex flex-wrap gap-3">
                      <span>{k.key_prefix}</span>
                      <span>Requests: {k.request_count}</span>
                      <span>Last used: {k.last_used_at || "Never"}</span>
                      {k.expires_at && <span>Expires: {k.expires_at}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleApiKey(k.id, k.is_active)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
                    >
                      {k.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteApiKey(k.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 4: INBOUND AUTOMATION TRIGGERS & API SNIPPETS                */}
      {/* ================================================================ */}
      {activeTab === "inbound" && (
        <div className="space-y-4 text-xs">
          {/* 1. Push Lead into Campaign */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>1. Inbound Trigger: Push Lead to Campaign (Zapier / n8n / Google Forms / CRM)</span>
              </span>
              <button
                type="button"
                onClick={() => copyText("push_url", pushLeadUrl)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                {copiedId === "push_url" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>Copy URL</span>
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-[11px] text-indigo-700 break-all">
              POST {pushLeadUrl}
            </div>
            <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
{`curl -X POST "${pushLeadUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sf_live_YOUR_KEY" \\
  -d '{
    "phone_number": "919876543210",
    "name": "Rahul Sharma",
    "school": "Delhi Public School",
    "year": "2027",
    "trigger_call_immediately": true
  }'`}
            </pre>
          </div>

          {/* 2. Bulk Push Leads */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>2. Bulk Push Leads (Up to 5,000 leads per request)</span>
              </span>
              <button
                type="button"
                onClick={() => copyText("bulk_url", bulkPushUrl)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                {copiedId === "bulk_url" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>Copy URL</span>
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-[11px] text-indigo-700 break-all">
              POST {bulkPushUrl}
            </div>
          </div>

          {/* 3. Instant 1-to-1 Call Now */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-600" />
                <span>3. Instant 1-to-1 Outbound Call Trigger</span>
              </span>
              <button
                type="button"
                onClick={() => copyText("call_url", callNowUrl)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                {copiedId === "call_url" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>Copy URL</span>
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-[11px] text-indigo-700 break-all">
              POST {callNowUrl}
            </div>
            <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
{`{
  "phone_number": "919876543210",
  "name": "Rahul Sharma",
  "campaign_id": "${inboundCampId}",
  "attributes": { "year": "2027", "city": "Delhi" }
}`}
            </pre>
          </div>

          {/* 4. Smartflo Inbound Callback URL */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">4. Tata Smartflo Inbound CDR / DTMF Webhook URL</span>
              <button
                type="button"
                onClick={() => copyText("smartflo_url", smartfloInboundUrl)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                {copiedId === "smartflo_url" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>Copy URL</span>
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-700 break-all">
              POST {smartfloInboundUrl}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
