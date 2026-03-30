"""Human-readable labels for Customer AI audit log rows (UI + API)."""

from __future__ import annotations

from typing import Any


def customer_ai_event_label(action: str, dj: dict[str, Any]) -> str:
    phase = dj.get("phase")
    atype = dj.get("action_type")
    if action == "CUSTOMER_AI_SUGGESTION_BATCH":
        if phase == "trace_result" and isinstance(atype, str):
            return {
                "validate": "Validation result recorded",
                "dedupe": "Duplicate review recorded",
                "summary": "Summary snapshot recorded",
                "next_actions": "Next actions recorded",
            }.get(atype, f"AI trace ({atype})")
        if phase == "generated" and atype == "extract":
            return "Extract suggestion batch created"
        if phase == "generated" and atype == "enrich":
            return "Enrich suggestion batch created"
    if action == "CUSTOMER_AI_SUGGESTION_MARKED":
        return "Suggestion decisions marked"
    if action == "CUSTOMER_AI_SUGGESTION_APPLY":
        return "Selected fields applied to customer"
    if action == "CUSTOMER_AI_SUGGESTION_DISCARD":
        return "Suggestion batch discarded"
    if action == "CUSTOMER_AI_SUGGESTION_FINALIZE_CREATE":
        return "Finalize after create (audit)"
    if action == "CUSTOMER_AI_SUGGESTION_LINK":
        return "Batch linked to customer"
    if action == "CUSTOMER_AI_VALIDATE":
        return "Validate profile run"
    if action == "CUSTOMER_AI_DEDUPE":
        return "Duplicate scan run"
    if action == "CUSTOMER_AI_SUMMARY":
        return "Summary generated"
    if action == "CUSTOMER_AI_NEXT_ACTIONS":
        return "Next actions generated"
    if action == "CUSTOMER_AI_ENRICH":
        return "Enrich run"
    if action == "CUSTOMER_AI_EXTRACT" or action == "CUSTOMER_AI_EXTRACT_DOCUMENT":
        return "Document extract run"
    return action.replace("_", " ").title()


def vendor_ai_event_label(action: str, dj: dict[str, Any]) -> str:
    phase = dj.get("phase")
    atype = dj.get("action_type")
    if action == "VENDOR_AI_SUGGESTION_BATCH":
        if phase == "trace_result" and isinstance(atype, str):
            return {
                "validate": "Supplier validation recorded",
                "dedupe": "Supplier duplicate scan recorded",
                "summary": "Supplier summary recorded",
                "next_actions": "Supplier next actions recorded",
            }.get(atype, f"Supplier AI trace ({atype})")
        if phase == "generated" and atype == "extract":
            return "Supplier extract batch created"
        if phase == "generated" and atype == "enrich":
            return "Supplier enrich batch created"
    if action == "VENDOR_AI_SUGGESTION_MARKED":
        return "Supplier suggestion decisions marked"
    if action == "VENDOR_AI_SUGGESTION_APPLY":
        return "Supplier fields applied to vendor"
    if action == "VENDOR_AI_SUGGESTION_DISCARD":
        return "Supplier suggestion batch discarded"
    if action == "VENDOR_AI_SUGGESTION_FINALIZE_CREATE":
        return "Supplier finalize after create"
    if action == "VENDOR_AI_SUGGESTION_LINK":
        return "Batch linked to vendor"
    if action == "VENDOR_AI_VALIDATE":
        return "Supplier validate run"
    if action == "VENDOR_AI_DEDUPE":
        return "Supplier dedupe run"
    if action == "VENDOR_AI_SUMMARY":
        return "Supplier summary run"
    if action == "VENDOR_AI_NEXT_ACTIONS":
        return "Supplier next actions run"
    if action == "VENDOR_AI_ENRICH":
        return "Supplier enrich run"
    if action in ("VENDOR_AI_EXTRACT", "VENDOR_AI_EXTRACT_DOCUMENT"):
        return "Supplier document extract run"
    return action.replace("_", " ").title()


def inquiry_ai_event_label(action: str, dj: dict[str, Any]) -> str:
    phase = dj.get("phase")
    atype = dj.get("action_type")
    if action == "INQUIRY_AI_SUGGESTION_BATCH":
        if phase == "trace_result" and isinstance(atype, str):
            return {
                "validate": "Inquiry validation recorded",
                "dedupe": "Duplicate inquiry scan recorded",
                "summary": "Inquiry summary recorded",
                "next_actions": "Inquiry next actions recorded",
            }.get(atype, f"Inquiry AI trace ({atype})")
        if phase == "generated" and atype == "extract":
            return "Inquiry extract batch created"
        if phase == "generated" and atype == "enrich":
            return "Inquiry enrich batch created"
    if action == "INQUIRY_AI_SUGGESTION_MARKED":
        return "Inquiry suggestion decisions marked"
    if action == "INQUIRY_AI_SUGGESTION_APPLY":
        return "Inquiry fields applied"
    if action == "INQUIRY_AI_SUGGESTION_DISCARD":
        return "Inquiry suggestion batch discarded"
    if action == "INQUIRY_AI_SUGGESTION_FINALIZE_CREATE":
        return "Inquiry finalize after create"
    if action == "INQUIRY_AI_SUGGESTION_LINK":
        return "Batch linked to inquiry"
    if action == "INQUIRY_AI_VALIDATE":
        return "Inquiry validate run"
    if action == "INQUIRY_AI_DEDUPE":
        return "Inquiry dedupe run"
    if action == "INQUIRY_AI_SUMMARY":
        return "Inquiry summary run"
    if action == "INQUIRY_AI_NEXT_ACTIONS":
        return "Inquiry next actions run"
    if action == "INQUIRY_AI_ENRICH":
        return "Inquiry enrich run"
    if action in ("INQUIRY_AI_EXTRACT", "INQUIRY_AI_EXTRACT_DOCUMENT"):
        return "Inquiry document extract run"
    return action.replace("_", " ").title()


def quotation_ai_event_label(action: str, dj: dict[str, Any]) -> str:
    phase = dj.get("phase")
    atype = dj.get("action_type")
    if action == "QUOTATION_AI_SUGGESTION_BATCH":
        if phase == "trace_result" and isinstance(atype, str):
            return {
                "validate": "Quotation validation recorded",
                "dedupe": "Duplicate quotation scan recorded",
                "summary": "Quotation summary recorded",
                "next_actions": "Quotation next actions recorded",
            }.get(atype, f"Quotation AI trace ({atype})")
        if phase == "generated" and atype == "extract":
            return "Quotation extract batch created"
        if phase == "generated" and atype == "enrich":
            return "Quotation enrich batch created"
    if action == "QUOTATION_AI_SUGGESTION_MARKED":
        return "Quotation suggestion decisions marked"
    if action == "QUOTATION_AI_SUGGESTION_APPLY":
        return "Quotation fields applied"
    if action == "QUOTATION_AI_SUGGESTION_DISCARD":
        return "Quotation suggestion batch discarded"
    if action == "QUOTATION_AI_SUGGESTION_FINALIZE_CREATE":
        return "Quotation finalize after create"
    if action == "QUOTATION_AI_SUGGESTION_LINK":
        return "Batch linked to quotation"
    if action == "QUOTATION_AI_VALIDATE":
        return "Quotation validate run"
    if action == "QUOTATION_AI_DEDUPE":
        return "Quotation dedupe run"
    if action == "QUOTATION_AI_SUMMARY":
        return "Quotation summary run"
    if action == "QUOTATION_AI_NEXT_ACTIONS":
        return "Quotation next actions run"
    if action == "QUOTATION_AI_ENRICH":
        return "Quotation enrich run"
    if action in ("QUOTATION_AI_EXTRACT", "QUOTATION_AI_EXTRACT_DOCUMENT"):
        return "Quotation document extract run"
    if action == "QUOTATION_COSTING_COMPLETENESS_CHECK":
        return "Costing completeness check (read-only)"
    if action == "QUOTATION_COSTING_ANOMALY_SCAN":
        return "Costing anomaly scan (read-only)"
    if action == "QUOTATION_COSTING_MARGIN_RISK":
        return "Margin risk explanation (read-only)"
    if action == "QUOTATION_COSTING_FX_SENSITIVITY":
        return "FX sensitivity summary (read-only)"
    if action == "QUOTATION_COSTING_SUMMARY":
        return "Costing summary (read-only)"
    if action == "QUOTATION_COSTING_NEXT_ACTIONS":
        return "Costing next actions (read-only)"
    if action == "QUOTATION_COSTING_SUGGESTIONS_GENERATE":
        return "Costing line suggestions generated (review mode)"
    if action == "QUOTATION_COSTING_SUGGESTIONS_MARKED":
        return "Costing suggestion decisions marked"
    if action == "QUOTATION_COSTING_SUGGESTIONS_APPLY":
        return "Costing suggestions applied to lines"
    if action == "QUOTATION_COSTING_SUGGESTIONS_DISCARD":
        return "Costing suggestion batch discarded"
    if action == "QUOTATION_COST_BENCHMARK":
        return "Cost benchmark vs history (advisory)"
    return action.replace("_", " ").title()


def order_ai_event_label(action: str, dj: dict[str, Any]) -> str:
    phase = dj.get("phase")
    atype = dj.get("action_type")
    if action == "ORDER_AI_SUGGESTION_BATCH":
        if phase == "trace_result" and isinstance(atype, str):
            return {
                "validate": "Order validation recorded",
                "validate_execution": "Execution readiness validation recorded",
                "planning_risk_check": "Planning risk check recorded",
                "atp_ctp_summary": "ATP/CTP summary recorded",
                "dedupe": "Overlapping order scan recorded",
                "summary": "Order summary recorded",
                "next_actions": "Order next actions recorded",
                "capacity_bottleneck_scan": "Capacity bottleneck scan recorded",
                "what_if_simulation": "What-if simulation recorded",
                "promise_sensitivity_check": "Promise sensitivity check recorded",
                "planning_summary": "Execution planning summary recorded",
            }.get(atype, f"Order AI trace ({atype})")
        if phase == "generated" and atype == "extract":
            return "Order extract batch created"
        if phase == "generated" and atype == "enrich":
            return "Order enrich batch created"
    if action == "ORDER_AI_SUGGESTION_MARKED":
        return "Order suggestion decisions marked"
    if action == "ORDER_AI_SUGGESTION_APPLY":
        return "Order fields applied"
    if action == "ORDER_AI_SUGGESTION_DISCARD":
        return "Order suggestion batch discarded"
    if action == "ORDER_AI_SUGGESTION_FINALIZE_CREATE":
        return "Order finalize after create"
    if action == "ORDER_AI_SUGGESTION_LINK":
        return "Batch linked to order"
    if action == "ORDER_AI_VALIDATE":
        return "Order validate run"
    if action == "ORDER_AI_VALIDATE_EXECUTION":
        return "Execution readiness validation run"
    if action == "ORDER_AI_PLANNING_RISK_CHECK":
        return "Planning risk check run"
    if action == "ORDER_AI_ATP_CTP_SUMMARY":
        return "ATP/CTP summary run"
    if action == "ORDER_AI_DEDUPE":
        return "Order dedupe run"
    if action == "ORDER_AI_SUMMARY":
        return "Order summary run"
    if action == "ORDER_AI_NEXT_ACTIONS":
        return "Order next actions run"
    if action == "ORDER_AI_CAPACITY_BOTTLENECK_SCAN":
        return "Capacity bottleneck scan run"
    if action == "ORDER_AI_WHAT_IF_SIMULATION":
        return "What-if planning simulation run"
    if action == "ORDER_AI_PROMISE_SENSITIVITY_CHECK":
        return "Promise sensitivity check run"
    if action == "ORDER_AI_EXECUTION_PLANNING_SUMMARY":
        return "Execution planning summary run"
    if action == "ORDER_AI_ENRICH":
        return "Order enrich run"
    if action in ("ORDER_AI_EXTRACT", "ORDER_AI_EXTRACT_DOCUMENT"):
        return "Order document extract run"
    return action.replace("_", " ").title()
