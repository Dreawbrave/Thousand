from __future__ import annotations

import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from upstash_redis.asyncio import Redis

from .game import Room


logger = logging.getLogger("kosar.storage")
load_dotenv()
ROOM_TTL_SECONDS = int(os.getenv("ROOM_TTL_SECONDS", "604800"))
REDIS_URL = os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
REDIS_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()

redis: Redis | None = None
if REDIS_URL and REDIS_TOKEN:
    redis = Redis(
        url=REDIS_URL,
        token=REDIS_TOKEN,
        rest_retries=1,
        rest_retry_interval=0.5,
        allow_telemetry=False,
    )


def storage_mode() -> str:
    return "upstash" if redis else "memory"


def room_key(code: str) -> str:
    return f"kosar:room:{code.upper()}"


async def save_room(room: Room) -> bool:
    if redis is None:
        return False
    try:
        payload = json.dumps(room.stored(), ensure_ascii=False, separators=(",", ":"))
        await redis.set(room_key(room.code), payload, ex=ROOM_TTL_SECONDS)
        return True
    except Exception as error:
        logger.warning("Redis save failed for room %s: %s", room.code, error)
        return False


async def load_room(code: str) -> Room | None:
    if redis is None:
        return None
    try:
        payload: Any = await redis.get(room_key(code))
        if payload is None:
            return None
        data = json.loads(payload) if isinstance(payload, str) else payload
        return Room.restore(data)
    except Exception as error:
        logger.warning("Redis load failed for room %s: %s", code, error)
        return None
