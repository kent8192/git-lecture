import pytest

from app import MAX_AUTHOR_LENGTH, MAX_MESSAGE_LENGTH, MAX_MESSAGES, create_app


@pytest.fixture()
def client():
    app = create_app({"TESTING": True})
    return app.test_client()


def test_index_is_available(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.content_type
    assert "匿名チャット" in response.get_data(as_text=True)


def test_messages_can_be_created_and_fetched(client):
    create_response = client.post(
        "/api/messages",
        json={"author": "あき", "text": "こんにちは"},
    )

    assert create_response.status_code == 201
    message = create_response.get_json()["message"]
    assert message["author"] == "あき"
    assert message["text"] == "こんにちは"
    assert message["id"] == 1
    assert message["created_at"].endswith("+00:00")

    list_response = client.get("/api/messages")

    assert list_response.status_code == 200
    assert list_response.get_json()["messages"] == [message]

    after_response = client.get(f"/api/messages?after={message['id']}")

    assert after_response.get_json() == {"messages": []}


@pytest.mark.parametrize(
    ("payload", "expected_status"),
    [
        ({}, 400),
        ({"author": "", "text": "hello"}, 400),
        ({"author": "guest", "text": ""}, 400),
        ({"author": "a" * (MAX_AUTHOR_LENGTH + 1), "text": "hello"}, 400),
        ({"author": "guest", "text": "a" * (MAX_MESSAGE_LENGTH + 1)}, 400),
        ({"author": 123, "text": "hello"}, 400),
    ],
)
def test_invalid_messages_are_rejected(client, payload, expected_status):
    response = client.post("/api/messages", json=payload)

    assert response.status_code == expected_status
    assert "error" in response.get_json()


def test_invalid_after_parameter_is_rejected(client):
    assert client.get("/api/messages?after=nope").status_code == 400
    assert client.get("/api/messages?after=-1").status_code == 400


def test_message_history_keeps_only_the_latest_messages(client):
    for index in range(MAX_MESSAGES + 1):
        response = client.post(
            "/api/messages",
            json={"author": "guest", "text": str(index)},
        )
        assert response.status_code == 201

    messages = client.get("/api/messages").get_json()["messages"]

    assert len(messages) == MAX_MESSAGES
    assert messages[0]["text"] == "1"
    assert messages[-1]["text"] == str(MAX_MESSAGES)