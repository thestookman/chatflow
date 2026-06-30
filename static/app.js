const STORAGE_KEY = "chatflow_conversations";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const messagesEl = $("#messages");
const welcomeEl = $("#welcome");
const chatListEl = $("#chatList");
const chatTitleEl = $("#chatTitle");
const messageInput = $("#messageInput");
const sendBtn = $("#sendBtn");
const composerForm = $("#composerForm");
const newChatBtn = $("#newChatBtn");
const deleteChatBtn = $("#deleteChatBtn");
const sidebar = $("#sidebar");
const sidebarToggle = $("#sidebarToggle");
const sidebarClose = $("#sidebarClose");
const statusDot = $("#statusDot");
const statusText = $("#statusText");

let state = loadState();
let isStreaming = false;

marked.setOptions({ breaks: true, gfm: true });

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { conversations: [], activeId: null };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function generateId() {
  return crypto.randomUUID();
}

function getActiveConversation() {
  return state.conversations.find((c) => c.id === state.activeId) ?? null;
}

function createConversation(firstMessage) {
  const conv = {
    id: generateId(),
    title: firstMessage.slice(0, 48) + (firstMessage.length > 48 ? "…" : ""),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  state.conversations.unshift(conv);
  state.activeId = conv.id;
  saveState();
  return conv;
}

function updateConversationTitle(conv) {
  const firstUser = conv.messages.find((m) => m.role === "user");
  if (firstUser) {
    conv.title =
      firstUser.content.slice(0, 48) +
      (firstUser.content.length > 48 ? "…" : "");
  }
}

function renderChatList() {
  if (state.conversations.length === 0) {
    chatListEl.innerHTML = `<div class="empty-list">No saved chats yet</div>`;
    return;
  }

  chatListEl.innerHTML = state.conversations
    .map(
      (c) => `
    <button class="chat-item ${c.id === state.activeId ? "active" : ""}" data-id="${c.id}">
      <svg class="chat-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      <span class="chat-item-title">${escapeHtml(c.title)}</span>
    </button>
  `
    )
    .join("");

  $$(".chat-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeId = btn.dataset.id;
      saveState();
      renderAll();
      closeSidebarMobile();
    });
  });
}

function renderMessages() {
  const conv = getActiveConversation();
  messagesEl.innerHTML = "";

  if (!conv || conv.messages.length === 0) {
    messagesEl.appendChild(welcomeEl.cloneNode(true));
    wireSuggestions();
    chatTitleEl.textContent = "New conversation";
    return;
  }

  chatTitleEl.textContent = conv.title;

  conv.messages.forEach((msg) => {
    messagesEl.appendChild(createMessageEl(msg.role, msg.content));
  });

  scrollToBottom();
}

function wireSuggestions() {
  $$(".suggestion").forEach((btn) => {
    btn.addEventListener("click", () => {
      messageInput.value = btn.dataset.prompt;
      autoResizeTextarea();
      updateSendButton();
      messageInput.focus();
    });
  });
}

function createMessageEl(role, content, isStreamingMsg = false) {
  const el = document.createElement("div");
  el.className = `message ${role}`;

  const avatarLabel = role === "user" ? "You" : "AI";
  const avatarChar = role === "user" ? "Y" : "✦";

  el.innerHTML = `
    <div class="message-avatar">${avatarChar}</div>
    <div class="message-body">
      <div class="message-role">${avatarLabel}</div>
      <div class="message-content">${renderContent(content, isStreamingMsg)}</div>
    </div>
  `;

  return el;
}

function renderContent(content, isStreamingMsg) {
  if (isStreamingMsg && !content) {
    return `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  }
  if (!content) return "";
  try {
    return marked.parse(content);
  } catch (_) {
    return escapeHtml(content);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function scrollToBottom() {
  const wrap = $(".messages-wrap");
  wrap.scrollTop = wrap.scrollHeight;
}

function renderAll() {
  renderChatList();
  renderMessages();
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
}

function updateSendButton() {
  sendBtn.disabled = isStreaming || !messageInput.value.trim();
}

async function sendMessage(text) {
  if (!text.trim() || isStreaming) return;

  let conv = getActiveConversation();
  if (!conv) {
    conv = createConversation(text.trim());
    renderChatList();
  }

  conv.messages.push({ role: "user", content: text.trim() });
  conv.updatedAt = Date.now();
  updateConversationTitle(conv);
  saveState();

  messageInput.value = "";
  autoResizeTextarea();
  updateSendButton();

  renderMessages();

  isStreaming = true;
  updateSendButton();

  const assistantMsg = { role: "assistant", content: "" };
  conv.messages.push(assistantMsg);
  saveState();

  const assistantEl = createMessageEl("assistant", "", true);
  messagesEl.appendChild(assistantEl);
  const contentEl = assistantEl.querySelector(".message-content");
  welcomeEl?.remove();

  scrollToBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conv.messages
          .slice(0, -1)
          .map(({ role, content }) => ({ role, content })),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(err.detail || "Request failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);

          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            assistantMsg.content += delta;
            contentEl.innerHTML = renderContent(assistantMsg.content);
            scrollToBottom();
          }
        } catch (e) {
          if (e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }

    if (!assistantMsg.content) {
      assistantMsg.content = "No response received.";
      contentEl.innerHTML = renderContent(assistantMsg.content);
    }
  } catch (err) {
    assistantMsg.content = `Error: ${err.message}`;
    contentEl.innerHTML = renderContent(assistantMsg.content);
  }

  conv.updatedAt = Date.now();
  saveState();
  renderChatList();

  isStreaming = false;
  updateSendButton();
  messageInput.focus();
}

function startNewChat() {
  state.activeId = null;
  saveState();
  renderAll();
  closeSidebarMobile();
  messageInput.focus();
}

function deleteActiveChat() {
  const conv = getActiveConversation();
  if (!conv) return;
  if (!confirm("Delete this chat?")) return;

  state.conversations = state.conversations.filter((c) => c.id !== conv.id);
  state.activeId = state.conversations[0]?.id ?? null;
  saveState();
  renderAll();
}

function closeSidebarMobile() {
  sidebar.classList.remove("open");
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.configured) {
      statusDot.className = "status-dot online";
      statusText.textContent = `Online · ${data.model}`;
    } else {
      statusDot.className = "status-dot offline";
      statusText.textContent = "API key not configured";
    }
  } catch (_) {
    statusDot.className = "status-dot offline";
    statusText.textContent = "Server offline";
  }
}

composerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(messageInput.value);
});

messageInput.addEventListener("input", () => {
  autoResizeTextarea();
  updateSendButton();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(messageInput.value);
  }
});

newChatBtn.addEventListener("click", startNewChat);
deleteChatBtn.addEventListener("click", deleteActiveChat);
sidebarToggle.addEventListener("click", () => sidebar.classList.add("open"));
sidebarClose.addEventListener("click", closeSidebarMobile);

renderAll();
checkHealth();
