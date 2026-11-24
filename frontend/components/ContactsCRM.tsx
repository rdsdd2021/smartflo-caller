"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Search,
  Upload,
  Download,
  Plus,
  Settings,
  Filter,
  CheckCircle2,
  XCircle,
  Check,
  Clock,
  Phone,
  PhoneCall,
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
  Sparkles,
  Sliders,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  UserPlus,
  MoreVertical,
  Activity,
  History
} from "lucide-react";
import AudienceFilterBuilder, { FilterRule } from "./AudienceFilterBuilder";

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

  // Notifications Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Audience Filtering State
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);

  // Custom Datapoints Schema & Visibility
  const [fields, setFields] = useState<CustomFieldMeta[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  // Schema Management Modal
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");

  // Edit Field Schema State
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState("text");
  const [editOptions, setEditOptions] = useState("");
  const [editFilterEnabled, setEditFilterEnabled] = useState(true);
  const [isSavingField, setIsSavingField] = useState(false);

  // Quick Rename Header Modal / State
  const [quickRenameField, setQuickRenameField] = useState<CustomFieldMeta | null>(null);
  const [quickRenameLabel, setQuickRenameLabel] = useState("");

  // Edit Single Contact Modal State
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
  const [editContactName, setEditContactName] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editContactAttrs, setEditContactAttrs] = useState<Record<string, any>>({});
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Add Single Contact Modal State
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactAttrs, setNewContactAttrs] = useState<Record<string, any>>({});
  const [isCreatingContact, setIsCreatingContact] = useState(false);

  // Upload Bulk Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background Ingestion Job Tracking (Persists across page reloads & browser resets!)
  interface ImportJobState {
    id: string;
    status: string;
    total_rows: number;
    processed_rows: number;
    inserted_rows: number;
    skipped_rows: number;
    percent: number;
    filename: string;
    error_message?: string | null;
  }
  const [activeImportJob, setActiveImportJob] = useState<ImportJobState | null>(null);

  useEffect(() => {
    fetchFields();
    checkActiveJobs();
  }, []);

  const checkActiveJobs = async () => {
    try {
      const res = await fetch(`${apiBase}/import-jobs/active?job_type=contacts`);
      if (res.ok) {
        const data = await res.json();
        if (data.jobs && data.jobs.length > 0) {
          setActiveImportJob(data.jobs[0]);
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (!activeImportJob || activeImportJob.status === "completed" || activeImportJob.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/import-jobs/${activeImportJob.id}`);
        if (res.ok) {
          const job = await res.json();
          setActiveImportJob(job);
          if (job.status === "completed") {
            fetchContacts();
            fetchFields();
          }
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [activeImportJob?.id, activeImportJob?.status]);

  useEffect(() => {
    fetchContacts();
  }, [page, pageSize, search, filterRules]);

  // Click outside listener for columns dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(event.target as Node)) {
        setIsColumnsDropdownOpen(false);
      }
    }
    if (isColumnsDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isColumnsDropdownOpen]);

  const fetchFields = async () => {
    try {
      const res = await fetch(`${apiBase}/contacts/fields`);
      if (res.ok) {
        const data = await res.json();
        const loadedFields: CustomFieldMeta[] = data.custom_fields || (data.fields || []).filter((f: any) => !f.is_standard);
        setFields(loadedFields);

        // Initialize visible columns
        setVisibleColumns((prev) => {
          if (prev.length > 0) return prev;
          try {
            const saved = localStorage.getItem("crm_visible_columns");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch {}
          return [
            "phone_number",
            "name",
            ...loadedFields.map((f) => f.field_key),
            "total_calls_count",
            "last_call_status",
            "last_dtmf"
          ];
        });
      }
    } catch {}
  };

  const toggleColumn = (colKey: string) => {
    setVisibleColumns((prev) => {
      let updated: string[];
      if (prev.includes(colKey)) {
        if (prev.length <= 1) return prev;
        updated = prev.filter((k) => k !== colKey);
      } else {
        updated = [...prev, colKey];
      }
      try {
        localStorage.setItem("crm_visible_columns", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const showAllColumns = () => {
    const all = [
      "phone_number",
      "name",
      ...fields.map((f) => f.field_key),
      "total_calls_count",
      "last_call_status",
      "last_dtmf"
    ];
    setVisibleColumns(all);
    try {
      localStorage.setItem("crm_visible_columns", JSON.stringify(all));
    } catch {}
  };

  const resetDefaultColumns = () => {
    const def = [
      "phone_number",
      "name",
      ...fields.slice(0, 4).map((f) => f.field_key),
      "total_calls_count",
      "last_call_status"
    ];
    setVisibleColumns(def);
    try {
      localStorage.setItem("crm_visible_columns", JSON.stringify(def));
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
      if (filterRules.length > 0) {
        query.set("filters", JSON.stringify(filterRules));
      }
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

  // Quick Rename Header Field
  const handleOpenQuickRename = (f: CustomFieldMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickRenameField(f);
    setQuickRenameLabel(f.label);
  };

  const handleSaveQuickRename = async () => {
    if (!quickRenameField || !quickRenameLabel.trim()) return;
    try {
      const fieldId = quickRenameField.id || quickRenameField.field_key;
      const res = await fetch(`${apiBase}/contacts/fields/${fieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: quickRenameLabel.trim()
        })
      });
      if (res.ok) {
        showToast(`Datapoint renamed to "${quickRenameLabel.trim()}"`);
        setQuickRenameField(null);
        await fetchFields();
      } else {
        showToast("Failed to rename datapoint", "error");
      }
    } catch {
      showToast("Error renaming datapoint", "error");
    }
  };

  // Create Field Meta
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
        const data = await res.json();
        setNewFieldLabel("");
        setNewFieldOptions("");
        showToast("Datapoint created successfully!");
        await fetchFields();
        if (data.field?.field_key) {
          setVisibleColumns((prev) => [...prev, data.field.field_key]);
        }
      } else {
        showToast("Failed to create datapoint", "error");
      }
    } catch {
      showToast("Error creating datapoint", "error");
    }
  };

  const handleStartEditField = (f: CustomFieldMeta) => {
    setEditingFieldId(f.id || f.field_key);
    setEditLabel(f.label);
    setEditType(f.field_type || "text");
    setEditOptions((f.options || []).join(", "));
    setEditFilterEnabled(f.is_filter_enabled !== false);
  };

  const handleSaveEditField = async () => {
    if (!editingFieldId || !editLabel.trim()) return;
    setIsSavingField(true);
    try {
      const optionsArray = editOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${apiBase}/contacts/fields/${editingFieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editLabel.trim(),
          field_type: editType,
          options: optionsArray,
          is_filter_enabled: editFilterEnabled
        })
      });
      if (res.ok) {
        setEditingFieldId(null);
        showToast("Datapoint schema updated!");
        await fetchFields();
      } else {
        showToast("Failed to update datapoint", "error");
      }
    } catch {
      showToast("Error updating datapoint", "error");
    } finally {
      setIsSavingField(false);
    }
  };

  const handleDeleteField = async (fieldId?: string) => {
    if (!fieldId || !confirm("Are you sure you want to remove this datapoint definition?")) return;
    try {
      const res = await fetch(`${apiBase}/contacts/fields/${fieldId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Datapoint definition removed.");
        fetchFields();
      }
    } catch {}
  };

  // Open Edit Contact Modal
  const handleOpenEditContact = (contact: ContactItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingContact(contact);
    setEditContactName(contact.name || "");
    setEditContactPhone(contact.phone_number || "");
    setEditContactAttrs({ ...(contact.attributes || {}) });
    setIsEditContactOpen(true);
  };

  // Save Edit Contact
  const handleSaveContact = async () => {
    if (!editingContact) return;
    setIsSavingContact(true);
    try {
      const res = await fetch(`${apiBase}/contacts/${editingContact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editContactName.trim() || null,
          phone_number: editContactPhone.trim() || undefined,
          attributes: editContactAttrs
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Contact details updated successfully!");
        setIsEditContactOpen(false);
        setEditingContact(null);
        fetchContacts();
      } else {
        showToast(data.detail || "Failed to update contact", "error");
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message}`, "error");
    } finally {
      setIsSavingContact(false);
    }
  };

  // Open New Contact Modal
  const handleOpenNewContact = () => {
    setNewContactPhone("");
    setNewContactName("");
    setNewContactAttrs({});
    setIsNewContactOpen(true);
  };

  // Create Single Contact
  const handleCreateContact = async () => {
    if (!newContactPhone.trim()) {
      showToast("Please enter a valid phone number", "error");
      return;
    }
    setIsCreatingContact(true);
    try {
      const res = await fetch(`${apiBase}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: newContactPhone.trim(),
          name: newContactName.trim() || null,
          attributes: newContactAttrs
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Contact ${newContactPhone} added to directory!`);
        setIsNewContactOpen(false);
        setNewContactPhone("");
        setNewContactName("");
        setNewContactAttrs({});
        fetchContacts();
      } else {
        showToast(data.detail || "Failed to add contact", "error");
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message}`, "error");
    } finally {
      setIsCreatingContact(false);
    }
  };

  // Delete Single Contact
  const handleDeleteContact = async (contactId: string, phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to permanently delete contact ${phone}?`)) return;
    try {
      const res = await fetch(`${apiBase}/contacts/${contactId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Contact ${phone} removed from CRM.`);
        fetchContacts();
      } else {
        showToast(data.detail || "Failed to delete contact", "error");
      }
    } catch {
      showToast("Error deleting contact", "error");
    }
  };

  // Sample Template Downloads
  const handleDownloadSample = async (format: "csv" | "xlsx") => {
    try {
      const res = await fetch(`${apiBase}/contacts/sample-template?format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sample_contacts_template.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      }
    } catch {}

    // Fallback: client-side CSV download
    const sampleHeaders = ["phone_number", "name", ...fields.map((f) => f.field_key)];
    const sampleRows = [
      ["919876543210", "Rahul Sharma", "Male", "General", "Science", "Delhi Public School", "Delhi", "94"],
      ["919876543211", "Priya Patel", "Female", "OBC", "Commerce", "St. Xaviers High School", "Ahmedabad", "88"],
      ["919876543212", "Ananya Das", "Female", "General", "Arts", "Modern High School", "Kolkata", "91"],
      ["919876543213", "Aman Verma", "Male", "SC", "Science", "Kendriya Vidyalaya", "Lucknow", "82"],
      ["919876543214", "Sneha Kulkarni", "Female", "EWS", "Commerce", "Bishop Cotton School", "Pune", "86"]
    ];

    const csvContent = [
      sampleHeaders.join(","),
      ...sampleRows.map((r) => r.slice(0, sampleHeaders.length).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_contacts_template.csv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Handle Bulk Upload File Change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadStatus("Analyzing file headers and preview...");

    const applyHeaders = (headers: string[]) => {
      setFileHeaders(headers);
      const autoMap: Record<string, string> = {};
      headers.forEach((h) => {
        const lower = h.toLowerCase().trim();
        if (lower.includes("phone") || lower.includes("mobile") || lower.includes("contact")) {
          autoMap[h] = "phone_number";
        } else if (lower.includes("name") || lower.includes("student")) {
          autoMap[h] = "name";
        } else {
          const matchedField = fields.find(
            (f) =>
              f.label.toLowerCase() === lower ||
              f.field_key.toLowerCase() === lower ||
              lower.includes(f.field_key) ||
              f.field_key.includes(lower)
          );
          if (matchedField) {
            autoMap[h] = matchedField.field_key;
          } else {
            autoMap[h] = h.toLowerCase().replace(/[^a-z0-9]/g, "_");
          }
        }
      });
      setColumnMapping(autoMap);
      setUploadStatus(null);
    };

    try {
      const inspectData = new FormData();
      inspectData.append("file", file);
      const res = await fetch(`${apiBase}/contacts/inspect-file`, {
        method: "POST",
        body: inspectData
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.headers) && data.headers.length > 0) {
        applyHeaders(data.headers);
        return;
      }
    } catch {
      // Fallback to local text reader for CSV files
    }

    // Fallback CSV text reader
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const firstLine = text.split("\n")[0] || "";
        const headers = firstLine
          .split(",")
          .map((h) => h.replace(/["\r]/g, "").trim())
          .filter(Boolean);
        applyHeaders(headers);
      }
    };
    reader.readAsText(file.slice(0, 10000));
  };

  const handleStartUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadStatus("Uploading file to server and starting background ingestion...");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("mapping", JSON.stringify(columnMapping));

      const res = await fetch(`${apiBase}/contacts/upload`, {
        method: "POST",
        body: formData
      });
      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        data = { success: false, detail: resText || `Server returned error (${res.status})` };
      }
      if (res.ok && data.success) {
        if (data.job_id) {
          setActiveImportJob({
            id: data.job_id,
            status: "processing",
            total_rows: data.total_rows || 0,
            processed_rows: 0,
            inserted_rows: 0,
            skipped_rows: 0,
            percent: 0,
            filename: data.filename || uploadFile.name,
            error_message: null
          });
          setIsUploadModalOpen(false);
          setUploadFile(null);
          setUploadStatus(null);
          showToast(`Background ingestion started for ${data.total_rows?.toLocaleString() || "large"} rows!`);
        } else {
          setUploadStatus(`Successfully upserted ${data.contacts_upserted?.toLocaleString()} contacts!`);
          setTimeout(() => {
            setIsUploadModalOpen(false);
            setUploadFile(null);
            setUploadStatus(null);
            fetchContacts();
            fetchFields();
          }, 1500);
        }
      } else {
        setUploadStatus(data.detail || "Upload error");
      }
    } catch (err: any) {
      setUploadStatus(`Error: ${err?.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Contacts calling stats calculation
  const calledContactsCount = contacts.filter((c) => (c.total_calls_count || 0) > 0).length;
  const answeredContactsCount = contacts.filter(
    (c) => c.last_call_status === "answered" || c.last_call_status === "completed"
  ).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-md text-xs font-medium transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : toastMessage.type === "error"
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          {toastMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {toastMessage.type === "error" && <XCircle className="w-4 h-4 text-rose-600" />}
          {toastMessage.type === "info" && <Clock className="w-4 h-4 text-blue-600" />}
          {toastMessage.text}
        </div>
      )}

      {/* Top Banner & Actions Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            Contacts CRM
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Centralized audience directory with dynamic custom datapoints, column customization, and calling history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sample Templates Dropdown */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              onClick={() => handleDownloadSample("csv")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              title="Download Sample CSV Template"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Sample CSV</span>
            </button>
            <div className="w-px h-3.5 bg-slate-200" />
            <button
              onClick={() => handleDownloadSample("xlsx")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-slate-50 text-xs font-semibold text-emerald-700 transition-colors"
              title="Download Sample Excel (.xlsx) Template"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>
          </div>

          {/* Manage Datapoints Button */}
          <button
            onClick={() => setIsFieldModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Manage Datapoints</span>
          </button>

          {/* Add Single Contact Button */}
          <button
            onClick={handleOpenNewContact}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>Add Contact</span>
          </button>

          {/* Upload Contacts Button */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Contacts</span>
          </button>
        </div>
      </div>

      {/* Background Ingestion Progress Banner (Persists across page reloads & browser resets!) */}
      {activeImportJob && (
        <div className={`p-4 rounded-xl border transition-all ${
          activeImportJob.status === "completed" 
            ? "bg-emerald-50 border-emerald-200" 
            : activeImportJob.status === "failed"
            ? "bg-rose-50 border-rose-200"
            : "bg-indigo-50/70 border-indigo-200"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {activeImportJob.status === "completed" ? (
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : activeImportJob.status === "failed" ? (
                <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    {activeImportJob.status === "completed"
                      ? `Import Complete: ${activeImportJob.filename}`
                      : activeImportJob.status === "failed"
                      ? `Import Failed: ${activeImportJob.filename}`
                      : `Ingesting Large File in Background: "${activeImportJob.filename}"`}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    activeImportJob.status === "completed"
                      ? "bg-emerald-100 text-emerald-800"
                      : activeImportJob.status === "failed"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-indigo-100 text-indigo-800 animate-pulse"
                  }`}>
                    {activeImportJob.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activeImportJob.status === "completed"
                    ? `Successfully upserted ${activeImportJob.inserted_rows.toLocaleString()} contacts to your database.`
                    : activeImportJob.status === "failed"
                    ? (activeImportJob.error_message || "Encountered an error while reading the file.")
                    : "Running asynchronously on the server. You can safely close or refresh this page without losing progress!"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <span className="font-mono font-bold text-slate-900">{activeImportJob.percent}%</span>
                <span className="text-[11px] text-slate-500 block font-mono">
                  {activeImportJob.processed_rows.toLocaleString()} / {activeImportJob.total_rows.toLocaleString()} rows
                </span>
              </div>
              {activeImportJob.status === "completed" && (
                <button
                  onClick={() => setActiveImportJob(null)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg shadow-2xs"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>

          {activeImportJob.status !== "completed" && activeImportJob.status !== "failed" && (
            <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(1, activeImportJob.percent))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 4 Executive CRM Metrics (Clean & Purposeful) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Total Contacts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
          <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Directory Scale</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {totalCount.toLocaleString()} <span className="text-xs font-normal text-slate-500">contacts</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Master lead database available for dialing
          </p>
        </div>

        {/* Card 2: Outreach Engagement */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Outreach Reach</span>
            <span className="text-xs font-bold text-indigo-600 font-mono">
              {calledContactsCount} / {contacts.length}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{
                width: `${contacts.length > 0 ? Math.round((calledContactsCount / contacts.length) * 100) : 0}%`
              }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            <strong className="text-slate-700">
              {contacts.length > 0 ? Math.round((calledContactsCount / contacts.length) * 100) : 0}%
            </strong> of page contacts engaged
          </p>
        </div>

        {/* Card 3: Connect Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
          <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Connect Rate</span>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-extrabold text-emerald-600">
              {calledContactsCount > 0 ? ((answeredContactsCount / calledContactsCount) * 100).toFixed(1) : "0.0"}%
            </p>
            <span className="text-xs text-slate-500 font-medium">answered</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 truncate">
            <span className="font-semibold text-slate-700">{answeredContactsCount}</span> completed calls in view
          </p>
        </div>

        {/* Card 4: Datapoints Active */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-colors">
          <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Custom Datapoints</span>
          <p className="text-2xl font-extrabold text-indigo-600 mt-1">
            {fields.length} <span className="text-xs font-normal text-slate-500">attributes</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Fully filterable in campaign audience builder
          </p>
        </div>
      </div>

      {/* Main Table Operations Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
        {/* Search & Header Toolbars */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by phone number, name, or attribute..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
            {/* Audience Filters Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterBuilderOpen(!isFilterBuilderOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shadow-2xs ${
                filterRules.length > 0 || isFilterBuilderOpen
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>Audience Filters {filterRules.length > 0 ? `(${filterRules.length})` : ""}</span>
              {isFilterBuilderOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* Column Visibility Selector Dropdown */}
            <div className="relative" ref={columnsDropdownRef}>
              <button
                type="button"
                onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
                title="Choose visible table headers"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>Columns ({visibleColumns.length})</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isColumnsDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900">Customize Table Headers</span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={showAllColumns}
                        className="font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        All
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={resetDefaultColumns}
                        className="font-semibold text-slate-500 hover:text-slate-800"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Filter columns search */}
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    <input
                      type="text"
                      value={columnSearch}
                      onChange={(e) => setColumnSearch(e.target.value)}
                      placeholder="Find header..."
                      className="w-full pl-7 pr-6 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                    {columnSearch && (
                      <button onClick={() => setColumnSearch("")} className="absolute right-1.5 top-1.5 text-slate-400">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Core Headers
                    </span>
                    {[
                      { key: "phone_number", label: "Phone Number" },
                      { key: "name", label: "Full Name" },
                      { key: "total_calls_count", label: "Total Calls" },
                      { key: "last_call_status", label: "Last Outcome" },
                      { key: "last_dtmf", label: "Last DTMF" }
                    ]
                      .filter((col) => col.label.toLowerCase().includes(columnSearch.toLowerCase()))
                      .map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer select-none text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.includes(col.key)}
                            onChange={() => toggleColumn(col.key)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-medium">{col.label}</span>
                        </label>
                      ))}

                    {fields.length > 0 && (
                      <>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pt-2 mb-1">
                          Custom Datapoints
                        </span>
                        {fields
                          .filter(
                            (f) =>
                              f.label.toLowerCase().includes(columnSearch.toLowerCase()) ||
                              f.field_key.toLowerCase().includes(columnSearch.toLowerCase())
                          )
                          .map((f) => (
                            <label
                              key={f.field_key}
                              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer select-none text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={visibleColumns.includes(f.field_key)}
                                onChange={() => toggleColumn(f.field_key)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="font-medium truncate">{f.label}</span>
                              <span className="text-[10px] text-slate-400 font-mono ml-auto">{f.field_type}</span>
                            </label>
                          ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <span className="text-slate-400 text-[11px]">Show:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-transparent text-xs text-slate-700 font-semibold focus:outline-none cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchContacts}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition-colors"
              title="Refresh Directory"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Audience Filter Builder */}
        {isFilterBuilderOpen && (
          <div className="pt-1 pb-1">
            <AudienceFilterBuilder
              apiBase={apiBase}
              onFilterChange={(rules) => {
                setFilterRules(rules);
                setPage(1);
              }}
            />
          </div>
        )}

        {/* Master Contacts Table (Dynamic Headers & Editable Cells) */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-12 text-slate-400">#</th>
                {visibleColumns.includes("phone_number") && <th className="py-2.5 px-3">Phone Number</th>}
                {visibleColumns.includes("name") && <th className="py-2.5 px-3">Name</th>}

                {/* Dynamic Custom Datapoint Headers with Rename / Hide Actions */}
                {fields.map((f) => {
                  if (!visibleColumns.includes(f.field_key)) return null;
                  return (
                    <th key={f.field_key} className="py-2.5 px-3 whitespace-nowrap group">
                      <div className="flex items-center gap-1.5">
                        <span>{f.label}</span>
                        <button
                          type="button"
                          onClick={(e) => handleOpenQuickRename(f, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-opacity"
                          title={`Rename "${f.label}" header`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleColumn(f.field_key)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-rose-600 transition-opacity"
                          title={`Hide "${f.label}" column`}
                        >
                          <EyeOff className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  );
                })}

                {visibleColumns.includes("total_calls_count") && <th className="py-2.5 px-3">Total Calls</th>}
                {visibleColumns.includes("last_call_status") && <th className="py-2.5 px-3">Last Outcome</th>}
                {visibleColumns.includes("last_dtmf") && <th className="py-2.5 px-3">Last DTMF</th>}
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={2 + visibleColumns.length} className="py-12 text-center text-slate-400 animate-pulse">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                    <p className="text-xs font-medium">Loading contacts...</p>
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={2 + visibleColumns.length} className="py-12 text-center text-slate-400">
                    <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No contacts found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {filterRules.length > 0 || search
                        ? "Try clearing your filters or search terms."
                        : "Click 'Add Contact' or 'Upload Contacts' above to import leads."}
                    </p>
                  </td>
                </tr>
              ) : (
                contacts.map((contact, idx) => {
                  const attrs = contact.attributes || {};
                  return (
                    <tr
                      key={contact.id || idx}
                      className="hover:bg-indigo-50/30 transition-colors group"
                    >
                      {/* Row Index */}
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {(page - 1) * pageSize + idx + 1}
                      </td>

                      {/* Phone Number */}
                      {visibleColumns.includes("phone_number") && (
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors whitespace-nowrap">
                          {contact.phone_number}
                        </td>
                      )}

                      {/* Name */}
                      {visibleColumns.includes("name") && (
                        <td className="py-2.5 px-3 text-slate-800 font-medium whitespace-nowrap">
                          {contact.name || "—"}
                        </td>
                      )}

                      {/* Dynamic Custom Datapoint Values */}
                      {fields.map((f) => {
                        if (!visibleColumns.includes(f.field_key)) return null;
                        const val = attrs[f.field_key];
                        const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
                        return (
                          <td
                            key={f.field_key}
                            className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate"
                            title={hasVal ? String(val) : ""}
                          >
                            {hasVal ? (
                              f.field_type === "select" ? (
                                <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium truncate">
                                  {String(val)}
                                </span>
                              ) : (
                                <span className="truncate">{String(val)}</span>
                              )
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Total Calls */}
                      {visibleColumns.includes("total_calls_count") && (
                        <td className="py-2.5 px-3 font-semibold text-indigo-600">
                          {contact.total_calls_count || 0}
                        </td>
                      )}

                      {/* Last Outcome */}
                      {visibleColumns.includes("last_call_status") && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {contact.last_call_status ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                contact.last_call_status === "answered" || contact.last_call_status === "completed"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : contact.last_call_status === "failed" || contact.last_call_status === "missed"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {contact.last_call_status.toUpperCase()}
                            </span>
                          ) : (
                            <span className="text-slate-400">Never called</span>
                          )}
                        </td>
                      )}

                      {/* Last DTMF */}
                      {visibleColumns.includes("last_dtmf") && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {contact.last_dtmf ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold font-mono text-xs">
                              {contact.last_dtmf}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}

                      {/* Inline Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit Contact Button */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditContact(contact, e)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors"
                            title="Edit contact details & attributes"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* View Call History Drawer Button */}
                          <button
                            type="button"
                            onClick={() => onSelectLead(contact.id, contact.phone_number)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors"
                            title="View call history & logs"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Contact Button */}
                          <button
                            type="button"
                            onClick={(e) => handleDeleteContact(contact.id, contact.phone_number, e)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-500">
            Showing Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount.toLocaleString()} total contacts)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 text-slate-700">{page}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: EDIT CONTACT DETAILS & DATAPOINTS              */}
      {/* ======================================================== */}
      {isEditContactOpen && editingContact && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Edit Contact Datapoints</h3>
              </div>
              <button
                onClick={() => {
                  setIsEditContactOpen(false);
                  setEditingContact(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 max-h-[65vh] overflow-y-auto pr-1">
              {/* Phone & Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editContactPhone}
                    onChange={(e) => setEditContactPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editContactName}
                    onChange={(e) => setEditContactName(e.target.value)}
                    placeholder="Enter student / contact name"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Custom Attributes Fields */}
              {fields.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                    Custom Attributes
                  </span>
                  <div className="space-y-2.5">
                    {fields.map((f) => {
                      const val = editContactAttrs[f.field_key] ?? "";
                      return (
                        <div key={f.field_key}>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                            {f.label} <span className="text-[10px] text-slate-400 font-normal">({f.field_key})</span>
                          </label>
                          {f.field_type === "select" && f.options && f.options.length > 0 ? (
                            <select
                              value={String(val)}
                              onChange={(e) =>
                                setEditContactAttrs({ ...editContactAttrs, [f.field_key]: e.target.value })
                              }
                              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500"
                            >
                              <option value="">-- Not set --</option>
                              {f.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={f.field_type === "number" ? "number" : "text"}
                              value={String(val)}
                              onChange={(e) =>
                                setEditContactAttrs({ ...editContactAttrs, [f.field_key]: e.target.value })
                              }
                              placeholder={`Enter ${f.label.toLowerCase()}...`}
                              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsEditContactOpen(false);
                  setEditingContact(null);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveContact}
                disabled={isSavingContact}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isSavingContact ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: ADD SINGLE NEW CONTACT                         */}
      {/* ======================================================== */}
      {isNewContactOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Add New Contact</h3>
              </div>
              <button onClick={() => setIsNewContactOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="e.g. 919876543210"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              {fields.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                    Custom Attributes
                  </span>
                  <div className="space-y-2.5">
                    {fields.map((f) => (
                      <div key={f.field_key}>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          {f.label}
                        </label>
                        {f.field_type === "select" && f.options && f.options.length > 0 ? (
                          <select
                            value={newContactAttrs[f.field_key] || ""}
                            onChange={(e) =>
                              setNewContactAttrs({ ...newContactAttrs, [f.field_key]: e.target.value })
                            }
                            className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500"
                          >
                            <option value="">-- Choose {f.label} --</option>
                            {f.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.field_type === "number" ? "number" : "text"}
                            value={newContactAttrs[f.field_key] || ""}
                            onChange={(e) =>
                              setNewContactAttrs({ ...newContactAttrs, [f.field_key]: e.target.value })
                            }
                            placeholder={`Enter ${f.label.toLowerCase()}...`}
                            className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewContactOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateContact}
                disabled={isCreatingContact || !newContactPhone.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isCreatingContact ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Add Contact</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: QUICK RENAME TABLE HEADER                      */}
      {/* ======================================================== */}
      {quickRenameField && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Rename Table Header</h3>
              <button onClick={() => setQuickRenameField(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Header Label for <code className="text-indigo-600">{quickRenameField.field_key}</code>
              </label>
              <input
                type="text"
                autoFocus
                value={quickRenameLabel}
                onChange={(e) => setQuickRenameLabel(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500 font-medium"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickRenameField(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuickRename}
                disabled={!quickRenameLabel.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: MANAGE CUSTOM DATAPOINTS SCHEMA                */}
      {/* ======================================================== */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-100">
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
                Configured Attributes ({fields.length})
              </span>
              {fields.map((f) => {
                const isEditing = editingFieldId === (f.id || f.field_key);
                if (isEditing) {
                  return (
                    <div key={f.field_key} className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-indigo-950">Editing: {f.field_key}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Key is fixed</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Label</label>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Type</label>
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value)}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded"
                          >
                            <option value="text">Text Input</option>
                            <option value="select">Select Dropdown</option>
                            <option value="number">Numeric</option>
                          </select>
                        </div>
                      </div>
                      {editType === "select" && (
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                            Options (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={editOptions}
                            onChange={(e) => setEditOptions(e.target.value)}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded"
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editFilterEnabled}
                            onChange={(e) => setEditFilterEnabled(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Enable as audience filter</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingFieldId(null)}
                            className="px-2 py-1 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-200/60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEditField}
                            disabled={isSavingField || !editLabel.trim()}
                            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold shadow-2xs disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Save Changes</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={f.field_key}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{f.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Key: <span className="text-indigo-600">{f.field_key}</span> • Type: {f.field_type}{" "}
                        {f.options?.length ? `(${f.options.join(", ")})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEditField(f)}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Edit datapoint definition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {f.id && (
                        <button
                          onClick={() => handleDeleteField(f.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Remove field"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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

      {/* ======================================================== */}
      {/* MODAL 5: BULK CONTACT UPLOADER WITH COLUMN MAPPER       */}
      {/* ======================================================== */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Bulk Ingest Contacts</h3>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Banner inside Upload Modal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs text-indigo-950 font-medium">Need a template with your columns?</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSample("csv")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-50 text-xs font-semibold text-indigo-700 shadow-2xs transition-colors"
                >
                  <Download className="w-3 h-3 text-indigo-600" />
                  <span>Sample CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSample("xlsx")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-50 text-xs font-semibold text-emerald-700 shadow-2xs transition-colors"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  <span>Sample Excel</span>
                </button>
              </div>
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
                {uploadFile ? uploadFile.name : "Choose CSV or Excel sheet"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports phone, name, and any custom columns (city, stream, board, etc.)
              </p>
            </div>

            {/* Column Mapping Preview */}
            {fileHeaders.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-900 block">Map Columns to Contact Fields</span>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {fileHeaders.map((header) => (
                    <div
                      key={header}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <span className="font-medium text-slate-800">{header}</span>
                      <select
                        value={columnMapping[header] || ""}
                        onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
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
              <div className="p-3 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-medium">{uploadStatus}</div>
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
