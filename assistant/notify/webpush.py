"""Web Push delivery via VAPID (pywebpush)."""
import json

from .. import config


def send_push(subscriptions: list, title: str, body: str, url: str = "/"):
    """Push to each subscription. Returns (dead_endpoints, sent_count).

    dead_endpoints = subscriptions the browser dropped (404/410) so the caller
    can prune them.
    """
    if not config.WEBPUSH_ENABLED or not subscriptions:
        return [], 0

    from pywebpush import WebPushException, webpush

    payload = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False)
    dead, sent = [], 0
    for sub in subscriptions:
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=config.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": config.VAPID_SUBJECT},
                timeout=8,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):  # subscription expired/unsubscribed
                dead.append(sub.get("endpoint"))
        except Exception:
            pass
    return dead, sent
