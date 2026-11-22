"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Search,
  Upload,
  Plus,
  Settings,
  Filter,
  CheckCircle2,
  Clock,
  Phone,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Database,
  Tag,
  Radio,
  FileSpreadsheet,
  X,
  RefreshCw,
  Sparkles
} from "lucide-react";

interface ContactItem {
  id: string;
  phone_number: string;
  name: string;
  attributes: Record<string, any>;
  total_calls_count: number;
  last_call_status?: string;
  last_call_time?: string;
  last_dtmf?: string;
  created_at: string;
}

interface CustomFieldMeta {
  id?: string;
  field_key: string;
  label: string;
  field_type: string;
  options?: string[];
  is_filter_enabled?: boolean;
}

interface ContactsCRMProps {
  apiBase: string;
  onSelectLead: (contactId: string, phone: string) => void;
}

export default function ContactsCRM({ apiBase, onSelectLead }: ContactsCRMProps) {
  // Contacts Table State
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Custom Datapoints Schema
  const [fields, setFields] = useState<CustomFieldMeta[]>([]);
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFields();
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [page, pageSize, search]);

  const fetchFields = async () => {
    try {
      const res = await fetch(`${apiBase}/contacts/fields`);
      if (res.ok) {
        const data = await res.json();
        setFields(data.fields || []);
      }
    } catch {}
  };

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        search: search.trim()
      });
      const res = await fetch(`${apiBase}/contacts?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.items || []);
        setTotalCount(data.total_count ?? 0);
        setTotalPages(data.total_pages ?? 1);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const handleCreateField = async () => {
    if (!newFieldLabel.trim()) return;
    try {
      const optionsArray = newFieldOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${apiBase}/contacts/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newFieldLabel.trim(),
          field_type: newFieldType,
          options: optionsArray
        })
      });
      if (res.ok) {
        setNewFieldLabel("");
        setNewFieldOptions("");
        fetchFields();
      }
    } catch {}
  };

  const handleDeleteField = async (fieldId?: string) => {
    if (!fieldId || !confirm("Are you sure you want to remove this datapoint definition?")) return;
    try {
      const res = await fetch(`${apiBase}/contacts/fields/${fieldId}`, { method: "DELETE" });
      if (res.ok) fetchFields();
    } catch {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);

    // Read first few lines of CSV to extract headers
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const firstLine = text.split("\n")[0] || "";
        const headers = firstLine
          .split(",")
          .map((h) => h.replace(/["\r]/g, "").trim())
          .filter(Boolean);
        setFileHeaders(headers);

        // Auto-match headers to fields
        const autoMap: Record<string, string> = {};
        headers.forEach((h) => {
          const lower = h.toLowerCase();
          if (lower.includes("phone") || lower.includes("mobile") || lower.includes("contact")) {
            autoMap[h] = "phone_number";
          } else if (lower.includes("name") || lower.includes("student")) {
            autoMap[h] = "name";
          } else {
            const matchedField = fields.find(
              (f) =>
                f.label.toLowerCase() === lower ||
                f.field_key.toLowerCase() === lower ||
                lower.includes(f.field_key)
            );
            if (matchedField) {
              autoMap[h] = matchedField.field_key;
            } else {
              autoMap[h] = h.toLowerCase().replace(/[^a-z0-9]/g, "_");
            }
          }
        });
        setColumnMapping(autoMap);
      }
    };
    reader.readAsText(file.slice(0, 10000));
  };

  const handleStartUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadStatus("Uploading and processing batch...");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("mapping", JSON.stringify(columnMapping));

      const res = await fetch(`${apiBase}/contacts/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadStatus(`Successfully upserted ${data.contacts_upserted?.toLocaleString()} contacts!`);
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setUploadFile(null);
          setUploadStatus(null);
          fetchContacts();
          fetchFields();
        }, 1500);
      } else {
        setUploadStatus(data.detail || "Upload error");
      }
    } catch (err: any) {
      setUploadStatus(`Error: ${err?.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            Master Contacts CRM
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Store and segment up to 200,000+ contacts with customizable academic & demographic datapoints.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsFieldModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Manage Datapoints</span>
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Contacts (CSV/Excel)</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs text-slate-500 font-medium">Total Directory Contacts</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCount.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs text-slate-500 font-medium">Configured Datapoints</span>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{fields.length} attributes</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs text-slate-500 font-medium">Active Database</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">Supabase Cloud</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs text-slate-500 font-medium">Query Engine</span>
          <p className="text-2xl font-bold text-slate-800 mt-1">GIN JSONB Index</p>
        </div>
      </div>

      {/* Search & Table Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by phone, student name, or community..."
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-80 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
            >
              <option value={25}>25 contacts</option>
              <option value={50}>50 contacts</option>
              <option value={100}>100 contacts</option>
            </select>
            <button
              onClick={fetchContacts}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
              title="Refresh Directory"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Master Contacts Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Phone Number</th>
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Stream</th>
                <th className="py-2.5 px-3">Community</th>
                <th className="py-2.5 px-3">Gender</th>
                <th className="py-2.5 px-3">School</th>
                <th className="py-2.5 px-3">Total Calls</th>
                <th className="py-2.5 px-3">Last Outcome</th>
                <th className="py-2.5 px-3">Last DTMF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400 animate-pulse">
                    Loading contacts from Supabase...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No contacts in directory</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click "Upload Contacts" above to import 1–2 Lakh leads with all custom attributes.
                    </p>
                  </td>
                </tr>
              ) : (
                contacts.map((contact, idx) => {
                  const attrs = contact.attributes || {};
                  return (
                    <tr
                      key={contact.id || idx}
                      onClick={() => onSelectLead(contact.id, contact.phone_number)}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {contact.phone_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {contact.name || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {attrs.stream ? (
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                            {attrs.stream}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {attrs.community || attrs.category || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {attrs.gender || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 truncate max-w-[150px]" title={attrs.school || ""}>
                        {attrs.school || attrs.college || "—"}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-indigo-600">
                        {contact.total_calls_count || 0}
                      </td>
                      <td className="py-2.5 px-3">
                        {contact.last_call_status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            contact.last_call_status === "answered" || contact.last_call_status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                            {contact.last_call_status.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-slate-300">Never called</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {contact.last_dtmf ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold font-mono text-xs">
                            {contact.last_dtmf}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Showing Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount.toLocaleString()} total contacts)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2">{page}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: MANAGE CUSTOM DATAPOINTS SCHEMA */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Custom Datapoints Schema</h3>
              </div>
              <button onClick={() => setIsFieldModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Current Datapoints */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Existing Attributes
              </span>
              {fields.map((f) => (
                <div key={f.field_key} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">{f.label}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Key: {f.field_key} • Type: {f.field_type} {f.options?.length ? `(${f.options.join(", ")})` : ""}
                    </span>
                  </div>
                  {f.id && (
                    <button
                      onClick={() => handleDeleteField(f.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      title="Remove field"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Field Form */}
            <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-3">
              <span className="text-xs font-bold text-indigo-950 block">Add New Customizable Datapoint</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Field Label</label>
                  <input
                    type="text"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="e.g. Board, Marks, Father Name..."
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Field Type</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none"
                  >
                    <option value="text">Text Input</option>
                    <option value="select">Select Dropdown</option>
                    <option value="number">Numeric</option>
                  </select>
                </div>
              </div>

              {newFieldType === "select" && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                    Dropdown Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    placeholder="e.g. CBSE, ICSE, State Board"
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleCreateField}
                className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Add Datapoint Definition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: BULK CONTACT UPLOADER WITH COLUMN MAPPER (100k - 200k LEADS) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Bulk Ingest Contacts (1-2 Lakhs)</h3>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* File Drop Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-slate-200 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/10 transition-colors"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv, .xlsx, .xls"
                className="hidden"
              />
              <FileSpreadsheet className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                {uploadFile ? uploadFile.name : "Choose CSV or Excel sheet (100k+ rows supported)"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports phone, name, and any custom columns (gender, stream, community, school, etc.)
              </p>
            </div>

            {/* Column Mapping Preview */}
            {fileHeaders.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-900 block">Map Columns to Contact Fields</span>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {fileHeaders.map((header) => (
                    <div key={header} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <span className="font-medium text-slate-800">{header}</span>
                      <select
                        value={columnMapping[header] || ""}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, [header]: e.target.value })
                        }
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 font-medium"
                      >
                        <option value="phone_number">Phone Number (Required)</option>
                        <option value="name">Full Name</option>
                        {fields.map((f) => (
                          <option key={f.field_key} value={f.field_key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadStatus && (
              <div className="p-3 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-medium">
                {uploadStatus}
              </div>
            )}

            <button
              onClick={handleStartUpload}
              disabled={!uploadFile || isUploading}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Streaming & Upserting Contacts...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Start Bulk Ingestion</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
