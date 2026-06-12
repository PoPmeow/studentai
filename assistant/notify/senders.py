"""Reminder output — Discord webhook and LINE Messaging API push.

NOTE: LINE Notify was discontinued (March 2025), so LINE delivery uses the
Messaging API push endpoint instead (needs a channel access token + user id).
"""
import requests

from .. import config


def send_discord(message: str) -> bool:
    if not config.DISCORD_WEBHOOK_URL:
        return False
    resp = requests.post(
        config.DISCORD_WEBHOOK_URL,
        json={"content": message},
        timeout=10,
    )
    resp.raise_for_status()
    return True


def send_line(message: str) -> bool:
    if not (config.LINE_CHANNEL_ACCESS_TOKEN and config.LINE_USER_ID):
        return False
    resp = requests.post(
        "https://api.line.me/v2/bot/message/push",
        headers={"Authorization": f"Bearer {config.LINE_CHANNEL_ACCESS_TOKEN}"},
        json={
            "to": config.LINE_USER_ID,
            "messages": [{"type": "text", "text": message}],
        },
        timeout=10,
    )
    resp.raise_for_status()
    return True


def broadcast(message: str) -> list[str]:
    """Send to every configured channel; return the names that succeeded."""
    sent = []
    for name, fn in (("Discord", send_discord), ("LINE", send_line)):
        try:
            if fn(message):
                sent.append(name)
        except requests.RequestException:
            pass
    return sent
