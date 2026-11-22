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
  Check
} from "lucide-react";

interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
}

export default function WebhooksModal({ isOpen, onClose, apiBase }: WebhooksModalProps) {
  const [subscriptions, setSubscriptions] = useState<WebhookSub[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["call.completed", "lead.dtmf_pressed"]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Test Webhook State
  const [testingSubId, setTestingSubId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    subId: string;
    success: boolean;
    latency_ms?: number;
    status_code?: number;
    error?: string;
  } | null>(null);

  // Notification Toast
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (isOpen) {
      fetchSubscriptions();
    }
  }, [isOpen]);

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBase}/webhooks/subscriptions`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!newUrl.trim() || (!newUrl.startsWith("http://") && !newUrl.startsWith("https://"))) {
      showToast("Please enter a valid URL (http:// or https://)", "error");
      return;
    }
    setIsRegistering(true);
    try {
      const res = await fetch(`${apiBase}/webhooks/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: selectedEvents.length > 0 ? selectedEvents : ["*"],
          secret: newSecret.trim() || null,
          description: newDescription.trim() || null
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Webhook endpoint registered successfully!");
        setNewUrl("");
        setNewDescription("");
        setNewSecret("");
        setSelectedEvents(["call.completed", "lead.dtmf_pressed"]);
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

  const handleDeleteSubscription = async (id: string) => {
    if (!confirm("Are you sure you want to remove this webhook subscription?")) return;
    try {
      const res = await fetch(`${apiBase}/webhooks/subscriptions/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Webhook subscription deleted");
        fetchSubscriptions();
      }
    } catch {}
  };

  const handleToggleSubscription = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${apiBase}/webhooks/subscriptions/${id}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive })
      });
      if (res.ok) {
        fetchSubscriptions();
      }
    } catch {}
  };

  const handleTestWebhook = async (sub: WebhookSub) => {
    setTestingSubId(sub.id);
    setTestResult(null);
    try {
      const res = await fetch(`${apiBase}/webhooks/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sub.url,
          event: sub.events[0] || "call.completed",
          secret: sub.secret || null
        })
      });
      const data = await res.json();
      setTestResult({
        subId: sub.id,
        success: Boolean(data.success),
        latency_ms: data.latency_ms,
        status_code: data.status_code,
        error: data.error
      });
    } catch (e: any) {
      setTestResult({
        subId: sub.id,
        success: false,
        error: e?.message
      });
    } finally {
      setTestingSubId(null);
    }
  };

  const toggleEventChoice = (ev: string) => {
    if (selectedEvents.includes(ev)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== ev));
    } else {
      setSelectedEvents([...selectedEvents, ev]);
    }
  };

  if (!isOpen) return null;

  const docsUrl = apiBase.replace("/api", "/docs");
  const inboundWebhookUrl = `${apiBase}/webhooks/smartflo`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Webhook className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Webhook Integrations &amp; API</h3>
              <p className="text-xs text-slate-500">
                Receive signed HMAC-SHA256 call events in external CRMs or configure Tata Smartflo callbacks.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-5 overflow-y-auto pr-1 flex-1 text-xs">
          {/* Quick Links Banner: Swagger Docs & Inbound URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Interactive Swagger UI Box */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
              <div>
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Interactive Swagger UI</span>
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Explore and test all 30+ endpoints live in your browser with JWT authentication.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors shadow-2xs"
                >
                  <span>Open Swagger /docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={apiBase.replace("/api", "/redoc")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium transition-colors shadow-2xs"
                >
                  <span>ReDoc</span>
                </a>
              </div>
            </div>

            {/* Inbound Tata Smartflo Webhook URL Box */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
              <div>
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Inbound Smartflo Callback</span>
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Configure this receiver in your Tata Smartflo portal for real-time CDR and DTMF events:
                </p>
              </div>
              <div className="flex items-center gap-1 mt-2 bg-white border border-slate-200 rounded px-2 py-1">
                <code className="text-[10px] text-slate-700 font-mono flex-1 truncate">{inboundWebhookUrl}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inboundWebhookUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700"
                  title="Copy URL"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>

          {/* Register New Outbound Webhook Form */}
          <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-3">
            <span className="font-bold text-slate-900 block">Register Outbound Webhook Subscription</span>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Destination Endpoint URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://your-crm.com/api/webhooks/smartflo or https://webhook.site/..."
                  className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Secret Key for HMAC-SHA256 (Optional)
                  </label>
                  <input
                    type="text"
                    value={newSecret}
                    onChange={(e) => setNewSecret(e.target.value)}
                    placeholder="e.g. whsec_a83f982..."
                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g. HubSpot CRM Sync"
                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Event Subscriptions Checkboxes */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                  Subscribed Event Types
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "call.completed", label: "call.completed" },
                    { id: "lead.dtmf_pressed", label: "lead.dtmf_pressed" },
                    { id: "smartflo.callback", label: "smartflo.callback" },
                    { id: "*", label: "* (All Events)" }
                  ].map((ev) => (
                    <label
                      key={ev.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                        selectedEvents.includes(ev.id)
                          ? "bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev.id)}
                        onChange={() => toggleEventChoice(ev.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                      />
                      <span className="font-mono text-[11px]">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleRegisterWebhook}
                disabled={isRegistering || !newUrl.trim()}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {isRegistering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Add Webhook Endpoint</span>
              </button>
            </div>
          </div>

          {/* Active Webhook Subscriptions List */}
          <div className="space-y-2">
            <span className="font-bold text-slate-900 block">
              Registered Webhook Endpoints ({subscriptions.length})
            </span>

            {isLoading ? (
              <div className="p-6 text-center text-slate-400">Loading webhooks...</div>
            ) : subscriptions.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-200 border-dashed text-center text-slate-400">
                <Webhook className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                <p className="font-medium text-slate-700">No outbound webhooks registered</p>
                <p className="text-[11px] mt-0.5">Add an endpoint above to stream real-time call results to your server.</p>
              </div>
            ) : (
              subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900 truncate" title={sub.url}>
                          {sub.url}
                        </span>
                        {sub.secret && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-medium">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>HMAC Signed</span>
                          </span>
                        )}
                      </div>
                      {sub.description && <p className="text-slate-500 text-[11px] mt-0.5">{sub.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {sub.events.map((ev) => (
                          <span key={ev} className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-mono">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Test Webhook Button */}
                      <button
                        type="button"
                        onClick={() => handleTestWebhook(sub)}
                        disabled={testingSubId === sub.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] shadow-2xs transition-colors"
                        title="Send sample test payload"
                      >
                        {testingSubId === sub.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                        ) : (
                          <Send className="w-3 h-3 text-slate-500" />
                        )}
                        <span>Test</span>
                      </button>

                      {/* Active Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleSubscription(sub.id, sub.is_active)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                          sub.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-400 border-slate-200"
                        }`}
                      >
                        {sub.is_active ? "Active" : "Disabled"}
                      </button>

                      {/* Delete Subscription */}
                      <button
                        type="button"
                        onClick={() => handleDeleteSubscription(sub.id)}
                        className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        title="Delete webhook"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Test Result Banner */}
                  {testResult && testResult.subId === sub.id && (
                    <div
                      className={`p-2 rounded-lg text-[11px] flex items-center justify-between border ${
                        testResult.success
                          ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                          : "bg-rose-50 text-rose-900 border-rose-200"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {testResult.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <span className="truncate">
                          {testResult.success
                            ? `Delivered! HTTP ${testResult.status_code} (${testResult.latency_ms}ms latency)`
                            : `Delivery failed: ${testResult.error || `HTTP ${testResult.status_code}`}`}
                        </span>
                      </div>
                      <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-600 ml-2">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400 text-[11px]">
            Outgoing requests include <code className="text-slate-600 font-mono">X-Smartflo-Signature</code> header.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
