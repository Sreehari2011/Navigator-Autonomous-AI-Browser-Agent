import requests
import json
import logging
import re
import os
from dotenv import load_dotenv

load_dotenv()

base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1/chat/completions")
api_key = os.getenv("LLM_API_KEY", "")
DEFAULT_MODEL = os.getenv("MODEL_EXECUTOR", "gpt-4o-mini")

def query_ollama(prompt, model=DEFAULT_MODEL):
    """
    Send a prompt to the LLM API and return the response.
    """
    if not api_key:
        logging.error("CRITICAL: LLM_API_KEY is not set in the environment.")
        return None

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "stream": False
    }

    try:
        logging.info(f"Sending prompt to LLM: {model} | Endpoint: {base_url}")
        response = requests.post(base_url, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()

        model_response = result.get('choices', [{}])[0].get('message', {}).get('content', '')
        if not model_response.strip():
            logging.warning("API returned successful status but the response content is empty")
            return None

        return model_response

    except requests.exceptions.Timeout as e:
        logging.error(f"API request timed out: {e}")
        return None
    except requests.exceptions.HTTPError as e:
        logging.error(f"API request failed with HTTP status: {e.response.status_code} - {e.response.text}")
        return None
    except requests.RequestException as e:
        logging.error(f"API request failed with a network error: {e}")
        return None
    except json.JSONDecodeError:
        logging.error(f"Failed to decode JSON from API response. Response text: {response.text}")
        return None

def generate_json_with_ollama(prompt, max_retries=3, model=DEFAULT_MODEL):
    """
    Generate JSON output using a text-based LLM.
    Includes a self-correction loop for invalid JSON.
    """
    current_prompt = prompt

    for attempt in range(max_retries):
        logging.info(f"Generating JSON (Attempt {attempt + 1}/{max_retries})...")

        response = query_ollama(current_prompt, model=model)

        if not response:
            logging.warning(f"LLM returned an empty response on attempt {attempt + 1}")
            continue

        try:
            json_match = re.search(r'\{.*\}|\[.*\]', response, re.DOTALL)
            if not json_match:
                raise json.JSONDecodeError("No JSON object/array found.", response, 0)

            json_str = json_match.group(0)
            parsed = json.loads(json_str)

            if isinstance(parsed, list) and len(parsed) == 1 and isinstance(parsed[0], dict):
                return parsed[0]

            return parsed

        except json.JSONDecodeError as e:
            logging.warning(f"Generated JSON failed syntax check: {e}")
            if attempt < max_retries - 1:
                logging.info("Attempting to self-correct the JSON...")
                current_prompt = (
                    "You are an expert at fixing malformed JSON. The following string you provided is invalid. "
                    "Please correct the syntax (e.g., add missing commas, fix quotes) and return ONLY the valid JSON object or array.\n\n"
                    f"SYNTAX ERROR: {e}\n\n"
                    f"INVALID JSON: {response}"
                )
            else:
                logging.error("Failed to generate valid JSON after multiple retries.")
                return None

    return None