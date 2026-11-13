"""Manufacturing Intelligence Phase 2 write APIs (material allocation, plan revisions, line assignments, style SMV).

mfg_intelligence/ stays read-only (plan section 15 #5); every write endpoint lives here, behind strict tenant flags,
under the same URL prefix /api/v1/mfg-intelligence.
"""
