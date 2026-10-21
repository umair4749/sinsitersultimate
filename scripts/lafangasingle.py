# FORM_CONFIG: {"displayName": "sinsiters SINGLE", "icon": "🎯", "description": "Target lock with Chrome GC link converter", "tags": ["Link Parser", "Auto Fetch"], "fields": [{"name": "groupLink", "label": "Group Link (optional)", "type": "text", "placeholder": "https://www.instagram.com/direct/t/..."}, {"name": "groupName", "label": "Group Name", "type": "text", "default": "SCRIPT BY sinsiters"}, {"name": "msgText", "label": "Message Text", "type": "text", "default": "SCRIPT BY sinsiters"}, {"name": "msgDelayMin", "label": "Msg Delay Min (sec)", "type": "number", "default": 30}, {"name": "msgDelayMax", "label": "Msg Delay Max (sec)", "type": "number", "default": 40}, {"name": "renameDelayMin", "label": "Rename Delay Min (sec)", "type": "number", "default": 150}, {"name": "renameDelayMax", "label": "Rename Delay Max (sec)", "type": "number", "default": 180}]}

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
RENAME_DELAY_MIN = int(os.environ.get("RENAME_DELAY_MIN", "150"))
RENAME_DELAY_MAX = int(os.environ.get("RENAME_DELAY_MAX", "180"))
GROUP_LINK = os.environ.get("GROUP_LINK", "").strip()
GROUPS_FILE = os.environ.get("GROUPS_FILE", "groups.txt")


stats = {"msg_count": 0, "msg_fail": 0, "renamed": 0, "rename_skip": 0, "rename_fail": 0}


def render_stats():
    line = (
        f"STATUS|POS=1/1|MSG={stats['msg_count']}|MSG_FAIL={stats['msg_fail']}|"
        f"NC={stats['renamed']}|NC_SKIP={stats['rename_skip']}|NC_FAIL={stats['rename_fail']}"
    )
    print(line, flush=True)


def log_error(msg):
    sys.stdout.write(f"ERROR | {msg}\n")
    sys.stdout.flush()
    render_stats()


def login():
    """✅ Session reuse — load_settings"""
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


def get_thread_id_from_link(link):
    if not link:
        return None
    if "/direct/t/" in link:
        return link.split("/direct/t/")[1].rstrip("/").strip()
    return link.strip()


def load_first_from_file():
    if not os.path.exists(GROUPS_FILE):
        return None
    try:
        with open(GROUPS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if "/direct/t/" in line:
                    return line.split("/direct/t/")[1].rstrip("/")
                return line
    except Exception:
        pass
    return None


async def msg_worker(client, thread_id):
    while True:
        try:
            client.direct_send(MSG_TEXT, thread_ids=[thread_id])
            stats["msg_count"] += 1
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
            if "404" in str(e):
                log_error("Msg fail | LINK 404 | GROUP LINK NOT FOUND OR INACCESSIBLE")
            else:
                log_error(f"Msg fail: {e}")

        render_stats()
        await asyncio.sleep(random.randint(MSG_DELAY_MIN, MSG_DELAY_MAX))


async def rename_worker(client, thread_id):
    while True:
        try:
            thread_info = client.direct_thread(thread_id)
            current_title = (thread_info.thread_title or "").strip()
            if current_title == GROUP_NAME:
                stats["rename_skip"] += 1
            else:
                client.direct_thread_update_title(thread_id, GROUP_NAME)
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
        await asyncio.sleep(random.randint(RENAME_DELAY_MIN, RENAME_DELAY_MAX))


async def main():
    if not SESSION_FILE:
        log_error("SESSION_FILE missing")
        sys.exit(1)

    thread_id = None
    if GROUP_LINK:
        thread_id = get_thread_id_from_link(GROUP_LINK)
    else:
        thread_id = load_first_from_file()

    if not thread_id:
        log_error("Koi group link nahi mila")
        sys.exit(1)

    cl = login()
    if not cl:
        sys.exit(1)

    cl.delay_range = [3, 8]

    await asyncio.gather(
        msg_worker(cl, thread_id),
        rename_worker(cl, thread_id),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.stdout.write("\nSTOPPED\n")
