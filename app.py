from __future__ import annotations

import threading
from datetime import datetime, timezone
from itertools import count
from typing import Any

from flask import Flask, jsonify, render_template, request

MAX_MESSAGES = 200
MAX_AUTHOR_LENGTH = 30
MAX_MESSAGE_LENGTH = 500


class MessageStore:
    """A small in-memory message store for the public room."""

    def __init__(self, max_messages: int = MAX_MESSAGES) -> None:
        self._lock = threading.Lock()
        self._message_ids = count(1)
        self._messages: list[dict[str, Any]] = []
        self._max_messages = max_messages

    def add(self, author: str, text: str) -> dict[str, Any]:
        with self._lock:
            message = {
                "id": next(self._message_ids),
                "author": author,
                "text": text,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            self._messages.append(message)
            del self._messages[:-self._max_messages]
            return message.copy()

    def after(self, message_id: int = 0) -> list[dict[str, Any]]:
        with self._lock:
            return [
                message.copy()
                for message in self._messages
                if message["id"] > message_id
            ]


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_mapping(JSON_SORT_KEYS=False)
    if test_config:
        app.config.update(test_config)

    message_store = MessageStore()
    app.extensions["message_store"] = message_store

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/messages")
    def get_messages():
        raw_after = request.args.get("after", "0")
        try:
            after = int(raw_after)
        except ValueError:
            return jsonify(error="after は整数で指定してください。"), 400

        if after < 0:
            return jsonify(error="after は0以上で指定してください。"), 400

        return jsonify(messages=message_store.after(after))

    @app.post("/api/messages")
    def post_message():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="JSON形式のリクエストが必要です。"), 400

        author = _validated_text(
            payload.get("author"),
            max_length=MAX_AUTHOR_LENGTH,
        )
        text = _validated_text(
            payload.get("text"),
            max_length=MAX_MESSAGE_LENGTH,
        )
        if author is None or text is None:
            return jsonify(
                error=(
                    f"表示名は1〜{MAX_AUTHOR_LENGTH}文字、"
                    f"メッセージは1〜{MAX_MESSAGE_LENGTH}文字で入力してください。"
                )
            ), 400

        message = message_store.add(author, text)
        return jsonify(message=message), 201

    return app


def _validated_text(value: object, *, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    if not normalized or len(normalized) > max_length:
        return None

    return normalized


app = create_app()


if __name__ == "__main__":
    app.run()