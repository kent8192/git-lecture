const messageList = document.querySelector("#messages");
const emptyState = document.querySelector("#empty-state");
const messageForm = document.querySelector("#message-form");
const displayNameInput = document.querySelector("#display-name");
const messageInput = document.querySelector("#message-text");
const characterCount = document.querySelector("#character-count");
const messageCount = document.querySelector("#message-count");
const formFeedback = document.querySelector("#form-feedback");
const connectionStatus = document.querySelector("#connection-status");
const connectionLabel = document.querySelector("#connection-label");
const sendButton = messageForm.querySelector("button[type='submit']");

const state = {
  latestId: 0,
  messageTotal: 0,
  pollInFlight: false,
};

function updateCharacterCount() {
  characterCount.textContent = `${messageInput.value.length} / 500`;
}

function setConnectionState(isConnected) {
  connectionStatus.classList.toggle("is-offline", !isConnected);
  connectionLabel.textContent = isConnected ? "接続中" : "オフライン";
}

function setFeedback(message, isSuccess = false) {
  formFeedback.textContent = message;
  formFeedback.classList.toggle("is-success", isSuccess);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function scrollToLatest() {
  messageList.scrollTop = messageList.scrollHeight;
}

function appendMessage(message, shouldStickToBottom) {
  if (messageList.querySelector(`[data-message-id="${message.id}"]`)) {
    return false;
  }

  emptyState.hidden = true;
  const messageElement = document.createElement("article");
  messageElement.className = "message";
  messageElement.dataset.messageId = message.id;
  if (message.author === displayNameInput.value.trim()) {
    messageElement.classList.add("message--own");
  }

  const header = document.createElement("div");
  header.className = "message-header";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = message.author;

  const time = document.createElement("time");
  time.className = "message-time";
  time.dateTime = message.created_at;
  time.textContent = formatTime(message.created_at);

  const body = document.createElement("p");
  body.className = "message-body";
  body.textContent = message.text;

  header.append(author, time);
  messageElement.append(header, body);
  messageList.append(messageElement);

  if (shouldStickToBottom) {
    scrollToLatest();
  }

  return true;
}

function updateMessageCount() {
  state.messageTotal += 1;
  messageCount.textContent = state.messageTotal;
}

async function loadMessages() {
  if (state.pollInFlight) {
    return;
  }

  state.pollInFlight = true;
  const isNearBottom =
    messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;

  try {
    const response = await fetch(`/api/messages?after=${state.latestId}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("message request failed");
    }

    const data = await response.json();
    data.messages.forEach((message) => {
      const wasAdded = appendMessage(message, isNearBottom);
      state.latestId = Math.max(state.latestId, message.id);
      if (wasAdded) {
        updateMessageCount();
      }
    });
    messageList.setAttribute("aria-busy", "false");
    setConnectionState(true);
  } catch (error) {
    setConnectionState(false);
    if (state.latestId === 0) {
      setFeedback("接続できません。少し待って再試行してください。");
    }
  } finally {
    state.pollInFlight = false;
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const author = displayNameInput.value.trim();
  const text = messageInput.value.trim();
  if (!author || !text) {
    setFeedback("表示名とメッセージを入力してください。");
    return;
  }

  sendButton.disabled = true;
  setFeedback("");

  try {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ author, text }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "message request failed");
    }

    const wasNearBottom =
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;
    const wasAdded = appendMessage(
      data.message,
      wasNearBottom || state.latestId === 0,
    );
    state.latestId = Math.max(state.latestId, data.message.id);
    if (wasAdded) {
      updateMessageCount();
    }
    messageInput.value = "";
    updateCharacterCount();
    setConnectionState(true);
    setFeedback("送信しました。", true);
  } catch (error) {
    setConnectionState(false);
    setFeedback(error.message || "送信できませんでした。");
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
}

function restoreDisplayName() {
  try {
    displayNameInput.value = localStorage.getItem("lobby-display-name") || "";
  } catch (error) {
    displayNameInput.value = "";
  }
}

function rememberDisplayName() {
  try {
    localStorage.setItem("lobby-display-name", displayNameInput.value.trim());
  } catch (error) {
    return;
  }
}

displayNameInput.addEventListener("input", rememberDisplayName);
messageInput.addEventListener("input", updateCharacterCount);
messageForm.addEventListener("submit", sendMessage);
restoreDisplayName();
updateCharacterCount();
loadMessages();
window.setInterval(loadMessages, 3000);