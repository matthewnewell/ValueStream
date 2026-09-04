"""
AI client — routes to Claude (cloud), Gemini (cloud API key or Google Cloud/ADC), or Ollama
(on-premise) based on the AI_PROVIDER env var.

Ported ~verbatim from BurnedValue's ai_client.py (same author's sibling project) to keep the
same on-prem-friendly, AI-optional posture: AI is off by default, and the app must work fully
without it configured. Gemini added the same way Ollama was: a plain httpx REST call, no new
SDK dependency, since httpx is already required.

Gemini has two auth paths, tried in order — this matters in a target environment that has no
route to github.com/pypi credentials or a distributable API key, only Google Cloud access:
  1. AI_API_KEY set → direct REST call to the Google AI Studio endpoint (unchanged behavior).
  2. AI_API_KEY unset → Google Cloud via the official `google-genai` SDK, authenticated with
     Application Default Credentials (a mounted service-account key, `gcloud auth
     application-default login`, or a GCE/Cloud Run metadata server) instead of a shareable
     key. Requires GOOGLE_CLOUD_PROJECT to be set.

Usage:
    from ai_client import chat, chat_json
    reply = chat(messages=[{"role": "user", "content": "..."}], system="...")
    data  = chat_json(messages=[...], system="...")   # dict, or {"error": "..."} on failure

Environment variables:
    AI_PROVIDER   : "claude" | "gemini" | "ollama" | "none"  (default: "none")
    AI_API_KEY    : Anthropic API key (Claude) or Google AI Studio API key (Gemini, optional —
                    omit to use Google Cloud/ADC instead)
    AI_BASE_URL   : Ollama base URL, e.g. http://localhost:11434 (Ollama only)
    AI_MODEL      : Model name. Defaults: claude→claude-opus-4-5, gemini→gemini-2.5-flash,
                    ollama→llama3

    Gemini via Google Cloud (only used when AI_API_KEY is unset):
    GOOGLE_CLOUD_PROJECT      : GCP project id (required for this path)
    GOOGLE_CLOUD_LOCATION     : Google Cloud region (default: "us-central1")
    GOOGLE_APPLICATION_CREDENTIALS : path to a service-account key JSON (optional — omit to
                    fall back to gcloud user ADC or a metadata server, per google-auth's
                    normal default-credential discovery)
"""

import json
import os
import re

AI_PROVIDER  = os.environ.get("AI_PROVIDER",  "none").lower()
AI_API_KEY   = os.environ.get("AI_API_KEY",   "")
AI_BASE_URL  = os.environ.get("AI_BASE_URL",  "http://localhost:11434")
AI_MODEL     = os.environ.get("AI_MODEL",     "")

NOT_CONFIGURED_MESSAGE = (
    "AI is not configured for this instance. "
    "Set AI_PROVIDER to 'claude', 'gemini', or 'ollama' in your environment or docker-compose.yml."
)
_NOT_CONFIGURED = NOT_CONFIGURED_MESSAGE  # internal alias used below


def is_configured() -> bool:
    return AI_PROVIDER in ("claude", "gemini", "ollama")


def chat(messages: list[dict], system: str = "", max_tokens: int = 1024) -> str:
    """
    Send a conversation to the configured AI and return the reply text.

    messages:   list of {"role": "user"|"assistant", "content": "..."}
    system:     optional system prompt
    max_tokens: token ceiling for the response (default 1024; use 4096 for extraction)
    """
    if AI_PROVIDER == "claude":
        return _claude(messages, system, max_tokens)
    elif AI_PROVIDER == "gemini":
        return _gemini(messages, system, max_tokens)
    elif AI_PROVIDER == "ollama":
        return _ollama(messages, system)
    else:
        return _NOT_CONFIGURED


def chat_json(messages: list[dict], system: str = "", max_tokens: int = 1024) -> dict:
    """
    Like chat(), but instructs the model to reply with a single JSON object and parses it.

    Returns the parsed dict on success, or {"error": "<message>"} on failure (not configured,
    request failure, or a reply that didn't contain valid JSON). No tool-calling/structured
    output API is used, to stay consistent with the plain string-based chat() wrapper above —
    this leniently extracts the first {...} block from the reply instead.
    """
    if not is_configured():
        return {"error": _NOT_CONFIGURED}

    json_system = (
        (system + "\n\n" if system else "")
        + "Respond with ONLY a single JSON object — no prose, no markdown code fences, "
        "no explanation before or after it."
    )
    reply = chat(messages, system=json_system, max_tokens=max_tokens)

    match = re.search(r"\{.*\}", reply, re.DOTALL)
    if not match:
        return {"error": f"AI reply did not contain a JSON object: {reply[:200]}"}

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as e:
        return {"error": f"AI reply contained malformed JSON: {e}"}


# ── Claude ────────────────────────────────────────────────────────────────────

_anthropic_client = None

def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        try:
            import anthropic
        except ImportError:
            return None
        _anthropic_client = anthropic.Anthropic(api_key=AI_API_KEY)
    return _anthropic_client


def _claude(messages: list[dict], system: str, max_tokens: int = 1024) -> str:
    client = _get_anthropic_client()
    if client is None:
        return "anthropic package not installed. Run: pip install anthropic"

    model = AI_MODEL or "claude-opus-4-5"
    kwargs = dict(model=model, max_tokens=max_tokens, messages=messages)
    if system:
        kwargs["system"] = system

    try:
        response = client.messages.create(**kwargs, timeout=120)
        return response.content[0].text
    except Exception as e:
        return f"[AI error: {e}]"


# ── Gemini ────────────────────────────────────────────────────────────────────

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_genai_client = None


def _get_genai_client():
    """
    Lazily build a Gemini client authenticated via Application Default Credentials — no API
    key travels with the app, so this is the path for a target environment that can reach
    Google Cloud but has no distributable Gemini key (and no git access to pull a key out of
    this repo's history, if one were ever committed by mistake).

    Returns None if the `google-genai` SDK isn't installed or GOOGLE_CLOUD_PROJECT isn't set;
    callers fall back to the "not configured" message in that case.
    """
    global _genai_client
    if _genai_client is None:
        try:
            from google import genai
        except ImportError:
            return None

        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        if not project:
            return None
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

        try:
            _genai_client = genai.Client(vertexai=True, project=project, location=location)
        except Exception:
            _genai_client = None
    return _genai_client


def _gemini(messages: list[dict], system: str, max_tokens: int = 1024) -> str:
    model = AI_MODEL or "gemini-2.5-flash"

    # 1. Direct API key → Google AI Studio's public REST endpoint (unchanged from before).
    if AI_API_KEY:
        try:
            import httpx
        except ImportError:
            return "httpx package not installed. Run: pip install httpx"

        # Gemini's wire format differs from Anthropic's: turns are "contents", the model's own
        # prior turns are role "model" (not "assistant"), and each turn's text sits under
        # parts[].text rather than a plain content string. System prompt is a separate top-level
        # field, not a message in the list.
        contents = [
            {
                "role": "model" if m.get("role") == "assistant" else "user",
                "parts": [{"text": m.get("content", "")}],
            }
            for m in messages
        ]
        payload: dict = {"contents": contents, "generationConfig": {"maxOutputTokens": max_tokens}}
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        try:
            # API key goes in a header, not the URL query string, so it never ends up in an
            # access log or a proxy's request-line logging by default.
            r = httpx.post(
                _GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": AI_API_KEY},
                json=payload,
                timeout=120,
            )
            r.raise_for_status()
            data = r.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except httpx.HTTPStatusError as e:
            return f"[AI error: Gemini returned {e.response.status_code}: {e.response.text[:300]}]"
        except Exception as e:
            return f"[AI error: {e}]"

    # 2. No API key → Google Cloud via ADC (service account, gcloud user creds, or a metadata
    # server) through the official google-genai SDK.
    client = _get_genai_client()
    if client is not None:
        try:
            from google.genai import types

            contents = [
                types.Content(
                    role="model" if m.get("role") == "assistant" else "user",
                    parts=[types.Part.from_text(text=m.get("content", ""))],
                )
                for m in messages
            ]
            config = types.GenerateContentConfig(
                max_output_tokens=max_tokens,
                system_instruction=system if system else None,
            )
            resp = client.models.generate_content(model=model, contents=contents, config=config)
            return resp.text
        except Exception as e:
            return f"[AI error: {e}]"

    return (
        "Gemini is not usable: no AI_API_KEY set and no Google Cloud credentials found. "
        "Either set AI_API_KEY, or set GOOGLE_CLOUD_PROJECT plus Application Default "
        "Credentials (GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default "
        "login`)."
    )


# ── Ollama ────────────────────────────────────────────────────────────────────

def _ollama(messages: list[dict], system: str) -> str:
    try:
        import httpx
    except ImportError:
        return "httpx package not installed. Run: pip install httpx"

    model = AI_MODEL or "llama3"
    base  = AI_BASE_URL.rstrip("/")

    # Ollama uses OpenAI-compatible /v1/chat/completions
    payload = {
        "model": model,
        "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        "stream": False,
    }

    try:
        r = httpx.post(f"{base}/v1/chat/completions", json=payload, timeout=60)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except httpx.ConnectError:
        return f"Could not connect to Ollama at {base}. Is it running?"
    except Exception as e:
        return f"Ollama error: {e}"
