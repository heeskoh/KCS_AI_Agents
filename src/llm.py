"""Central LLM factory.

Configure via .env:
    LLM_PROVIDER   = openai | anthropic | gemini  (default: openai)
    LLM_MODEL      = model name                   (default: provider 별 아래 참고)
    LLM_TEMPERATURE = 0.0~1.0                     (default: 0)

Provider defaults:
    openai    → gpt-5.6-terra
    anthropic → claude-sonnet-4-6
    gemini    → gemini-2.0-flash
"""

import os

from dotenv import load_dotenv

load_dotenv()

_PROVIDER    = os.getenv("LLM_PROVIDER", "openai").lower().strip()
_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0"))

_DEFAULTS = {
    "openai":    "gpt-5.6-terra",
    "anthropic": "claude-sonnet-4-6",
    "gemini":    "gemini-2.0-flash",
}
_MODEL = os.getenv("LLM_MODEL") or _DEFAULTS.get(_PROVIDER, "gpt-5.6-terra")


def get_llm():
    """Return a configured LangChain chat model, or None if dependencies are missing."""
    if _PROVIDER == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(model=_MODEL, temperature=_TEMPERATURE)
        except (ModuleNotFoundError, Exception) as exc:
            print(f"[LLM] Anthropic 초기화 실패: {exc}")
            return None

    if _PROVIDER == "gemini":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(model=_MODEL, temperature=_TEMPERATURE)
        except (ModuleNotFoundError, Exception) as exc:
            print(f"[LLM] Gemini 초기화 실패: {exc}")
            return None

    # default: openai
    try:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=_MODEL, temperature=_TEMPERATURE)
    except (ModuleNotFoundError, Exception) as exc:
        print(f"[LLM] OpenAI 초기화 실패: {exc}")
        return None


# 외부에서 참조 가능한 현재 모델/프로바이더 이름 (llm_mode 결과 표기 등에 사용)
MODEL_NAME = _MODEL
PROVIDER_NAME = _PROVIDER


# Singleton — imported once per process
llm = get_llm()

print(
    f"[LLM] provider={_PROVIDER}  model={_MODEL}  "
    f"temperature={_TEMPERATURE}  available={'Yes' if llm else 'No (fallback mode)'}"
)
