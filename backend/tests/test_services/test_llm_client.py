from app.services.llm_client import REFUSAL_TEXT, SYSTEM_PROMPT, _llm_call_kwargs, _normalize_nvidia_model


def test_system_prompt_answers_from_passages_without_a_canned_denial():
    lowered = SYSTEM_PROMPT.lower()
    assert "passages" in lowered
    assert "summar" in lowered
    assert "only" in lowered
    assert "couldn't find this in the uploaded documents" not in lowered


def test_refusal_text_is_stable():
    assert REFUSAL_TEXT == "I couldn't find this in the uploaded documents."


def test_normalize_nvidia_model():
    assert _normalize_nvidia_model("nvidia/nemotron-3.5-bolt-e4b") == (
        "nvidia_nim/nvidia/nemotron-3.5-bolt-e4b"
    )
    assert _normalize_nvidia_model("openai/nvidia/foo") == "nvidia_nim/nvidia/foo"
    assert _normalize_nvidia_model("nvidia_nim/nvidia/foo") == "nvidia_nim/nvidia/foo"


def test_llm_call_kwargs_uses_request_override(monkeypatch):
    from app.services import llm_client

    monkeypatch.setattr(llm_client.settings, "NVIDIA_API_KEY", "nvapi-test")
    monkeypatch.setattr(llm_client.settings, "NVIDIA_API_BASE", "https://integrate.api.nvidia.com/v1")
    monkeypatch.setattr(llm_client.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm_client.settings, "LLM_MODEL", "gpt-4o")

    kwargs = _llm_call_kwargs(
        {
            "provider": "nvidia",
            "model": "nvidia/nemotron-3.5-bolt-e4b",
            "base_url": "https://integrate.api.nvidia.com/v1",
        }
    )

    assert kwargs["model"] == "nvidia_nim/nvidia/nemotron-3.5-bolt-e4b"
    assert kwargs["api_key"] == "nvapi-test"
    assert kwargs["api_base"] == "https://integrate.api.nvidia.com/v1"


def test_llm_call_kwargs_openai_override(monkeypatch):
    from app.services import llm_client

    monkeypatch.setattr(llm_client.settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(llm_client.settings, "OPENAI_API_BASE", "")

    kwargs = _llm_call_kwargs(
        {"provider": "openai", "model": "gpt-4o-mini", "base_url": "https://api.openai.com/v1"}
    )

    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["api_key"] == "sk-test"
    assert kwargs["api_base"] == "https://api.openai.com/v1"
