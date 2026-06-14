"""Per-user notification — each account has its own Discord webhook + web-push
subscriptions, so reminders reach the owner of the reminder (not a shared channel).
Reads the CURRENT user's settings (storage is namespaced per user).
"""
from ..storage import json_store
from . import senders, webpush


def get_settings() -> dict:
    return json_store.notify_settings.get()


def status() -> dict:
    s = get_settings()
    return {
        "discord": bool(s.get("discord_webhook")),
        "push": len(s.get("push_subscriptions", [])),
    }


def set_discord(url: str) -> dict:
    s = get_settings()
    s["discord_webhook"] = (url or "").strip()
    return json_store.notify_settings.set(s)


def add_subscription(sub: dict) -> dict:
    s = get_settings()
    ep = sub.get("endpoint")
    subs = [x for x in s.get("push_subscriptions", []) if x.get("endpoint") != ep]
    subs.append(sub)
    s["push_subscriptions"] = subs
    return json_store.notify_settings.set(s)


def remove_subscription(endpoint: str) -> dict:
    s = get_settings()
    s["push_subscriptions"] = [
        x for x in s.get("push_subscriptions", []) if x.get("endpoint") != endpoint
    ]
    return json_store.notify_settings.set(s)


def send(message: str, title: str = "Student AI") -> list[str]:
    """Send to the current user's own channels. Returns channel names that sent."""
    s = get_settings()
    sent = []
    try:
        if senders.send_discord_to(s.get("discord_webhook", ""), message):
            sent.append("Discord")
    except Exception:
        pass

    dead, n = webpush.send_push(s.get("push_subscriptions", []), title, message)
    if n:
        sent.append("Push")
    if dead:  # prune subscriptions the browser dropped
        s["push_subscriptions"] = [
            x for x in s.get("push_subscriptions", []) if x.get("endpoint") not in dead
        ]
        json_store.notify_settings.set(s)
    return sent
