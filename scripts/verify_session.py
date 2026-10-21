import sys
import json
import urllib.parse
from instagrapi import Client


def decode_session(s):
    try:
        return urllib.parse.unquote(s)
    except Exception:
        return s


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "session_id missing"}))
        sys.exit(1)

    session_id = decode_session(sys.argv[1])

    try:
        client = Client()
        client.login_by_sessionid(session_id)

        username = getattr(client, "username", None) or "unknown"
        user_id = getattr(client, "user_id", None) or ""

        # ✅ instagrapi settings — session reuse ke liye
        settings = client.get_settings()

        print(json.dumps({
            "success": True,
            "username": username,
            "user_id": str(user_id),
            "settings": settings
        }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    main()
