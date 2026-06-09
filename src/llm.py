"""Central LLM factory.

Configure via .env:
    LLM_PROVIDER   = openai | anthropic        (default: openai)
    LLM_MODEL      = model name                (default: provider 별 아래 참고)
    LLM_TEMPERATURE = 0.0~1.0                  (default: 0)

Provider defaults:
    openai    → gpt-4o
    anthropic → claude-opus-4-7
"""

import os

from dotenv import load_dotenv

load_dotenv()

_PROVIDER    = os.getenv("LLM_PROVIDER", "openai").lower().strip()
_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0"))

_DEFAULTS = {
    "openai":    "gpt-4o",
    "anthropic": "claude-opus-4-7",
}
_MODEL = os.getenv("LLM_MODEL") or _DEFAULTS.get(_PROVIDER, "gpt-4o")


def get_llm():
    """Return a configured LangChain chat model, or None if dependencies are missing."""
    if _PROVIDER == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(model=_MODEL, temperature=_TEMPERATURE)
        except (ModuleNotFoundError, Exception) as exc:
            print(f"[LLM] Anthropic 초기화 실패: {exc}")
            return None

    # default: openai
    try:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=_MODEL, temperature=_TEMPERATURE)
    except (ModuleNotFoundError, Exception) as exc:
        print(f"[LLM] OpenAI 초기화 실패: {exc}")
        return None


# Singleton — imported once per process
llm = get_llm()

print(
    f"[LLM] provider={_PROVIDER}  model={_MODEL}  "
    f"temperature={_TEMPERATURE}  available={'Yes' if llm else 'No (fallback mode)'}"
)
