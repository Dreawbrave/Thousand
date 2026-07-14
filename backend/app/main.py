from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from .game import Player, Room, player_id, room_code
from .storage import load_room, save_room, storage_mode


app = FastAPI(title="Косарь API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlayerInput(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        clean = " ".join(value.strip().split())
        if not 2 <= len(clean) <= 18:
            raise ValueError("Имя должно содержать от 2 до 18 символов")
        return clean


rooms: dict[str, Room] = {}
locks: dict[str, asyncio.Lock] = {}
connections: dict[str, dict[str, set[WebSocket]]] = {}


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "storage": storage_mode()}


async def resolve_room(code: str) -> Room | None:
    code = code.upper()
    room = rooms.get(code)
    if room is not None:
        return room
    room = await load_room(code)
    if room is not None:
        rooms[code] = room
        locks.setdefault(code, asyncio.Lock())
        connections.setdefault(code, {})
    return room


@app.post("/api/rooms", status_code=201)
async def create_room(payload: PlayerInput) -> dict[str, str]:
    code = room_code(set(rooms))
    owner = Player(id=player_id(), name=payload.name)
    rooms[code] = Room(code=code, host_id=owner.id, players=[owner])
    locks[code] = asyncio.Lock()
    connections[code] = {}
    await save_room(rooms[code])
    return {"code": code, "playerId": owner.id}


@app.post("/api/rooms/{code}/join", status_code=201)
async def join_room(code: str, payload: PlayerInput) -> dict[str, str]:
    code = code.upper()
    room = await resolve_room(code)
    if not room:
        raise HTTPException(404, "Такой комнаты нет")
    async with locks[code]:
        if room.status != "lobby":
            raise HTTPException(409, "Эта игра уже началась")
        if any(player.name.casefold() == payload.name.casefold() for player in room.players):
            raise HTTPException(409, "Игрок с таким именем уже за столом")
        newcomer = Player(id=player_id(), name=payload.name)
        room.players.append(newcomer)
        room.event = f"{newcomer.name} присоединился к столу"
        await save_room(room)
    await broadcast(code)
    return {"code": code, "playerId": newcomer.id}


@app.websocket("/ws/{code}/{player_id_value}")
async def game_socket(websocket: WebSocket, code: str, player_id_value: str) -> None:
    code = code.upper()
    room = await resolve_room(code)
    player = room.find_player(player_id_value) if room else None
    if not room or not player:
        await websocket.close(code=4004, reason="Комната или игрок не найдены")
        return

    await websocket.accept()
    connections[code].setdefault(player_id_value, set()).add(websocket)
    player.connected = True
    await broadcast(code)
    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")
            if action == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            try:
                async with locks[code]:
                    if action == "start":
                        room.start(player_id_value)
                    elif action == "roll":
                        room.roll(player_id_value)
                    elif action == "bank":
                        room.bank(player_id_value)
                    elif action == "restart":
                        room.restart(player_id_value)
                    else:
                        raise ValueError("Неизвестное действие")
                    await save_room(room)
                await broadcast(code)
            except ValueError as error:
                await websocket.send_json({"type": "error", "message": str(error)})
    except WebSocketDisconnect:
        pass
    finally:
        player_sockets = connections.get(code, {}).get(player_id_value, set())
        player_sockets.discard(websocket)
        if not player_sockets:
            player.connected = False
        await broadcast(code)


async def broadcast(code: str) -> None:
    room = rooms.get(code)
    if not room:
        return
    payload: dict[str, Any] = {"type": "state", "state": room.public()}
    dead: list[tuple[str, WebSocket]] = []
    for owner_id, sockets in list(connections.get(code, {}).items()):
        for socket in list(sockets):
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append((owner_id, socket))
    for owner_id, socket in dead:
        connections.get(code, {}).get(owner_id, set()).discard(socket)


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    assets = frontend_dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str) -> FileResponse:
        requested = (frontend_dist / full_path).resolve()
        if full_path and requested.is_file() and frontend_dist.resolve() in requested.parents:
            return FileResponse(requested)
        return FileResponse(frontend_dist / "index.html")
