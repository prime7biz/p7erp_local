"""Structured analysis pipelines (pandas + tenant-scoped SQL)."""

from app.modules.ai_tool.analysis.registry import detect_analysis_type, run_analysis

__all__ = ["detect_analysis_type", "run_analysis"]
