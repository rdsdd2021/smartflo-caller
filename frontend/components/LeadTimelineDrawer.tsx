"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Phone,
  PhoneCall,
  Clock,
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Volume2,
  Calendar,
  Layers,
  Edit2,
  Save,
  User,
  Tag,
  Hash,
  ChevronRight
} from "lucide-react";

interface LeadTimelineDrawerProps {
  contactId: string | null;
  phoneNumber?: string;
  apiBase: string;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

export default function LeadTimelineDrawer({
  contactId,
  phoneNumber,
  apiBase,
  onClose,
  onLeadUpdated
}: LeadTimelineDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<{ field_key: string; label: string; field_type?: string }[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAttributes, setEditAttributes] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!contactId && !phoneNumber) return;
    fetchTimeline();
  }, [contactId, phoneNumber]);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const idToFetch = encodeURIComponent(contactId || phoneNumber || "");
      const phoneParam = phoneNumber ? `?phone=${encodeURIComponent(phoneNumber)}` : "";
      const res = await fetch(`${apiBase}/contacts/${idToFetch}/timeline${phoneParam}`);
      if (res.ok) {
        const data = await res.json();
        setContact(data.contact);
        setTimeline(data.timeline || []);
        const cf = Array.isArray(data.custom_fields) ? data.custom_fields : [];
        setCustomFields(cf);
        if (data.contact) {
          setEditName(data.contact.name || "");
          const mergedAttrs: Record<string, string> = {};
          cf.forEach((f: any) => {
            mergedAttrs[f.field_key] = "";
          });
          Object.entries(data.contact.attributes || {}).forEach(([k, v]) => {
            mergedAttrs[k] = v !== null && v !== undefined ? String(v) : "";
          });
          setEditAttributes(mergedAttrs);
        }
      }
    } catch (e) {
      console.error("Error fetching timeline:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveContact = async () => {
    if (!contact?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase}/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          attributes: editAttributes
        })
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        setIsEditing(false);
        fetchTimeline();
        if (onLeadUpdated) onLeadUpdated();
      }
    } catch (e) {
      console.error("Error updating contact:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "answered" || s === "completed") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Answered
        </span>
      );
    }
    if (s === "no_answer") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          No Answer (Rang 30s)
        </span>
      );
    }
    if (s === "busy") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
          <Phone className="w-3 h-3 text-orange-600" />
          Line Busy
        </span>
      );
    }
    if (s === "rejected") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <XCircle className="w-3 h-3 text-purple-600" />
          Declined
        </span>
      );
    }
    if (s === "quick_hangup") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <Clock className="w-3 h-3 text-sky-600" />
          Quick Hangup (&lt;3s)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        {status.toUpperCase()}
      </span>
    );
  };

  if (!contactId && !phoneNumber) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {contact?.name || editName || "Contact Profile"}
                </h2>
                {saveSuccess && (
                  <span className="text-xs text-emerald-600 font-medium">Saved!</span>
                )}
              </div>
              <p className="text-xs font-mono font-medium text-slate-500">
                {contact?.phone_number || phoneNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Info</span>
              </button>
            ) : (
              <button
                onClick={handleSaveContact}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-xs transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-28 bg-slate-100 rounded-xl"></div>
              <div className="h-40 bg-slate-100 rounded-xl"></div>
            </div>
          ) : (
            <>
              {/* Card 1: Dynamic Attributes / Custom Datapoints */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    Contact Attributes & Information
                  </span>
                  <span className="text-[11px] text-slate-400">Custom Datapoints</span>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-600 block mb-1">Full Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {Object.entries(editAttributes).map(([key, val]) => (
                        <div key={key}>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                            {key.replace(/_/g, " ")}
                          </label>
                          <input
                            type="text"
                            value={val || ""}
                            onChange={(e) =>
                              setEditAttributes({ ...editAttributes, [key]: e.target.value })
                            }
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block">Name</span>
                      <p className="text-xs font-medium text-slate-900 mt-0.5">{contact?.name || "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block">Total Calls</span>
                      <p className="text-xs font-semibold text-indigo-600 mt-0.5">
                        {timeline.length} call attempt{timeline.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {(() => {
                      const attrs = contact?.attributes || {};
                      const renderedKeys = new Set<string>();
                      const items: { key: string; label: string; value: any }[] = [];

                      customFields.forEach((f) => {
                        renderedKeys.add(f.field_key);
                        items.push({
                          key: f.field_key,
                          label: f.label,
                          value: attrs[f.field_key]
                        });
                      });

                      Object.entries(attrs).forEach(([k, v]) => {
                        if (!renderedKeys.has(k)) {
                          items.push({
                            key: k,
                            label: k.replace(/_/g, " "),
                            value: v
                          });
                        }
                      });

                      return items.map((item) => (
                        <div key={item.key}>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                            {item.label}
                          </span>
                          <p className="text-xs font-medium text-slate-800 mt-0.5 break-words">
                            {item.value !== null && item.value !== undefined && String(item.value).trim()
                              ? String(item.value)
                              : "—"}
                          </p>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Card 2: Interactive Lifetime Call Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Campaign Call History Journey ({timeline.length})
                  </h3>
                  <span className="text-xs text-slate-400">Chronological activity</span>
                </div>

                {timeline.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
                    <PhoneCall className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-600">No calls recorded yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      When this contact is dialed in any campaign, call attempts and DTMF outcomes appear here.
                    </p>
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {timeline.map((entry, idx) => (
                      <div
                        key={entry.id || idx}
                        className="relative bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow"
                      >
                        {/* Dot indicator */}
                        <div
                          className={`absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                            entry.status === "answered" || entry.status === "completed"
                              ? "bg-emerald-500"
                              : entry.status === "no_answer"
                              ? "bg-amber-400"
                              : entry.status === "busy"
                              ? "bg-orange-400"
                              : "bg-slate-400"
                          }`}
                        />

                        {/* Timeline Item Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="text-xs font-bold text-slate-900">
                                {entry.campaign_name || `Campaign #${entry.campaign_id?.slice(-6)}`}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 mt-0.5 block">
                              {entry.call_time || "Recorded call"}
                            </span>
                          </div>

                          {getStatusBadge(entry.status)}
                        </div>

                        {/* Call Metrics Pill Grid */}
                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">TALK TIME</span>
                            <span className="font-semibold text-slate-700">
                              {entry.duration > 0 ? `${entry.duration}s` : "0s"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">DTMF INPUT</span>
                            {entry.dtmf ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold font-mono text-xs">
                                {entry.dtmf}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-medium">None</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">CALLER DID</span>
                            <span className="font-mono text-slate-600 text-[11px]">
                              {entry.caller_did ? `...${entry.caller_did.slice(-4)}` : "Default"}
                            </span>
                          </div>
                        </div>

                        {/* Optional Recording Player */}
                        {entry.recording_url && (
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
                            <Volume2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <audio controls className="w-full h-7 text-xs">
                              <source src={entry.recording_url} type="audio/mpeg" />
                            </audio>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
