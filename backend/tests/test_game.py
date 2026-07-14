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


def test_third_bolt_costs_fifty() -> None:
    room = playing_room((100, 0))
    room.players[0].bolts = 2
    room.roll("one", [2, 3, 3, 4, 6])
    assert room.players[0].score == 50
    assert room.players[0].bolts == 0


def test_dump_truck_resets_exactly_555() -> None:
    room = playing_room((500, 0))
    room.players[0].opened = True
    room.turn_score = 55
    room.bank("one")
    assert room.players[0].score == 0
    assert room.players[0].opened is True
