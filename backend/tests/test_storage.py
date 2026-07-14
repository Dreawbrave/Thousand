import asyncio

from backend.app.game import Player, Room
from backend.app import storage


def test_room_round_trip_preserves_game_state() -> None:
    room = Room(
        code="SAVE1",
        host_id="one",
        players=[Player("one", "Первый", score=225, opened=True), Player("two", "Второй")],
        status="playing",
        current_index=1,
        turn_score=35,
        dice_to_roll=3,
        must_roll=False,
        last_roll={"dice": [1, 5], "scoringIndices": [0, 1], "points": 15, "label": "Очки", "busted": False},
        round=4,
        event="Ход продолжается",
    )

    restored = Room.restore(room.stored())

    assert restored.code == room.code
    assert restored.current_player is not None
    assert restored.current_player.id == "two"
    assert restored.turn_score == 35
    assert restored.dice_to_roll == 3
    assert restored.players[0].score == 225
    assert restored.players[0].connected is False
    assert restored.last_roll == room.last_roll


def test_restored_room_clamps_invalid_turn_index() -> None:
    room = Room("SAVE2", "one", [Player("one", "Первый")])
    payload = room.stored()
    payload["currentIndex"] = 99

    restored = Room.restore(payload)

    assert restored.current_index == 0


def test_upstash_adapter_saves_with_ttl_and_loads(monkeypatch) -> None:
    class FakeRedis:
        value = None
        expiration = None

        async def set(self, key, value, ex=None):
            assert key == "thousand:room:CLOUD"
            self.value = value
            self.expiration = ex
            return True

        async def get(self, key):
            assert key == "thousand:room:CLOUD"
            return self.value

    fake = FakeRedis()
    monkeypatch.setattr(storage, "redis", fake)
    room = Room("CLOUD", "one", [Player("one", "Первый")])

    assert asyncio.run(storage.save_room(room)) is True
    restored = asyncio.run(storage.load_room("cloud"))

    assert fake.expiration == storage.ROOM_TTL_SECONDS
    assert restored is not None
    assert restored.code == "CLOUD"
    assert restored.players[0].name == "Первый"
