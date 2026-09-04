"""
Unit tests for ai_client.py's Gemini path. Claude/Ollama aren't covered here (BurnedValue's
own test suite never covered them either) — this specifically exercises the new code path
added when Gemini support was requested, since it's the one most likely to have a wire-format
bug (role names and payload shape differ from Anthropic's) and the one with zero manual
curl-script coverage elsewhere (check_chat.sh only runs against AI_PROVIDER=none).

Also covers the Google Cloud/ADC fallback (used when AI_API_KEY is unset) added for a target
environment that has no shareable API key.

No network calls: httpx.post and the cloud SDK client are monkeypatched so these run without
real credentials.
"""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_client


def _fake_response(json_body, status_code=200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_body
    resp.text = str(json_body)
    if status_code >= 400:
        import httpx
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=resp
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


def test_is_configured_true_for_gemini():
    with patch.object(ai_client, "AI_PROVIDER", "gemini"):
        assert ai_client.is_configured() is True


def test_gemini_maps_assistant_role_to_model_and_parses_reply():
    gemini_response = {"candidates": [{"content": {"parts": [{"text": "the bottleneck is X"}]}}]}

    with patch.object(ai_client, "AI_PROVIDER", "gemini"), \
         patch.object(ai_client, "AI_API_KEY", "fake-key"), \
         patch("httpx.post", return_value=_fake_response(gemini_response)) as mock_post:
        reply = ai_client.chat(
            messages=[
                {"role": "user", "content": "why is lead time long?"},
                {"role": "assistant", "content": "because of wait time"},
                {"role": "user", "content": "which connector?"},
            ],
            system="You are a VSM analyst.",
        )

    assert reply == "the bottleneck is X"

    call_kwargs = mock_post.call_args.kwargs
    assert call_kwargs["headers"]["x-goog-api-key"] == "fake-key"
    payload = call_kwargs["json"]
    roles = [c["role"] for c in payload["contents"]]
    assert roles == ["user", "model", "user"]  # "assistant" -> "model", not left as-is
    assert payload["systemInstruction"]["parts"][0]["text"] == "You are a VSM analyst."
    assert payload["contents"][1]["parts"][0]["text"] == "because of wait time"


def test_gemini_http_error_returns_error_string_not_exception():
    with patch.object(ai_client, "AI_PROVIDER", "gemini"), \
         patch.object(ai_client, "AI_API_KEY", "fake-key"), \
         patch("httpx.post", return_value=_fake_response({"error": "bad key"}, status_code=403)):
        reply = ai_client.chat(messages=[{"role": "user", "content": "hi"}])

    assert "AI error" in reply
    assert "403" in reply


def test_gemini_uses_model_env_override():
    gemini_response = {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}

    with patch.object(ai_client, "AI_PROVIDER", "gemini"), \
         patch.object(ai_client, "AI_API_KEY", "fake-key"), \
         patch.object(ai_client, "AI_MODEL", "gemini-2.5-pro"), \
         patch("httpx.post", return_value=_fake_response(gemini_response)) as mock_post:
        ai_client.chat(messages=[{"role": "user", "content": "hi"}])

    assert "gemini-2.5-pro" in mock_post.call_args.args[0]


def test_gemini_cloud_sdk_path_used_when_no_api_key():
    """No AI_API_KEY set → falls through to the Google Cloud SDK path, not the REST endpoint."""
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.text = "cloud analysis reply"
    mock_client.models.generate_content.return_value = mock_resp

    with patch.object(ai_client, "AI_PROVIDER", "gemini"), \
         patch.object(ai_client, "AI_API_KEY", ""), \
         patch.object(ai_client, "_get_genai_client", return_value=mock_client):
        reply = ai_client.chat(
            messages=[{"role": "user", "content": "analyze stage"}],
            system="VSM expert",
        )

    assert reply == "cloud analysis reply"
    mock_client.models.generate_content.assert_called_once()


def test_get_genai_client_requires_project_env_var():
    """No GOOGLE_CLOUD_PROJECT set → no cloud client, regardless of the SDK being installed."""
    with patch.object(ai_client, "_genai_client", None), \
         patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GOOGLE_CLOUD_PROJECT", None)
        assert ai_client._get_genai_client() is None


def test_gemini_reports_unconfigured_when_no_key_and_no_credentials():
    with patch.object(ai_client, "AI_PROVIDER", "gemini"), \
         patch.object(ai_client, "AI_API_KEY", ""), \
         patch.object(ai_client, "_get_genai_client", return_value=None):
        reply = ai_client.chat(messages=[{"role": "user", "content": "hi"}])

    assert "not usable" in reply
    assert "GOOGLE_CLOUD_PROJECT" in reply
