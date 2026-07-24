from fastapi.testclient import TestClient

from backend.app.main import app, connections, rooms, voice_members


def test_voice_membership_and_targeted_signaling() -> None:
    client = TestClient(app)
    created = client.post("/api/rooms", json={"name": "Первый"}).json()
    code = created["code"]
    first_id = created["playerId"]
    second_id = client.post(f"/api/rooms/{code}/join", json={"name": "Второй"}).json()["playerId"]

    try:
        with (
            client.websocket_connect(f"/ws/{code}/{first_id}") as first,
            client.websocket_connect(f"/ws/{code}/{second_id}") as second,
        ):
            first.receive_json()
            first.receive_json()
            second.receive_json()

            first.send_json({"action": "voice_join"})
            assert first.receive_json() == {"type": "voice-members", "playerIds": []}

            second.send_json({"action": "voice_join"})
            assert second.receive_json() == {"type": "voice-members", "playerIds": [first_id]}
            assert first.receive_json() == {"type": "voice-peer-joined", "playerId": second_id}

            offer = {"description": {"type": "offer", "sdp": "test-sdp"}}
            first.send_json({"action": "voice_signal", "targetPlayerId": second_id, "signal": offer})
            assert second.receive_json() == {
                "type": "voice-signal",
                "fromPlayerId": first_id,
                "signal": offer,
            }
    finally:
        rooms.pop(code, None)
        connections.pop(code, None)
        voice_members.pop(code, None)
