import os
import sys
import json
import logging
import asyncio
from typing import List, Dict, Any, Set
from pathlib import Path
from fastapi import WebSocket, WebSocketDisconnect
import redis.asyncio as aioredis
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("websocket_manager")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
CHANNELS = ["schedule_updates", "emergency_defect_events", "train_delay_events"]

class ConnectionManager:
    """Manages active client WebSocket connections and multiplexes real-time event broadcasts."""
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Active clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Active clients: {len(self.active_connections)}")

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send personal WS message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        if not self.active_connections:
            return
        
        disconnected = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to WS client: {e}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

async def redis_pubsub_listener(ws_manager: ConnectionManager):
    """Background coroutine that bridges Redis Pub/Sub events to WebSocket clients."""
    logger.info("Starting Redis PubSub WebSocket Bridge...")
    while True:
        try:
            r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
            pubsub = r.pubsub()
            await pubsub.subscribe(*CHANNELS)
            logger.info(f"Subscribed to Redis channels: {CHANNELS}")

            async for message in pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    raw_data = message["data"]
                    try:
                        parsed_payload = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                    except Exception:
                        parsed_payload = {"raw": raw_data}

                    event_envelope = {
                        "event_type": "PUB_SUB_EVENT",
                        "channel": channel,
                        "data": parsed_payload
                    }
                    await ws_manager.broadcast(event_envelope)
        except asyncio.CancelledError:
            logger.info("Redis PubSub WebSocket Bridge cancelled.")
            break
        except Exception as e:
            logger.error(f"Redis PubSub listener error: {e}. Reconnecting in 3s...", exc_info=False)
            await asyncio.sleep(3.0)
