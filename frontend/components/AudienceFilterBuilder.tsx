"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Users,
  CheckCircle2,
  Filter,
  Sparkles,
  RefreshCw,
  Tag,
  PhoneCall,
  Calendar,
  Hash,
  Type,
  Check,
  ChevronDown,
  AlertCircle,
  Search,
  X
} from "lucide-react";

export interface FilterRule {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "in"
    | "greater_than"
    | "less_than"
    | "greater_than_or_equal"
    | "less_than_or_equal"
    | "is_empty"
    | "is_not_empty";
  value: string;
  values?: string[];
}

export interface ContactFilterField {
  id?: string;
  field_key: string;
  label: string;
  category?: string;
  field_type: "text" | "number" | "select" | "date";
  options?: string[];
  is_standard?: boolean;
  is_filter_enabled?: boolean;
}

interface AudienceFilterBuilderProps {
  apiBase: string;
  onFilterChange: (rules: FilterRule[], count: number) => void;
}

interface SearchableCheckboxDropdownProps {
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
}

function SearchableCheckboxDropdown({
  options,
  selectedValues,
  onChange,
  placeholder = "Select values...",
  allowCustom = true
}: SearchableCheckboxDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((x) => x !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    const combined = Array.from(new Set([...selectedValues, ...filtered]));
    onChange(combined);
  };

  const handleClearAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange([]);
  };

  const handleAddCustom = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !selectedValues.includes(trimmed)) {
      onChange([...selectedValues, trimmed]);
      setSearch("");
    }
  };

  const isCustomMatchPossible =
    allowCustom &&
    search.trim() !== "" &&
    !options.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="relative flex-1 min-w-[200px]" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-left hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs transition-colors"
      >
        <div className="flex-1 truncate">
          {selectedValues.length === 0 ? (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          ) : selectedValues.length <= 2 ? (
            <span className="font-semibold text-slate-800">
              {selectedValues.join(", ")}
            </span>
          ) : (
            <span className="font-semibold text-slate-800">
              {selectedValues.slice(0, 2).join(", ")}{" "}
              <span className="inline-block bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-bold text-[10px]">
                +{selectedValues.length - 2} more
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedValues.length > 0 && (
            <span
              onClick={handleClearAll}
              className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or type custom..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Action Bar */}
          <div className="flex items-center justify-between text-[11px] px-1 text-slate-500 pt-0.5 border-b border-slate-100 pb-1.5">
            <span>
              <strong className="text-slate-700">{selectedValues.length}</strong> selected
            </span>
            <div className="flex items-center gap-2">
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Select All
                </button>
              )}
              {selectedValues.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="font-semibold text-rose-600 hover:text-rose-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Checkbox Options List */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
            {isCustomMatchPossible && (
              <button
                type="button"
                onClick={() => handleAddCustom(search)}
                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 transition-colors mb-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add &quot;{search.trim()}&quot;</span>
              </button>
            )}

            {filtered.length === 0 && !isCustomMatchPossible ? (
              <div className="text-center py-4 px-2 space-y-1">
                <p className="text-xs font-semibold text-slate-500">
                  {options.length === 0 ? "No preloaded values found" : "No matching values found"}
                </p>
                <p className="text-[11px] text-slate-400">
                  {options.length === 0
                    ? "Type any value in the search box above and click 'Add', or change operator to 'contains text'."
                    : "Try searching with a different keyword."}
                </p>
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = selectedValues.includes(opt);
                return (
                  <label
                    key={opt}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                      isSelected
                        ? "bg-indigo-50/70 text-indigo-950 font-semibold"
                        : "hover:bg-slate-50 text-slate-700 font-medium"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOption(opt)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="flex-1 truncate">{opt}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const getOperatorsForType = (type: string) => {
  switch (type) {
    case "number":
      return [
        { label: "is any of (checkboxes)", value: "in" },
        { label: "equals (=)", value: "equals" },
        { label: "not equals (≠)", value: "not_equals" },
        { label: "greater than (>)", value: "greater_than" },
        { label: "less than (<)", value: "less_than" },
        { label: "at least (>=)", value: "greater_than_or_equal" },
        { label: "at most (<=)", value: "less_than_or_equal" },
        { label: "is empty / not set", value: "is_empty" },
        { label: "is set / has value", value: "is_not_empty" }
      ];
    case "select":
      return [
        { label: "is any of (checkboxes)", value: "in" },
        { label: "is exactly", value: "equals" },
        { label: "is not", value: "not_equals" },
        { label: "is empty / not set", value: "is_empty" },
        { label: "is set / has value", value: "is_not_empty" }
      ];
    case "date":
      return [
        { label: "on date", value: "equals" },
        { label: "after date", value: "greater_than" },
        { label: "before date", value: "less_than" },
        { label: "is empty / never", value: "is_empty" },
        { label: "is set / has date", value: "is_not_empty" }
      ];
    case "text":
    default:
      return [
        { label: "is any of (checkboxes)", value: "in" },
        { label: "equals exactly", value: "equals" },
        { label: "does not equal", value: "not_equals" },
        { label: "contains text", value: "contains" },
        { label: "starts with", value: "starts_with" },
        { label: "ends with", value: "ends_with" },
        { label: "is empty / not set", value: "is_empty" },
        { label: "is set / has value", value: "is_not_empty" }
      ];
  }
};

export default function AudienceFilterBuilder({
  apiBase,
  onFilterChange
}: AudienceFilterBuilderProps) {
  const [fields, setFields] = useState<ContactFilterField[]>([]);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  // Dynamic distinct values cache for suggestions
  const [fieldValuesCache, setFieldValuesCache] = useState<Record<string, string[]>>({});
  const [loadingFieldValues, setLoadingFieldValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      const res = await fetch(`${apiBase}/contacts/fields`);
      if (res.ok) {
        const data = await res.json();
        const loaded: ContactFilterField[] = data.fields || [];
        setFields(loaded.filter((f) => f.is_filter_enabled !== false));
      }
    } catch (e) {
      console.error("Error fetching dynamic fields:", e);
    }
  };

  const fetchFieldValues = async (fieldKey: string, forceRefresh: boolean = false) => {
    if (!forceRefresh && (fieldValuesCache[fieldKey] || loadingFieldValues[fieldKey])) return;
    setLoadingFieldValues((prev) => ({ ...prev, [fieldKey]: true }));
    try {
      const res = await fetch(`${apiBase}/contacts/field-values?field=${encodeURIComponent(fieldKey)}&limit=2000${forceRefresh ? "&refresh=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        setFieldValuesCache((prev) => ({ ...prev, [fieldKey]: data.values || [] }));
      }
    } catch {} finally {
      setLoadingFieldValues((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const handleAddRule = () => {
    const defaultField = fields[0]?.field_key || "last_call_status";
    const fieldMeta = fields.find((f) => f.field_key === defaultField);
    const validOps = getOperatorsForType(fieldMeta?.field_type || "text");

    const newRule: FilterRule = {
      field: defaultField,
      operator: validOps[0].value as any,
      value: "",
      values: []
    };
    const updated = [...rules, newRule];
    setRules(updated);
    setMatchingCount(null);
    fetchFieldValues(defaultField);
  };

  const handleRemoveRule = (index: number) => {
    const updated = rules.filter((_, idx) => idx !== index);
    setRules(updated);
    setMatchingCount(null);
  };

  const handleRuleChange = (index: number, key: keyof FilterRule, val: any) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [key]: val };

    if (key === "field") {
      const newFieldMeta = fields.find((f) => f.field_key === val);
      const validOps = getOperatorsForType(newFieldMeta?.field_type || "text");
      updated[index].operator = validOps[0].value as any;
      updated[index].value = "";
      updated[index].values = [];
      fetchFieldValues(val);
    }

    setRules(updated);
    setMatchingCount(null);
  };

  const handleCheckCount = async () => {
    setIsCounting(true);
    setCountError(null);
    try {
      const activeRules = rules.filter((r) => {
        if (!r.field) return false;
        if (r.operator === "is_empty" || r.operator === "is_not_empty") return true;
        if (r.operator === "in") return r.values && r.values.length > 0;
        return Boolean(r.value && r.value.trim() !== "");
      });

      const res = await fetch(`${apiBase}/contacts/check-count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: activeRules })
      });
      if (res.ok) {
        const data = await res.json();
        const count = data.matching_count ?? 0;
        setMatchingCount(count);
        onFilterChange(activeRules, count);
      } else {
        setCountError("Unable to calculate count. Please check connection.");
      }
    } catch (err: any) {
      setCountError(err?.message || "Failed to count leads");
    } finally {
      setIsCounting(false);
    }
  };

  // Group fields by category dynamically
  const categories = Array.from(new Set(fields.map((f) => f.category || "Custom Datapoints")));

  return (
    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-4">
      {/* Header and Check Count Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 tracking-tight">
              Dynamic Audience Segmentation
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Filter contacts with searchable checkbox dropdowns across call status, DTMF response, and all custom lead data.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheckCount}
          disabled={isCounting}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition-colors shrink-0 disabled:opacity-50"
        >
          {isCounting ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Users className="w-3.5 h-3.5" />
          )}
          <span>{isCounting ? "Querying Supabase..." : "Check Matching Count"}</span>
        </button>
      </div>

      {/* Matching Count Result Banner */}
      {matchingCount !== null && (
        <div
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-xs transition-all ${
            matchingCount > 0
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {matchingCount > 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              <strong>{matchingCount.toLocaleString()}</strong>{" "}
              {matchingCount === 1 ? "contact matches" : "contacts match"} these filter criteria.
            </span>
          </div>
          <span
            className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
              matchingCount > 0
                ? "text-emerald-700 bg-emerald-100/70"
                : "text-amber-700 bg-amber-100/70"
            }`}
          >
            {matchingCount > 0 ? "Ready to Queue" : "No Leads Match"}
          </span>
        </div>
      )}

      {countError && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{countError}</span>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-6 border border-slate-200 border-dashed rounded-lg bg-white/60">
            <Users className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
            <p className="text-xs text-slate-600 font-semibold">No filter conditions applied</p>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
              Leave empty to queue all contacts, or click below to target leads with searchable checkbox filters.
            </p>
            <button
              type="button"
              onClick={handleAddRule}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Add Filter Condition</span>
            </button>
          </div>
        ) : (
          rules.map((rule, idx) => {
            const currentFieldMeta = fields.find((f) => f.field_key === rule.field);
            const fieldType = currentFieldMeta?.field_type || "text";
            const operators = getOperatorsForType(fieldType);

            // Available distinct suggestions: options from schema OR cached database distinct values
            const cachedValues = fieldValuesCache[rule.field] || [];
            const configuredOptions = currentFieldMeta?.options || [];
            const allAvailableValues = Array.from(new Set([...configuredOptions, ...cachedValues])).filter(Boolean);

            const isNullCheck = rule.operator === "is_empty" || rule.operator === "is_not_empty";
            const isNumericComparison = ["greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"].includes(rule.operator);
            const isDateComparison = fieldType === "date" && ["equals", "greater_than", "less_than"].includes(rule.operator);
            const isTextSubstring = ["contains", "starts_with", "ends_with"].includes(rule.operator);

            return (
              <div
                key={idx}
                className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs space-y-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/* Field Selector with Optgroups */}
                  <div className="relative">
                    <select
                      value={rule.field}
                      onChange={(e) => handleRuleChange(idx, "field", e.target.value)}
                      className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      {categories.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {fields
                            .filter((f) => (f.category || "Custom Datapoints") === cat)
                            .map((f) => (
                              <option key={f.field_key} value={f.field_key}>
                                {f.label}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Operator Selector */}
                  <select
                    value={rule.operator}
                    onChange={(e) => handleRuleChange(idx, "operator", e.target.value as any)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {operators.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {/* Dynamic Value Input or Searchable Checkbox Dropdown */}
                  {isNullCheck ? (
                    <div className="flex-1 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] text-slate-500 italic">
                      No value required ({rule.operator === "is_empty" ? "matches empty / null records" : "matches non-empty records"})
                    </div>
                  ) : isNumericComparison ? (
                    <input
                      type="number"
                      value={rule.value}
                      onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                      placeholder={`Enter number (e.g. 10)...`}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    />
                  ) : isDateComparison ? (
                    <input
                      type="date"
                      value={rule.value}
                      onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    />
                  ) : isTextSubstring ? (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                      placeholder={`Text to match for ${currentFieldMeta?.label || "field"}...`}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    />
                  ) : (
                    /* Default for "in", "equals", "not_equals": Searchable Checkbox Dropdown */
                    <SearchableCheckboxDropdown
                      options={allAvailableValues}
                      selectedValues={
                        rule.operator === "in" && rule.values && rule.values.length > 0
                          ? rule.values
                          : rule.value
                          ? [rule.value]
                          : []
                      }
                      onChange={(selected) => {
                        const updated = [...rules];
                        if (selected.length > 1) {
                          updated[idx].operator = "in";
                          updated[idx].values = selected;
                          updated[idx].value = selected[0] || "";
                        } else if (selected.length === 1) {
                          updated[idx].values = selected;
                          updated[idx].value = selected[0];
                        } else {
                          updated[idx].values = [];
                          updated[idx].value = "";
                        }
                        setRules(updated);
                        setMatchingCount(null);
                      }}
                      placeholder={`Search & select ${currentFieldMeta?.label || "options"}...`}
                      allowCustom={true}
                    />
                  )}

                  {/* Refresh Field Values Button */}
                  <button
                    type="button"
                    onClick={() => fetchFieldValues(rule.field, true)}
                    disabled={loadingFieldValues[rule.field]}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                    title="Refresh values from database"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFieldValues[rule.field] ? "animate-spin text-indigo-600" : ""}`} />
                  </button>

                  {/* Remove Rule Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    title="Remove rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {rules.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={handleAddRule}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add another condition</span>
          </button>
          <span className="text-[11px] text-slate-400">All conditions matched with logical AND</span>
        </div>
      )}
    </div>
  );
}
