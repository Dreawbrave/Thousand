from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import random
import secrets
import string
from typing import Any


PITS = ((200, 300), (600, 700))


@dataclass
class ScoredRoll:
    points: int
    scoring_indices: list[int]
    label: str


def score_roll(dice: list[int]) -> ScoredRoll:
    """Score one roll and automatically use its highest-value combination."""
    if len(dice) == 5 and set(dice) == {1, 2, 3, 4, 5}:
        return ScoredRoll(125, list(range(5)), "Малый стрит")
    if len(dice) == 5 and set(dice) == {2, 3, 4, 5, 6}:
        return ScoredRoll(250, list(range(5)), "Большой стрит")

    counts = Counter(dice)
    points = 0
    scoring_values: set[int] = set()
    labels: list[str] = []

    for value, count in sorted(counts.items()):
        if count >= 3:
            if value == 1:
                group_points = {3: 100, 4: 200, 5: 1000}[count]
            else:
                group_points = {3: value * 10, 4: value * 20, 5: value * 100}[count]
            points += group_points
            scoring_values.add(value)
            labels.append(f"{count} × {value}")
        elif value == 1:
            points += count * 10
            scoring_values.add(value)
            labels.append(f"{count} × единица" if count > 1 else "Единица")
        elif value == 5:
            points += count * 5
            scoring_values.add(value)
            labels.append(f"{count} × пятёрка" if count > 1 else "Пятёрка")

    indices = [index for index, value in enumerate(dice) if value in scoring_values]
    return ScoredRoll(points, indices, " + ".join(labels) if labels else "Пустой бросок")


@dataclass
class Player:
    id: str
    name: str
    score: int = 0
    bolts: int = 0
    opened: bool = False
    connected: bool = False
    order_roll: int | None = None

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "score": self.score,
            "bolts": self.bolts,
            "opened": self.opened,
            "connected": self.connected,
            "orderRoll": self.order_roll,
        }

    def stored(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "score": self.score,
            "bolts": self.bolts,
            "opened": self.opened,
            "orderRoll": self.order_roll,
        }

    @classmethod
    def restore(cls, data: dict[str, Any]) -> "Player":
        return cls(
            id=str(data["id"]),
            name=str(data["name"]),
            score=int(data.get("score", 0)),
            bolts=int(data.get("bolts", 0)),
            opened=bool(data.get("opened", False)),
            connected=False,
            order_roll=data.get("orderRoll"),
        )


@dataclass
class Room:
    code: str
    host_id: str
    players: list[Player]
    status: str = "lobby"
    current_index: int = 0
    turn_score: int = 0
    dice_to_roll: int = 5
    must_roll: bool = False
    last_roll: dict[str, Any] | None = None
    winner_id: str | None = None
    round: int = 1
    event: str = "Ждём остальных игроков"
    max_players: int = 0

    @property
    def current_player(self) -> Player | None:
        if self.status != "playing" or not self.players:
            return None
        return self.players[self.current_index]

    def find_player(self, player_id: str) -> Player | None:
        return next((player for player in self.players if player.id == player_id), None)

    def start(self, actor_id: str) -> None:
        if actor_id != self.host_id:
            raise ValueError("Только ведущий может начать игру")
        if self.status != "lobby":
            raise ValueError("Игра уже началась")
        if len(self.players) < 2:
            raise ValueError("Для игры нужны хотя бы два игрока")

        random.shuffle(self.players)
        for player in self.players:
            player.order_roll = random.randint(1, 6)
        self.players.sort(key=lambda player: player.order_roll or 0, reverse=True)
        self.status = "playing"
        self.current_index = 0
        self.round = 1
        order = ", ".join(f"{p.name} — {p.order_roll}" for p in self.players)
        self.event = f"Очередность разыграна: {order}"
        self.reset_turn()

    def roll(self, actor_id: str, values: list[int] | None = None) -> None:
        player = self._require_turn(actor_id)
        dice = values if values is not None else [random.randint(1, 6) for _ in range(self.dice_to_roll)]
        if len(dice) != self.dice_to_roll or any(value not in range(1, 7) for value in dice):
            raise ValueError("Некорректный набор костей")

        scored = score_roll(dice)
        if scored.points == 0:
            penalty = self._add_bolt(player)
            lost = self.turn_score
            self.last_roll = {
                "dice": dice,
                "scoringIndices": [],
                "points": 0,
                "label": "Пустой бросок",
                "busted": True,
            }
            suffix = f" Третий болт: −50 очков." if penalty else ""
            self.event = f"{player.name}: пусто, сгорело {lost}. Болт!{suffix}"
            self._advance_turn(keep_last_roll=True)
            return

        self.turn_score += scored.points
        unscored = len(dice) - len(scored.scoring_indices)
        self.last_roll = {
            "dice": dice,
            "scoringIndices": scored.scoring_indices,
            "points": scored.points,
            "label": scored.label,
            "busted": False,
        }
        if unscored == 0:
            self.dice_to_roll = 5
            self.must_roll = True
            self.event = f"{scored.label}: +{scored.points}. Горячие кости — бросай все пять!"
        else:
            self.dice_to_roll = unscored
            self.must_roll = False
            self.event = f"{scored.label}: +{scored.points}. В ходе уже {self.turn_score}."

    def bank(self, actor_id: str) -> None:
        player = self._require_turn(actor_id)
        if self.turn_score <= 0:
            raise ValueError("Сначала нужно набрать очки")
        if self.must_roll:
            raise ValueError("Все кости сыграли — обязательный новый бросок")
        requirement = self.bank_requirement(player)
        if self.turn_score < requirement:
            raise ValueError(f"Нужно набрать ещё {requirement - self.turn_score}")

        gained = self.turn_score
        player.score += gained
        player.opened = True
        if player.score == 555:
            player.score = 0
            self.event = f"{player.name} попал на самосвал! 555 превращаются в ноль."
            self._advance_turn(keep_event=True)
            return
        if player.score >= 1000:
            self.status = "finished"
            self.winner_id = player.id
            self.event = f"{player.name} набрал {player.score} и забирает косарь!"
            self.must_roll = False
            return

        self.event = f"{player.name} забирает {gained}. Теперь у него {player.score}."
        self._advance_turn(keep_event=True)

    def restart(self, actor_id: str) -> None:
        if actor_id != self.host_id:
            raise ValueError("Только ведущий может начать реванш")
        if self.status != "finished":
            raise ValueError("Текущая партия ещё не закончена")
        for player in self.players:
            player.score = 0
            player.bolts = 0
            player.opened = False
            player.order_roll = random.randint(1, 6)
        random.shuffle(self.players)
        self.players.sort(key=lambda player: player.order_roll or 0, reverse=True)
        self.status = "playing"
        self.winner_id = None
        self.current_index = 0
        self.round = 1
        self.reset_turn()
        self.event = "Реванш! Очередность снова разыграна на костях."

    def bank_requirement(self, player: Player) -> int:
        if not player.opened:
            return 50
        for bottom, top in PITS:
            if bottom <= player.score < top:
                return top - player.score
        return 0

    def can_bank(self) -> bool:
        player = self.current_player
        return bool(player and self.turn_score > 0 and not self.must_roll and self.turn_score >= self.bank_requirement(player))

    def public(self) -> dict[str, Any]:
        current = self.current_player
        return {
            "code": self.code,
            "status": self.status,
            "hostId": self.host_id,
            "players": [player.public() for player in self.players],
            "currentPlayerId": current.id if current else None,
            "turnScore": self.turn_score,
            "diceToRoll": self.dice_to_roll,
            "mustRoll": self.must_roll,
            "lastRoll": self.last_roll,
            "winnerId": self.winner_id,
            "round": self.round,
            "event": self.event,
            "canBank": self.can_bank(),
            "bankRequirement": self.bank_requirement(current) if current else 0,
            "maxPlayers": self.max_players,
        }

    def stored(self) -> dict[str, Any]:
        """Return the complete durable state without transient connections."""
        return {
            "version": 1,
            "code": self.code,
            "hostId": self.host_id,
            "players": [player.stored() for player in self.players],
            "status": self.status,
            "currentIndex": self.current_index,
            "turnScore": self.turn_score,
            "diceToRoll": self.dice_to_roll,
            "mustRoll": self.must_roll,
            "lastRoll": self.last_roll,
            "winnerId": self.winner_id,
            "round": self.round,
            "event": self.event,
        }

    @classmethod
    def restore(cls, data: dict[str, Any]) -> "Room":
        players = [Player.restore(item) for item in data.get("players", [])]
        if not players:
            raise ValueError("В сохранённой комнате нет игроков")
        current_index = int(data.get("currentIndex", 0))
        if current_index < 0 or current_index >= len(players):
            current_index = 0
        return cls(
            code=str(data["code"]),
            host_id=str(data["hostId"]),
            players=players,
            status=str(data.get("status", "lobby")),
            current_index=current_index,
            turn_score=int(data.get("turnScore", 0)),
            dice_to_roll=int(data.get("diceToRoll", 5)),
            must_roll=bool(data.get("mustRoll", False)),
            last_roll=data.get("lastRoll"),
            winner_id=data.get("winnerId"),
            round=int(data.get("round", 1)),
            event=str(data.get("event", "Комната восстановлена")),
        )

    def reset_turn(self) -> None:
        self.turn_score = 0
        self.dice_to_roll = 5
        self.must_roll = False
        self.last_roll = None

    def _require_turn(self, actor_id: str) -> Player:
        if self.status != "playing":
            raise ValueError("Сейчас нельзя делать ход")
        player = self.current_player
        if not player or player.id != actor_id:
            raise ValueError("Сейчас ход другого игрока")
        return player

    def _add_bolt(self, player: Player) -> bool:
        player.bolts += 1
        if player.bolts < 3:
            return False
        player.bolts = 0
        player.score -= 50
        return True

    def _advance_turn(self, keep_last_roll: bool = False, keep_event: bool = False) -> None:
        previous_event = self.event
        previous_roll = self.last_roll
        self.current_index += 1
        if self.current_index >= len(self.players):
            self.current_index = 0
            self.round += 1
        self.reset_turn()
        if keep_last_roll:
            self.last_roll = previous_roll
        if keep_event:
            self.event = previous_event


def room_code(existing: set[str]) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(5))
        if code not in existing:
            return code


def player_id() -> str:
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(24))
