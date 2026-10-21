# FORM_CONFIG: {"displayName": "sinsiters MULTI", "icon": "🔥", "description": "Multi-account broadcast with cyclic renaming", "tags": ["30-40s Cooldown", "Name Lock"], "fields": [{"name": "groupName", "label": "Group Name", "type": "text", "default": "SCRIPT BY sinsiters"}, {"name": "msgText", "label": "Message Text", "type": "text", "default": "SCRIPT BY sinsiters"}, {"name": "msgDelayMin", "label": "Msg Delay Min (sec)", "type": "number", "default": 30}, {"name": "msgDelayMax", "label": "Msg Delay Max (sec)", "type": "number", "default": 40}]}

import asyncio
import random
import os
import sys
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, RateLimitError


SESSION_FILE = os.environ.get("SESSION_FILE", "")
MSG_TEXT = os.environ.get("MSG_TEXT", "SCRIPT BY sinsiters")
GROUP_NAME = os.environ.get("GROUP_NAME", "SCRIPT BY sinsiters")
MSG_DELAY_MIN = int(os.environ.get("MSG_DELAY_MIN", "30"))
MSG_DELAY_MAX = int(os.environ.get("MSG_DELAY_MAX", "40"))
GROUPS_FILE = os.environ.get("GROUPS_FILE", "groups.txt")


stats = {
    "gc_total": 0,
    "current_pos": 0,
    "msg_sent": 0,
    "msg_fail": 0,
    "renamed": 0,
    "rename_skip": 0,
    "rename_fail": 0,
}


def render_stats():
    line = (
        f"STATUS|POS={stats['current_pos']}/{stats['gc_total']}|"
        f"MSG={stats['msg_sent']}|MSG_FAIL={stats['msg_fail']}|"
        f"NC={stats['renamed']}|NC_SKIP={stats['rename_skip']}|NC_FAIL={stats['rename_fail']}"
    )
    print(line, flush=True)


def log_error(msg):
    print(f"ERROR | {msg}", flush=True)
    render_stats()


def login():
    if not SESSION_FILE or not os.path.exists(SESSION_FILE):
        log_error("Session file missing")
        return None
    try:
        client = Client()
        client.load_settings(SESSION_FILE)
        client.login_by_sessionid(client.sessionid)
        return client
    except Exception as e:
        log_error(f"Login fail — {e}")
        return None


def save_threads_to_file(thread_ids):
    with open(GROUPS_FILE, "w", encoding="utf-8") as f:
        for tid in thread_ids:
            f.write(f"https://www.instagram.com/direct/t/{tid}/\n")


def load_threads_from_file():
    if not os.path.exists(GROUPS_FILE):
        return None
    ids = []
    try:
        with open(GROUPS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if "/direct/t/" in line:
                    tid = line.split("/direct/t/")[1].rstrip("/")
                    ids.append(tid)
                else:
                    ids.append(line)
    except Exception:
        return None
    return ids if ids else None


def get_threads(client):
    loaded = load_threads_from_file()
    if loaded and len(loaded) > 0:
        return loaded

    try:
        threads = client.direct_threads(amount=200)
        thread_ids = [t.id for t in threads]
        save_threads_to_file(thread_ids)
        return thread_ids
    except Exception as e:
        log_error(f"Fetch fail — {e}")
        return []


async def main_loop(client, thread_ids):
    total = len(thread_ids)
    stats["gc_total"] = total

    while True:
        for idx, tid in enumerate(thread_ids, 1):
            stats["current_pos"] = idx

            # MSG
            try:
                client.direct_send(MSG_TEXT, thread_ids=[tid])
                stats["msg_sent"] += 1
            except LoginRequired:
                log_error("Session expire — script band")
                return
            except RateLimitError:
                stats["msg_fail"] += 1
                render_stats()
                await asyncio.sleep(60)
                continue
            except Exception as e:
                stats["msg_fail"] += 1
                log_error(f"Msg fail: {e}")

            # RENAME
            try:
                thread_info = client.direct_thread(tid)
                current_title = (thread_info.thread_title or "").strip()
                if current_title == GROUP_NAME:
                    stats["rename_skip"] += 1
                else:
                    client.direct_thread_update_title(tid, GROUP_NAME)
                    stats["renamed"] += 1
            except LoginRequired:
                log_error("Session expire — script band")
                return
            except RateLimitError:
                stats["rename_fail"] += 1
                render_stats()
                await asyncio.sleep(60)
                continue
            except Exception as e:
                stats["rename_fail"] += 1
                log_error(f"Rename fail: {e}")

            render_stats()
            await asyncio.sleep(random.randint(MSG_DELAY_MIN, MSG_DELAY_MAX))

        stats["current_pos"] = 0


async def main():
    if not SESSION_FILE:
        log_error("SESSION_FILE missing")
        sys.exit(1)

    cl = login()
    if not cl:
        sys.exit(1)

    cl.delay_range = [3, 8]

    thread_ids = get_threads(cl)
    if not thread_ids:
        log_error("Koi thread nahi mila")
        sys.exit(1)

    await main_loop(cl, thread_ids)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nSTOPPED", flush=True)
