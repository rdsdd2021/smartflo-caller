"use client";

import React from "react";
import { Filter, Users, Tag, CheckCircle2, SlidersHorizontal, Info, Sparkles } from "lucide-react";
import { FilterRule } from "./AudienceFilterBuilder";

interface CampaignAudienceFiltersProps {
  filters?: FilterRule[] | null;
  variant?: "drawer" | "compact" | "card" | "banner";
  totalLeads?: number;
  onRefineClick?: () => void;
}

export const formatOperatorLabel = (operator: string): string => {
  switch (operator) {
    case "equals":
      return "=";
    case "not_equals":
      return "≠";
    case "contains":
      return "contains";
    case "starts_with":
      return "starts with";
    case "ends_with":
      return "ends with";
    case "in":
      return "is one of";
    case "greater_than":
      return ">";
    case "less_than":
      return "<";
    case "greater_than_or_equal":
      return "≥";
    case "less_than_or_equal":
      return "≤";
    case "is_empty":
      return "is blank";
    case "is_not_empty":
      return "is present";
    default:
      return operator.replace(/_/g, " ");
  }
};

export const formatFieldLabel = (field: string): string => {
  if (!field) return "Unknown Field";
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const formatRuleValue = (rule: FilterRule): string => {
  if (rule.operator === "in") {
    if (rule.values && rule.values.length > 0) {
      return rule.values.join(", ");
    }
    return rule.value || "";
  }
  if (rule.operator === "is_empty" || rule.operator === "is_not_empty") {
    return "";
  }
  return rule.value || "";
};

export default function CampaignAudienceFilters({
  filters,
  variant = "drawer",
  totalLeads,
  onRefineClick,
}: CampaignAudienceFiltersProps) {
  const rules = Array.isArray(filters) ? filters.filter((r) => Boolean(r && r.field)) : [];
  const hasFilters = rules.length > 0;

  // 1. COMPACT VARIANT (For visual cards grid)
  if (variant === "compact") {
    if (!hasFilters) {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2.5">
          <Tag className="w-3 h-3 text-slate-300 shrink-0" />
          <span>Direct list (no filters)</span>
        </div>
      );
    }

    const firstRule = rules[0];
    const firstVal = formatRuleValue(firstRule);
    const summaryFirst = `${formatFieldLabel(firstRule.field)} ${formatOperatorLabel(firstRule.operator)} ${
      firstVal ? (firstVal.length > 18 ? firstVal.slice(0, 16) + "…" : firstVal) : ""
    }`;

    return (
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-medium">
          <Filter className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
          <span className="font-semibold">{rules.length} {rules.length === 1 ? "filter" : "filters"}</span>
        </span>
        <span
          className="text-slate-600 truncate max-w-[210px] bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md font-mono text-[10px]"
          title={rules.map((r) => `${formatFieldLabel(r.field)} ${formatOperatorLabel(r.operator)} ${formatRuleValue(r)}`).join(" | ")}
        >
          {summaryFirst}
          {rules.length > 1 && <span className="text-indigo-600 font-sans font-semibold ml-1">+{rules.length - 1} more</span>}
        </span>
      </div>
    );
  }

  // 2. BANNER VARIANT (For leads queue tab top header)
  if (variant === "banner") {
    if (!hasFilters) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>This campaign was loaded directly from CSV / Sheet without dynamic audience segment rules.</span>
          </div>
          {onRefineClick && (
            <button
              onClick={onRefineClick}
              className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Add Audience Filters →
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-xs font-bold text-slate-900">
              Active Audience Filter Rules ({rules.length})
            </span>
            <span className="text-[10px] text-indigo-600 bg-indigo-100/80 font-medium px-2 py-0.5 rounded-full">
              Matched from CRM
            </span>
          </div>
          {onRefineClick && (
            <button
              onClick={onRefineClick}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
            >
              Refine Targeting →
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rules.map((rule, idx) => {
            const val = formatRuleValue(rule);
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-indigo-200/70 text-xs shadow-2xs"
              >
                <span className="font-semibold text-slate-800">{formatFieldLabel(rule.field)}</span>
                <span className="text-indigo-600 font-mono text-[11px] font-bold">{formatOperatorLabel(rule.operator)}</span>
                {val && (
                  <span className="bg-indigo-50 text-indigo-900 font-mono font-medium px-1.5 py-0.5 rounded text-[11px]">
                    {val}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // 3. OVERVIEW CARD VARIANT (For Campaign Overview tab)
  if (variant === "card") {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Audience Targeting &amp; Filters</h3>
              <p className="text-xs text-slate-500">
                Contact segmentation criteria evaluated to enroll leads into this campaign
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                hasFilters
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              {hasFilters ? `${rules.length} Rules Active` : "Direct / Manual Import"}
            </span>
            {onRefineClick && (
              <button
                onClick={onRefineClick}
                className="px-3 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
              >
                Refine / Add Leads
              </button>
            )}
          </div>
        </div>

        {hasFilters ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {rules.map((rule, idx) => {
                const val = formatRuleValue(rule);
                const isMulti = rule.operator === "in" && rule.values && rule.values.length > 1;

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/70 hover:bg-white hover:border-indigo-200 transition-colors shadow-2xs flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-800">{formatFieldLabel(rule.field)}</span>
                      <span className="text-[10px] font-mono uppercase font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                        {rule.operator.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="text-xs pt-1">
                      {isMulti ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {rule.values!.map((v, vIdx) => (
                            <span
                              key={vIdx}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-mono text-[11px]"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : val ? (
                        <div className="flex items-center gap-1.5 font-mono text-slate-800 bg-white border border-slate-200 px-2 py-1 rounded text-[11px]">
                          <span className="text-indigo-600 font-bold">{formatOperatorLabel(rule.operator)}</span>
                          <span className="truncate">{val}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">{formatOperatorLabel(rule.operator)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 text-xs text-slate-500 border-t border-slate-100">
              <span className="flex items-center gap-1 text-[11px]">
                <Sparkles className="w-3 h-3 text-indigo-500" />
                Leads are enrolled automatically when they meet all criteria above.
              </span>
              {totalLeads !== undefined && (
                <span className="font-mono text-slate-700 font-semibold text-[11px]">
                  {totalLeads.toLocaleString()} leads enqueued
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
            <p className="text-xs font-semibold text-slate-700">No audience filters applied to this campaign</p>
            <p className="text-[11px] text-slate-500">
              Leads were enqueued directly via CSV, XLSX, or Google Sheets file import.
            </p>
          </div>
        )}
      </div>
    );
  }

  // 4. DRAWER VARIANT (For homepage table expandable drawer)
  return (
    <div className="p-3.5 rounded-lg bg-indigo-50/40 border border-indigo-100/80 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          <h5 className="font-bold text-xs text-slate-900">Audience Targeting Filters Applied</h5>
          <span className="text-[10px] text-slate-500">
            ({rules.length} {rules.length === 1 ? "rule" : "rules"})
          </span>
        </div>
        {hasFilters ? (
          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> CRM Segment Active
          </span>
        ) : (
          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            Direct File Upload
          </span>
        )}
      </div>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {rules.map((rule, idx) => {
            const val = formatRuleValue(rule);
            return (
              <div
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-indigo-200/80 text-xs shadow-2xs"
              >
                <span className="font-semibold text-slate-800">{formatFieldLabel(rule.field)}</span>
                <span className="text-indigo-600 font-mono font-bold text-[11px]">
                  {formatOperatorLabel(rule.operator)}
                </span>
                {val && (
                  <span className="bg-indigo-50/80 text-indigo-900 font-mono font-medium px-1.5 py-0.5 rounded text-[11px] max-w-[200px] truncate" title={val}>
                    {val}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">
          No dynamic CRM filters were configured for this campaign. Leads were uploaded via CSV/Excel or Google Sheets.
        </p>
      )}
    </div>
  );
}
