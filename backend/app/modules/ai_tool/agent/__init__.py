"""AI chat agent mode: the model chooses read-only ERP tools itself (tenant flag ``ai_agent_mode_enabled``).

- ``catalog.py``  allowlisted read-only tools and their permission gates
- ``history.py``  recent chat messages sent with each question
- ``loop.py``     the OpenRouter tool-calling loop
"""
