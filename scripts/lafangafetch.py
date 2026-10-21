# FORM_CONFIG: {"displayName": "sinsiters FETCH", "icon": "📡", "description": "Fetch all GC links to groups.txt", "tags": ["Fetch All", "Save File"], "fields": []}

import urllib.parse
import os
import sys
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, RateLimitError


SESSION_FILE = os.environ.get("SESSION_FILE", "")
GROUPS_FILE = os.environ.get("GROUPS_FILE", "groups.txt")

PURPLE = "\033[95m"
BLUE   = "\033[94m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def ok(msg):    print(f"{GREEN}✅ {msg}{RESET}", flush=True)
def info(msg):  print(f"{BLUE}ℹ️  {msg}{RESET}", flush=True)
def err(msg):   print(f"{RED}❌ {msg}{RESET}", flush=True)
def hero(msg):  print(f"{PURPLE}{BOLD}🔥 {msg}{RESET}", flush=True)


def login():
    """✅ Session reuse — load_settings"""
    if not SESSION_FILE or not os.path.exists(SESSION_FILE):
        err("Session file missing")
        return None
    try:
        client = Client()
        client.load_settings(SESSION_FILE)
        client.login_by_sessionid(client.sessionid)
        uname = getattr(client, "username", None) or "unknown"
        ok(f"Session loaded — {uname}")
        return client
    except Exception as e:
        err(f"Login fail — {e}")
        return None


def fetch_all(client):
    hero("Inbox scan kar raha hoon...")
    try:
        threads = client.direct_threads(amount=200)
        count = 0
        with open(GROUPS_FILE, "w", encoding="utf-8") as f:
            for thread in threads:
                f.write(f"https://www.instagram.com/direct/t/{thread.id}/\n")
                count += 1
        ok(f"Total {count} GC mile")
        ok(f"Saved: {GROUPS_FILE}")
    except LoginRequired:
        err("Session expire")
    except RateLimitError:
        err("Rate limit")
    except Exception as e:
        err(f"Error → {e}")


def main():
    if not SESSION_FILE:
        err("SESSION_FILE missing")
        sys.exit(1)

    cl = login()
    if not cl:
        sys.exit(1)

    fetch_all(cl)


if __name__ == "__main__":
    main()
