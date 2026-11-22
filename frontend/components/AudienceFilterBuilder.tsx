"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Users,
  Search,
  CheckCircle2,
  Filter,
  Sparkles,
  RefreshCw,
  HelpCircle
} from "lucide-react";

export interface FilterRule {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "in";
  value: string;
  values?: string[];
}

interface CustomFieldMeta {
  field_key: string;
  label: string;
  field_type: string;
  options?: string[];
  is_filter_enabled?: boolean;
}

interface AudienceFilterBuilderProps {
  apiBase: string;
  onFilterChange: (rules: FilterRule[], count: number) => void;
}

export default function AudienceFilterBuilder({
  apiBase,
  onFilterChange
}: AudienceFilterBuilderProps) {
  const [fields, setFields] = useState<CustomFieldMeta[]>([]);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      const res = await fetch(`${apiBase}/contacts/fields`);
      if (res.ok) {
        const data = await res.json();
        setFields(data.fields || []);
      }
    } catch (e) {
      console.error("Error fetching fields:", e);
    }
  };

  const handleAddRule = () => {
    const defaultField = fields[0]?.field_key || "stream";
    const newRule: FilterRule = {
      field: defaultField,
      operator: "equals",
      value: ""
    };
    const updated = [...rules, newRule];
    setRules(updated);
    setMatchingCount(null);
  };

  const handleRemoveRule = (index: number) => {
    const updated = rules.filter((_, idx) => idx !== index);
    setRules(updated);
    setMatchingCount(null);
  };

  const handleRuleChange = (index: number, key: keyof FilterRule, val: any) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [key]: val };

    // If field changed, clear value
    if (key === "field") {
      updated[index].value = "";
      updated[index].values = [];
    }

    setRules(updated);
    setMatchingCount(null);
  };

  const handleCheckCount = async () => {
    setIsCounting(true);
    setCountError(null);
    try {
      const activeRules = rules.filter((r) => r.field && (r.value || (r.values && r.values.length > 0)));
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
        setCountError("Unable to calculate count. Check connection.");
      }
    } catch (err: any) {
      setCountError(err?.message || "Failed to count leads");
    } finally {
      setIsCounting(false);
    }
  };

  return (
    <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4">
      {/* Header and Check Count Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-900 tracking-tight">
              Audience Filter & Segmentation
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Target specific leads from your master contacts directory by combining datapoints.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheckCount}
          disabled={isCounting}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition-colors shrink-0"
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
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>{matchingCount.toLocaleString()}</strong> contacts match these filter rules and will be dialed.
            </span>
          </div>
          <span className="font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded text-[11px]">
            Ready to Queue
          </span>
        </div>
      )}

      {countError && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {countError}
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-2.5">
        {rules.length === 0 ? (
          <div className="text-center py-5 border border-slate-200 border-dashed rounded-lg bg-white/50">
            <Users className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
            <p className="text-xs text-slate-500 font-medium">No attribute filters applied</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Leave blank to dial all contacts in directory, or click below to target by Gender, Stream, Community, School, etc.
            </p>
            <button
              type="button"
              onClick={handleAddRule}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Add Attribute Filter</span>
            </button>
          </div>
        ) : (
          rules.map((rule, idx) => {
            const currentFieldMeta = fields.find((f) => f.field_key === rule.field);
            const hasOptions = currentFieldMeta?.options && currentFieldMeta.options.length > 0;

            return (
              <div
                key={idx}
                className="flex items-center gap-2 bg-white border border-slate-200 p-2.5 rounded-lg shadow-2xs"
              >
                {/* Field Selector */}
                <select
                  value={rule.field}
                  onChange={(e) => handleRuleChange(idx, "field", e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 font-medium"
                >
                  {fields.map((f) => (
                    <option key={f.field_key} value={f.field_key}>
                      {f.label}
                    </option>
                  ))}
                  <option value="last_call_status">Last Call Status</option>
                </select>

                {/* Operator Selector */}
                <select
                  value={rule.operator}
                  onChange={(e) => handleRuleChange(idx, "operator", e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-700 font-medium"
                >
                  <option value="equals">is equal to</option>
                  <option value="not_equals">is not equal to</option>
                  <option value="contains">contains text</option>
                  <option value="in">is any of</option>
                </select>

                {/* Value Input or Options Dropdown */}
                {rule.operator === "in" && hasOptions ? (
                  <div className="flex-1 flex flex-wrap gap-1 items-center bg-slate-50 border border-slate-200 rounded-md p-1 min-h-[32px]">
                    {(currentFieldMeta?.options || []).map((opt) => {
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
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                            selected
                              ? "bg-indigo-600 text-white"
                              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : hasOptions ? (
                  <select
                    value={rule.value}
                    onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    <option value="">Select an option...</option>
                    {(currentFieldMeta?.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                    placeholder="Enter value (e.g. Science, DPS)..."
                    className="flex-1 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}

                {/* Remove Rule */}
                <button
                  type="button"
                  onClick={() => handleRemoveRule(idx)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                  title="Remove rule"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {rules.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleAddRule}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add another condition</span>
          </button>
          <span className="text-[11px] text-slate-400">All conditions are matched with AND</span>
        </div>
      )}
    </div>
  );
}
