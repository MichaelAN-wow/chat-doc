import logging
import os
from collections.abc import AsyncGenerator
from typing import Any

import litellm

from app.config import settings

logger = logging.getLogger(__name__)


def _configure_litellm() -> None:
    if settings.OLLAMA_API_BASE:
        os.environ["OLLAMA_API_BASE"] = settings.OLLAMA_API_BASE
    if settings.OPENAI_API_KEY:
        os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
    if settings.OPENAI_API_BASE:
        os.environ["OPENAI_API_BASE"] = settings.OPENAI_API_BASE
    if settings.NVIDIA_API_KEY:
        os.environ["NVIDIA_NIM_API_KEY"] = settings.NVIDIA_API_KEY
    if settings.DEEPSEEK_API_KEY:
        os.environ["DEEPSEEK_API_KEY"] = settings.DEEPSEEK_API_KEY
    if settings.ANTHROPIC_API_KEY:
        os.environ["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY
    if settings.GEMINI_API_KEY:
        os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY
    litellm.suppress_debug_info = True


_configure_litellm()

SYSTEM_PROMPT = (
    "You are a document assistant. The passages in the next message are the user's uploaded file.\n"
    "Answer from those passages only. Read across all of them, including Document/Section labels.\n"
    "Prior chat turns may help resolve references; they are not document evidence. "
    "If a prior assistant message conflicts with the passages, trust the passages.\n"
    "When summarizing, cover what the document is, main sections, and key facts from the passages.\n"
    "Connect dates, names, and section titles across passages. "
    "For employment, an end date of Present (or equivalent) means current.\n"
    "Paraphrase. The question does not have to match the file word for word.\n"
    "Cite with plain markers only: [1], [2], [3] — only for passages you used. "
    "Never use line ranges or formats like 【1†L1-L9】.\n"
    "Use only facts in the passages. Do not invent names, numbers, or steps.\n"
    "If the passages support the question, answer it. "
    "If only part is supported, answer that part and name what is missing. "
    "Ignore off-topic passages."
)

REFUSAL_TEXT = "I couldn't find this in the uploaded documents."


def _normalize_nvidia_model(model: str) -> str:
    if model.startswith("openai/"):
        return "nvidia_nim/" + model.removeprefix("openai/")
    if model.startswith("nvidia_nim/"):
        return model
    return f"nvidia_nim/{model}"


def _llm_call_kwargs(override: dict[str, Any] | None = None) -> dict[str, Any]:
    override = override or {}
    provider = (
        override.get("provider") or settings.LLM_PROVIDER or "nvidia"
    ).strip().lower()
    model = (override.get("model") or settings.LLM_MODEL or "").strip()
    base_url = (override.get("base_url") or "").strip() or None

    if provider in {"nvidia", "nvidia_nim"}:
        model = _normalize_nvidia_model(model or "nvidia/nemotron-3.5-bolt-e4b")
        return {
            "model": model,
            "api_key": settings.NVIDIA_API_KEY or settings.OPENAI_API_KEY,
            "api_base": base_url
            or settings.NVIDIA_API_BASE
            or "https://integrate.api.nvidia.com/v1",
        }

    if provider == "deepseek":
        return {
            "model": model or "deepseek/deepseek-flash",
            "api_key": settings.DEEPSEEK_API_KEY or settings.OPENAI_API_KEY,
        }

    if provider == "ollama":
        ollama_model = model or "llama3.1"
        if not ollama_model.startswith("ollama/"):
            ollama_model = f"ollama/{ollama_model}"
        return {
            "model": ollama_model,
            "api_base": base_url or settings.OLLAMA_API_BASE,
        }

    if provider == "anthropic":
        anth_model = model or "claude-sonnet-4-5"
        if not anth_model.startswith("anthropic/"):
            anth_model = f"anthropic/{anth_model}"
        return {
            "model": anth_model,
            "api_key": settings.ANTHROPIC_API_KEY,
        }

    if provider in {"google", "gemini"}:
        gem_model = model or "gemini-2.5-flash"
        if not gem_model.startswith("gemini/"):
            gem_model = f"gemini/{gem_model}"
        return {
            "model": gem_model,
            "api_key": settings.GEMINI_API_KEY,
        }

    if provider == "azure-openai":
        return {
            "model": f"azure/{model}" if model and not model.startswith("azure/") else (model or "azure/gpt-4o"),
            "api_key": settings.OPENAI_API_KEY,
            "api_base": base_url or settings.OPENAI_API_BASE,
        }

    if provider == "groq":
        groq_model = model or "openai/openai/gpt-oss-120b"
        return {
            "model": groq_model,
            "api_key": settings.OPENAI_API_KEY,
            "api_base": base_url or settings.OPENAI_API_BASE or "https://api.groq.com/openai/v1",
        }

    openai_model = model or "gpt-4o-mini"
    kwargs: dict[str, Any] = {
        "model": openai_model,
        "api_key": settings.OPENAI_API_KEY,
    }
    resolved_base = base_url or settings.OPENAI_API_BASE
    if resolved_base:
        kwargs["api_base"] = resolved_base
    return kwargs


def _provider_needs_key(provider: str) -> bool:
    return provider not in {"ollama"}


def _short_error(exc: Exception) -> str:
    text = str(exc).replace("\n", " ").strip()
    return text[:300] if text else exc.__class__.__name__


async def complete_llm(
    messages: list[dict],
    *,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    override: dict[str, Any] | None = None,
) -> str:
    kwargs = _llm_call_kwargs(override)
    provider = (override or {}).get("provider") or settings.LLM_PROVIDER or "nvidia"
    if not kwargs.get("api_key") and _provider_needs_key(str(provider).lower()):
        raise RuntimeError("LLM API key is missing for the selected provider.")
    call: dict[str, Any] = {
        "messages": messages,
        "temperature": temperature,
        "stream": False,
        **kwargs,
    }
    if max_tokens:
        call["max_tokens"] = max_tokens
    response = await litellm.acompletion(**call)
    return response.choices[0].message.content or ""


async def stream_llm_response(
    messages: list[dict],
    *,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    override: dict[str, Any] | None = None,
) -> AsyncGenerator[str, None]:
    provider = ((override or {}).get("provider") or settings.LLM_PROVIDER or "nvidia").strip().lower()
    model = ((override or {}).get("model") or settings.LLM_MODEL or "").strip()
    try:
        kwargs = _llm_call_kwargs(override)
        if not kwargs.get("api_key") and _provider_needs_key(provider):
            yield (
                "\n\n[Error: LLM API key is missing for provider="
                f"{provider}. Set the server key in .env and recreate backend.]"
            )
            return

        call: dict[str, Any] = {
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            **kwargs,
        }
        if max_tokens:
            call["max_tokens"] = max_tokens

        response = await litellm.acompletion(**call)
        async for part in response:
            token = part.choices[0].delta.content
            if token:
                yield token
    except Exception as exc:
        logger.exception("LLM streaming error")
        yield (
            "\n\n[Error: Failed to get response from LLM. "
            f"provider={provider} model={model or settings.LLM_MODEL} detail={_short_error(exc)}]"
        )
