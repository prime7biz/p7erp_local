"""Inventory API enum literals (go-live remediation Phase 5)."""

from typing import Literal

MovementType = Literal["IN", "OUT", "ADJUST"]

ProcessType = Literal["KNITTING", "DYEING", "FINISHING", "CUTTING", "WASHING", "PRINTING"]

ProcessCostType = Literal["ADD_ON", "PROCESSING", "MATERIAL", "OTHER"]
