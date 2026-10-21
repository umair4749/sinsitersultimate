# FORM_CONFIG: {"displayName": "sinsiters GC", "icon": "🏗️", "description": "Bulk group chat creator with auto-remove", "tags": ["Bulk Create", "Auto Remove"], "fields": [{"name": "gcCount", "label": "Kitne GC?", "type": "number", "default": 1}, {"name": "userIds", "label": "User IDs (comma separated)", "type": "textarea", "placeholder": "59046757058,48735641869"}, {"name": "removeId", "label": "Remove karne wali ID", "type": "text", "placeholder": "48735641869"}]}

import time
import asyncio
import urllib.parse
import random
import os
import sys
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, RateLimitError


SESSION_FILE = os.environ.get("SESSION_FILE", "")
GC_COUNT = int(os.environ.get("GC_COUNT", "1"))
USER_IDS_RAW = os.environ.get("USER_IDS", "")
REMOVE_ID = os.environ.get("REMOVE_ID", "")

USER_IDS = [u.strip() for u in USER_IDS_RAW.split(",") if u.strip()]

cl = None

def sinsiters_ok(msg): print(f"OK | {msg}", flush=True)
def sinsiters_info(msg): print(f"INFO | {msg}", flush=True)
def sinsiters_warn(msg): print(f"WARN | {msg}", flush=True)
def sinsiters_err(msg): print(f"ERROR | {msg}", flush=True)
def sinsiters_hero(msg): print(f"sinsiters | {msg}", flush=True)


def login():
    """✅ Session reuse — load_settings"""
    if not SESSION_FILE or not os.path.exists(SESSION_FILE):
        sinsiters_err("Session file missing")
        return None
    try:
        client = Client()
        client.load_settings(SESSION_FILE)
        client.login_by_sessionid(client.sessionid)
        uname = getattr(client, "username", None) or "unknown"
        sinsiters_ok(f"Session loaded — {uname}")
        return client
    except Exception as e:
        sinsiters_err(f"Login fail — {e}")
        return None


def sinsiters_remove(client, thread_id, user_id):
    client.private.post(
        f"https://i.instagram.com/api/v1/direct_v2/"
        f"threads/{thread_id}/remove_users/",
        data={"user_ids": f"[{user_id}]"}
    )


async def sinsiters_master(client, group_count, user_ids, remove_user_id):
    sinsiters_hero(f"Total {group_count} GC banane hain")
    print(flush=True)

    for i in range(1, group_count + 1):
        try:
            print(f"GC {i}/{group_count}", flush=True)

            client.direct_send(
                "⚡SCRIPT BY sinsiters 👑 ",
                user_ids=user_ids
            )

            time.sleep(4)

            thread = client.direct_threads(amount=1)[0]
            thread_id = thread.id

            time.sleep(3)

            if remove_user_id:
                sinsiters_remove(client, thread_id, remove_user_id)

            sinsiters_ok(f"Members Added : {', '.join(user_ids)}")
            if remove_user_id:
                sinsiters_ok(f"Removed : {remove_user_id}")
            print(flush=True)

            wait = random.randint(12, 20)
            sinsiters_info(f"Cool down {wait}s...")
            time.sleep(wait)

        except LoginRequired:
            sinsiters_err("Session expire — script band")
            return

        except RateLimitError:
            sinsiters_warn("Rate limit — 60s wait")
            time.sleep(60)

        except Exception as e:
            sinsiters_err(f"Error → {e}")
            time.sleep(random.randint(5, 10))

    sinsiters_hero("ALL GC DONE! 🔥")


async def main():
    if not SESSION_FILE:
        sinsiters_err("SESSION_FILE missing")
        sys.exit(1)

    if len(USER_IDS) < 2:
        sinsiters_err(f"Minimum 2 User IDs chahiye. Mile: {len(USER_IDS)}")
        sys.exit(1)

    sinsiters_info(f"Config: GC={GC_COUNT}, Users={len(USER_IDS)}, Remove={REMOVE_ID or 'None'}")

    cl = login()
    if not cl:
        sys.exit(1)

    cl.delay_range = [3, 8]
    await sinsiters_master(cl, GC_COUNT, USER_IDS, REMOVE_ID)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nSTOPPED", flush=True)
