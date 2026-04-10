import json
import os
import hashlib
import urllib.parse
import urllib.request
import urllib.error


HIBP_API_KEY = os.environ.get("HIBP_API_KEY", "")
HIBP_USER_AGENT = os.environ.get("HIBP_USER_AGENT", "hibp-lambda-checker/1.0")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        },
        "body": json.dumps(body)
    }


def check_password(password: str):
    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    url = f"https://api.pwnedpasswords.com/range/{prefix}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": HIBP_USER_AGENT,
            "Add-Padding": "true"
        },
        method="GET"
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")

    count = 0
    for line in body.splitlines():
        parts = line.split(":")
        if len(parts) != 2:
            continue
        returned_suffix, returned_count = parts
        if returned_suffix.upper() == suffix:
            count = int(returned_count)
            break

    return {
        "pwned": count > 0,
        "count": count
    }


def check_email(email: str):
    if not HIBP_API_KEY:
        return response(500, {"error": "HIBP_API_KEY is not configured on the Lambda function."})

    encoded_email = urllib.parse.quote(email.strip())
    url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{encoded_email}?truncateResponse=false"

    req = urllib.request.Request(
        url,
        headers={
            "hibp-api-key": HIBP_API_KEY,
            "user-agent": HIBP_USER_AGENT,
            "Accept": "application/json"
        },
        method="GET"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            breaches = json.loads(body)
            return response(200, {
                "pwned": True,
                "breachCount": len(breaches),
                "breaches": breaches
            })

    except urllib.error.HTTPError as e:
        status = e.code

        # HIBP uses 404 when no breach is found for this email
        if status == 404:
            return response(200, {
                "pwned": False,
                "breachCount": 0,
                "breaches": []
            })

        error_body = e.read().decode("utf-8", errors="replace")
        retry_after = e.headers.get("retry-after")

        payload = {
            "error": f"HIBP email lookup failed with status {status}.",
            "details": error_body
        }

        if retry_after:
            payload["retryAfter"] = retry_after

        return response(status, payload)

    except Exception as e:
        return response(500, {"error": f"Unexpected error during email check: {str(e)}"})


def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if method == "OPTIONS":
        return response(200, {"ok": True})

    if method != "POST":
        return response(405, {"error": "Method not allowed. Use POST."})

    try:
        body = event.get("body", "{}")
        if event.get("isBase64Encoded"):
            return response(400, {"error": "Base64-encoded requests are not supported."})

        data = json.loads(body)
    except Exception:
        return response(400, {"error": "Invalid JSON body."})

    check_type = (data.get("type") or "").strip().lower()
    value = data.get("value") or ""

    if check_type not in ("email", "password"):
        return response(400, {"error": "type must be either 'email' or 'password'."})

    if not isinstance(value, str) or not value.strip():
        return response(400, {"error": "value must be a non-empty string."})

    value = value.strip()

    try:
        if check_type == "password":
            result = check_password(value)
            return response(200, result)

        return check_email(value)

    except urllib.error.HTTPError as e:
        return response(e.code, {"error": f"Upstream HTTP error: {e.reason}"})
    except Exception as e:
        return response(500, {"error": f"Server error: {str(e)}"})