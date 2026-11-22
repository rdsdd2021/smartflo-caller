"use client";

import React, { useState, useEffect } from "react";
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
  AlertCircle
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

const getOperatorsForType = (type: string) => {
  switch (type) {
    case "number":
      return [
        { label: "equals (=)", value: "equals" },
        { label: "does not equal (≠)", value: "not_equals" },
        { label: "greater than (>)", value: "greater_than" },
        { label: "less than (<)", value: "less_than" },
        { label: "at least (>=)", value: "greater_than_or_equal" },
        { label: "at most (<=)", value: "less_than_or_equal" },
        { label: "is empty / not set", value: "is_empty" },
        { label: "is set / has value", value: "is_not_empty" }
      ];
    case "select":
      return [
        { label: "is", value: "equals" },
        { label: "is not", value: "not_equals" },
        { label: "is any of (multi-select)", value: "in" },
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
        { label: "equals exactly", value: "equals" },
        { label: "does not equal", value: "not_equals" },
        { label: "contains text", value: "contains" },
        { label: "starts with", value: "starts_with" },
        { label: "ends with", value: "ends_with" },
        { label: "is any of", value: "in" },
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
        setFields(loaded.filter(f => f.is_filter_enabled !== false));
      }
    } catch (e) {
      console.error("Error fetching dynamic fields:", e);
    }
  };

  const fetchFieldValues = async (fieldKey: string) => {
    if (fieldValuesCache[fieldKey] || loadingFieldValues[fieldKey]) return;
    setLoadingFieldValues(prev => ({ ...prev, [fieldKey]: true }));
    try {
      const res = await fetch(`${apiBase}/contacts/field-values?field=${encodeURIComponent(fieldKey)}`);
      if (res.ok) {
        const data = await res.json();
        setFieldValuesCache(prev => ({ ...prev, [fieldKey]: data.values || [] }));
      }
    } catch {} finally {
      setLoadingFieldValues(prev => ({ ...prev, [fieldKey]: false }));
    }
  };

  const handleAddRule = () => {
    const defaultField = fields[0]?.field_key || "last_call_status";
    const fieldMeta = fields.find(f => f.field_key === defaultField);
    const defaultOp = fieldMeta?.field_type === "number" ? "greater_than_or_equal" : "equals";
    
    const newRule: FilterRule = {
      field: defaultField,
      operator: defaultOp as any,
      value: ""
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
      const newFieldMeta = fields.find(f => f.field_key === val);
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
      // Valid rules are those that either don't require value (is_empty/is_not_empty) or have a value
      const activeRules = rules.filter((r) => {
        if (!r.field) return false;
        if (r.operator === "is_empty" || r.operator === "is_not_empty") return true;
        if (r.operator === "in") return (r.values && r.values.length > 0);
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
  const categories = Array.from(new Set(fields.map(f => f.category || "Custom Datapoints")));

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
            Target specific leads from your master database by filtering on any contact attribute, telecom outcome, or DTMF press.
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
        <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-xs transition-all ${
          matchingCount > 0 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <div className="flex items-center gap-2">
            {matchingCount > 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              <strong>{matchingCount.toLocaleString()}</strong> {matchingCount === 1 ? "contact matches" : "contacts match"} these filter criteria.
            </span>
          </div>
          <span className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
            matchingCount > 0 ? "text-emerald-700 bg-emerald-100/70" : "text-amber-700 bg-amber-100/70"
          }`}>
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
              Leave empty to queue all contacts in the database, or add conditions below to target by any linked data point.
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
            const isMultiValue = rule.operator === "in";

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

                  {/* Value Input */}
                  {isNullCheck ? (
                    <div className="flex-1 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] text-slate-500 italic">
                      No value required ({rule.operator === "is_empty" ? "matches empty / null records" : "matches non-empty records"})
                    </div>
                  ) : isMultiValue ? (
                    <div className="flex-1 flex flex-wrap gap-1 items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5 min-h-[34px]">
                      {allAvailableValues.length > 0 ? (
                        allAvailableValues.map((opt) => {
                          const selected = (rule.values || []).includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                const cur = rule.values || [];
                                const next = selected ? cur.filter((x) => x !== opt) : [...cur, opt];
                                handleRuleChange(idx, "values", next);
                              }}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                                selected
                                  ? "bg-indigo-600 text-white shadow-2xs"
                                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {selected && <Check className="w-2.5 h-2.5 inline mr-1" />}
                              {opt}
                            </button>
                          );
                        })
                      ) : (
                        <input
                          type="text"
                          placeholder="Type values comma-separated (e.g. Science, Arts)..."
                          value={(rule.values || []).join(", ")}
                          onChange={(e) => {
                            const raw = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                            handleRuleChange(idx, "values", raw);
                          }}
                          className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded focus:outline-none"
                        />
                      )}
                    </div>
                  ) : allAvailableValues.length > 0 && fieldType === "select" ? (
                    <select
                      value={rule.value}
                      onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Select option...</option>
                      {allAvailableValues.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
                      value={rule.value}
                      onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                      placeholder={`Enter ${currentFieldMeta?.label || "value"}...`}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    />
                  )}

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

                {/* Suggestions Pills Bar (Quick Fill) */}
                {!isNullCheck && !isMultiValue && allAvailableValues.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pl-1 text-[11px] text-slate-400">
                    <span className="shrink-0 text-[10px] font-medium text-slate-400">Suggestions:</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {allAvailableValues.slice(0, 8).map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleRuleChange(idx, "value", val)}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                            rule.value === val
                              ? "bg-indigo-100 text-indigo-700 font-bold border border-indigo-200"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                      {allAvailableValues.length > 8 && (
                        <span className="text-[10px] text-slate-400">+{allAvailableValues.length - 8} more</span>
                      )}
                    </div>
                  </div>
                )}
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
