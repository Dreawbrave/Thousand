import pytest

from backend.app.game import Player, Room, score_roll


def test_single_ones_and_fives() -> None:
    result = score_roll([1, 2, 5, 6, 5])
    assert result.points == 20
    assert result.scoring_indices == [0, 2, 4]


def test_groups_follow_score_table() -> None:
    assert score_roll([1, 1, 1, 1, 1]).points == 1000
    assert score_roll([2, 2, 2, 2, 2]).points == 200
    assert score_roll([6, 6, 6, 6]).points == 120
    assert score_roll([5, 5, 5, 1]).points == 60


def test_straights_override_single_scores() -> None:
    assert score_roll([1, 2, 3, 4, 5]).points == 125
    assert score_roll([2, 3, 4, 5, 6]).points == 250


def playing_room(scores: tuple[int, int] = (0, 0)) -> Room:
    players = [Player("one", "Один", score=scores[0]), Player("two", "Два", score=scores[1])]
    room = Room("TEST1", "one", players, status="playing")
    return room


def test_hot_dice_force_next_roll() -> None:
    room = playing_room()
    room.roll("one", [1, 1, 1, 5, 5])
    assert room.turn_score == 110
    assert room.dice_to_roll == 5
    assert room.must_roll is True
    assert room.can_bank() is False


def test_bust_burns_turn_and_advances() -> None:
    room = playing_room()
    room.roll("one", [2, 3, 4, 6, 6])
    assert room.current_player.id == "two"
    assert room.turn_score == 0
    assert room.players[0].bolts == 1


def test_opening_and_pit_requirements() -> None:
    room = playing_room()
    room.turn_score = 45
    assert room.can_bank() is False
    room.turn_score = 50
    assert room.can_bank() is True
    room.players[0].opened = True
    room.players[0].score = 225
    room.turn_score = 70
    assert room.can_bank() is False
    room.turn_score = 75
    assert room.can_bank() is True


def test_negative_score_can_be_repaid_in_small_banks() -> None:
    room = playing_room((-50, 0))
    room.players[0].opened = True
    room.turn_score = 20

    assert room.bank_requirement(room.players[0]) == 0
    assert room.can_bank() is True
    room.bank("one")

    assert room.players[0].score == -30


def test_crossing_from_negative_can_be_banked_at_any_positive_score() -> None:
    room = playing_room((-50, 0))
    room.players[0].opened = True
    room.turn_score = 75

    assert room.bank_requirement(room.players[0]) == 0
    assert room.can_bank() is True
    room.bank("one")
    assert room.players[0].score == 25


def test_lower_pit_starts_on_the_turn_after_leaving_negative_score() -> None:
    room = playing_room((25, 0))
    room.players[0].opened = True
    room.turn_score = 20

    assert room.bank_requirement(room.players[0]) == 25
    assert room.can_bank() is False

    room.turn_score = 25
    assert room.can_bank() is True


def test_leaving_negative_above_fifty_skips_lower_pit() -> None:
    room = playing_room((-50, 0))
    room.players[0].opened = True
    room.turn_score = 105

    assert room.can_bank() is True
    room.bank("one")
    assert room.players[0].score == 55


def test_third_bolt_costs_fifty() -> None:
    room = playing_room((100, 0))
    room.players[0].bolts = 2
    room.roll("one", [2, 3, 3, 4, 6])
    assert room.players[0].score == 50
    assert room.players[0].bolts == 0


def test_banking_points_breaks_bolt_streak() -> None:
    room = playing_room((100, 0))
    room.players[0].opened = True
    room.players[0].bolts = 2
    room.turn_score = 5

    room.bank("one")

    assert room.players[0].score == 105
    assert room.players[0].bolts == 0


def test_scoring_roll_without_bank_does_not_break_bolt_streak() -> None:
    room = playing_room((100, 0))
    room.players[0].opened = True
    room.players[0].bolts = 2

    room.roll("one", [5, 2, 2, 4, 6])
    assert room.players[0].bolts == 2

    room.roll("one", [2, 2, 3, 4])

    assert room.players[0].score == 50
    assert room.players[0].bolts == 0


def test_dump_truck_resets_exactly_555() -> None:
    room = playing_room((500, 0))
    room.players[0].opened = True
    room.turn_score = 55
    room.bank("one")
    assert room.players[0].score == 0
    assert room.players[0].opened is True


def test_reaction_is_available_to_any_player_without_changing_game_state() -> None:
    room = playing_room((100, 200))
    original_turn = room.current_player.id

    room.send_reaction("two", "laugh")

    assert room.reaction is not None
    assert room.reaction["id"] == "laugh"
    assert room.reaction["playerId"] == "two"
    assert room.current_player.id == original_turn
    assert "reaction" not in room.stored()


def test_reactions_are_validated_and_rate_limited() -> None:
    room = playing_room()

    with pytest.raises(ValueError, match="Неизвестная реакция"):
        room.send_reaction("one", "custom-url")

    room.send_reaction("one", "cry")
    with pytest.raises(ValueError, match="Не так быстро"):
        room.send_reaction("one", "love")


def test_chat_message_is_available_in_lobby_and_not_persisted() -> None:
    room = playing_room()
    room.status = "lobby"

    room.send_chat_message("one", "  Всем   привет!  ")

    assert room.chat_messages[0]["playerId"] == "one"
    assert room.chat_messages[0]["text"] == "Всем привет!"
    assert room.public()["chatMessages"] == room.chat_messages
    assert "chatMessages" not in room.stored()


def test_chat_message_is_validated_and_rate_limited() -> None:
    room = playing_room()

    with pytest.raises(ValueError, match="пустым"):
        room.send_chat_message("one", "   ")
    with pytest.raises(ValueError, match="300"):
        room.send_chat_message("one", "x" * 301)

    room.send_chat_message("one", "Первое")
    with pytest.raises(ValueError, match="Не так быстро"):
        room.send_chat_message("one", "Второе")


def test_chat_history_keeps_latest_fifty_messages() -> None:
    room = playing_room()
    room.chat_messages = [
        {"id": str(index), "playerId": "one", "text": str(index), "createdAt": index}
        for index in range(50)
    ]

    room.send_chat_message("two", "Новое")

    assert len(room.chat_messages) == 50
    assert room.chat_messages[0]["id"] == "1"
    assert room.chat_messages[-1]["text"] == "Новое"
