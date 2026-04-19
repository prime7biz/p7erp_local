from app.common.openrouter_connectivity import is_openrouter_connection_escalation_tool


def test_connection_escalation_tool_aliases():
    assert is_openrouter_connection_escalation_tool("check_openrouter_connection")
    assert is_openrouter_connection_escalation_tool("check-openrouter-connection")
    assert is_openrouter_connection_escalation_tool("get_open_router_connection")
    assert is_openrouter_connection_escalation_tool("openrouter_connection")
    assert is_openrouter_connection_escalation_tool("verify_openrouter_connection")
    assert not is_openrouter_connection_escalation_tool("create_sales_inquiry")
    assert not is_openrouter_connection_escalation_tool(None)
    assert not is_openrouter_connection_escalation_tool("")
