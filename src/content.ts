// Content Script
console.log("Kairu AI Content Script loaded");

// Kairu settings
const KAIRU_CONTAINER_ID = "kairu-ai-container";
const KAIRU_INPUT_ID = "kairu-ai-input";

// Kairu enabled state
let kairuEnabled = false;

// Flag to allow AI operations temporarily
let isAIOperating = false;

// Conversation history (keep last 30 messages)
interface Message {
  role: "user" | "assistant";
  content: string;
}
let conversationHistory: Message[] = [];
const MAX_HISTORY_LENGTH = 30;

// Storage keys
const STORAGE_KEYS = {
  LOGS: "kairu_logs",
  CHAT_HISTORY: "kairu_chat_history",
  ENABLED: "kairu_enabled",
  CONVERSATION: "kairu_conversation",
};

// Check if extension context is valid
function isExtensionContextValid(): boolean {
  try {
    // Try to access chrome.runtime.id
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// Handle extension context invalidation error
function handleContextInvalidation(error: any): boolean {
  const errorMessage = error?.message || String(error);
  if (errorMessage.includes("Extension context invalidated")) {
    console.warn("Extension context invalidated. Please reload the page.");
    return true;
  }
  return false;
}

// Save logs to storage
async function saveLogs() {
  if (!isExtensionContextValid()) return;

  const logContent = document.getElementById("kairu-log-content");
  if (!logContent) return;

  try {
    const logHtml = logContent.innerHTML;
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logHtml });
    console.log("[Kairu] Logs saved to storage");
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save logs:", error);
  }
}

// Restore logs from storage
async function restoreLogs() {
  if (!isExtensionContextValid()) return;

  const logContent = document.getElementById("kairu-log-content");
  if (!logContent) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
    console.log("[Kairu] Restoring logs from storage:", result);
    if (result[STORAGE_KEYS.LOGS]) {
      logContent.innerHTML = result[STORAGE_KEYS.LOGS];
      logContent.scrollTop = logContent.scrollHeight;
      console.log("[Kairu] Logs restored successfully");
    } else {
      console.log("[Kairu] No logs found in storage");
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore logs:", error);
  }
}

// Save chat history to storage
async function saveChatHistory() {
  if (!isExtensionContextValid()) return;

  const chatHistory = document.getElementById("kairu-chat-history");
  if (!chatHistory) return;

  try {
    const chatHtml = chatHistory.innerHTML;
    await chrome.storage.local.set({ [STORAGE_KEYS.CHAT_HISTORY]: chatHtml });
    console.log("[Kairu] Chat history saved to storage");
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save chat history:", error);
  }
}

// Restore chat history from storage
async function restoreChatHistory() {
  if (!isExtensionContextValid()) return;

  const chatHistory = document.getElementById("kairu-chat-history");
  if (!chatHistory) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
    console.log("[Kairu] Restoring chat history from storage:", result);
    if (result[STORAGE_KEYS.CHAT_HISTORY]) {
      chatHistory.innerHTML = result[STORAGE_KEYS.CHAT_HISTORY];
      chatHistory.scrollTop = chatHistory.scrollHeight;
      console.log("[Kairu] Chat history restored successfully");
    } else {
      console.log("[Kairu] No chat history found in storage");
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore chat history:", error);
  }
}

// Save enabled state to storage
async function saveEnabledState(enabled: boolean) {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: enabled });
    console.log("[Kairu] Enabled state saved to storage:", enabled);
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save enabled state:", error);
  }
}

// Restore enabled state from storage
async function restoreEnabledState() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ENABLED);
    console.log("[Kairu] Restoring enabled state from storage:", result);
    if (result[STORAGE_KEYS.ENABLED] !== undefined) {
      kairuEnabled = result[STORAGE_KEYS.ENABLED];
      const container = document.getElementById(KAIRU_CONTAINER_ID);
      if (container) {
        container.style.display = kairuEnabled ? "block" : "none";
      }
      console.log("[Kairu] Enabled state restored successfully:", kairuEnabled);
    } else {
      console.log("[Kairu] No enabled state found in storage");
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore enabled state:", error);
  }
}

// Save conversation history to storage
async function saveConversation() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONVERSATION]: conversationHistory,
    });
    console.log("[Kairu] Conversation history saved to storage");
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save conversation:", error);
  }
}

// Restore conversation history from storage
async function restoreConversation() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CONVERSATION);
    console.log("[Kairu] Restoring conversation from storage:", result);
    if (result[STORAGE_KEYS.CONVERSATION]) {
      conversationHistory = result[STORAGE_KEYS.CONVERSATION];
      console.log(
        "[Kairu] Conversation restored successfully:",
        conversationHistory.length,
        "messages"
      );
    } else {
      console.log("[Kairu] No conversation found in storage");
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore conversation:", error);
  }
}

// Clear conversation history
function clearConversation() {
  conversationHistory = [];
  if (isExtensionContextValid()) {
    try {
      chrome.storage.local.remove(STORAGE_KEYS.CONVERSATION);
      console.log("[Kairu] Conversation cleared from storage");
    } catch (error) {
      if (handleContextInvalidation(error)) return;
      console.error("[Kairu] Failed to clear conversation:", error);
    }
  }
}

// Logger
function addLog(
  message: string,
  type: "info" | "success" | "error" | "warning" = "info"
) {
  const logContent = document.getElementById("kairu-log-content");
  if (!logContent) return;

  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;

  // Save to storage
  saveLogs();
}

function addRawLog(title: string, content: string) {
  const logContent = document.getElementById("kairu-log-content");
  if (!logContent) return;

  const entry = document.createElement("div");
  entry.className = "log-entry info";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;

  const contentElement = document.createElement("div");
  contentElement.className = "log-raw";
  contentElement.textContent = content; // Use textContent to preserve HTML as plain text

  entry.appendChild(titleElement);
  entry.appendChild(contentElement);

  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;

  // Save to storage
  saveLogs();
}

function clearLog() {
  const logContent = document.getElementById("kairu-log-content");
  if (logContent) {
    logContent.innerHTML = "";
    // Clear storage as well
    if (isExtensionContextValid()) {
      try {
        chrome.storage.local.remove(STORAGE_KEYS.LOGS);
        console.log("[Kairu] Logs cleared from storage");
      } catch (error) {
        if (handleContextInvalidation(error)) return;
        console.error("[Kairu] Failed to clear logs from storage:", error);
      }
    }
  }
}

// Chat history
function addChatMessage(
  message: string,
  role: "user" | "assistant" | "system"
) {
  const chatHistory = document.getElementById("kairu-chat-history");
  if (!chatHistory) return;

  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${role}`;
  messageDiv.textContent = message;
  chatHistory.appendChild(messageDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Save to storage (only save user and assistant messages, not system)
  if (role !== "system") {
    saveChatHistory();
  }
}

// Add system message (status update) - returns the element so it can be updated
// Show status in the input panel
function showStatus(message: string) {
  const statusElement = document.getElementById("kairu-status");
  if (!statusElement) return;

  statusElement.textContent = message;
}

// Hide status in the input panel
function hideStatus() {
  const statusElement = document.getElementById("kairu-status");
  if (!statusElement) return;

  statusElement.textContent = "";
}

// Create Kairu UI
async function createKairuUI() {
  // Check if already exists
  if (document.getElementById(KAIRU_CONTAINER_ID)) {
    return;
  }

  // Create container
  const container = document.createElement("div");
  container.id = KAIRU_CONTAINER_ID;
  container.innerHTML = `
    <div id="kairu-character">
      <div class="kairu-avatar">
        <div class="kairu-avatar-inner">
          🐬
        </div>
      </div>
    </div>
    <div id="kairu-input-panel" style="display: none;">
      <div class="kairu-panel-header">
        <span>Kairuくん</span>
        <button id="kairu-reset-btn" title="会話をリセット">🔄</button>
      </div>
      <div id="kairu-chat-history"></div>
      <div class="kairu-input-container">
        <textarea id="${KAIRU_INPUT_ID}" placeholder="やりたいことを入力してください..."></textarea>
        <button id="kairu-submit-btn">送信</button>
      </div>
      <details id="kairu-debug-log">
        <summary>実行ログ</summary>
        <div id="kairu-log-content"></div>
      </details>
      <div id="kairu-status"></div>
    </div>
  `;

  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    #${KAIRU_CONTAINER_ID} {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: none;
    }

    #kairu-character {
      position: relative;
      right: 8px;
      bottom: 8px;
      z-index: 1;
      cursor: pointer;
      transition: transform 0.2s;
    }

    #kairu-character:hover {
      transform: scale(1.1);
    }

    #kairu-character.loading {
      animation: pendulum 1s ease-in-out infinite;
    }

    @keyframes pendulum {
      0%, 100% {
        transform: rotate(-15deg);
      }
      50% {
        transform: rotate(15deg);
      }
    }

    .kairu-avatar {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 2px;
    }

    .kairu-avatar-inner {
      width: 100%;
      height: 100%;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #kairu-input-panel {
      position: absolute;
      bottom: 0px;
      right: 0;
      width: 320px;
      background: rgba(255, 255, 255, 0.3);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      padding: 16px 16px 0px;
      animation: slideUp 0.3s ease;
    }

    #kairu-status {
      display: flex;
      align-items: center;
      height: 86px;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .kairu-panel-header {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #333;
      border-bottom: 2px solid #eee;
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    #kairu-reset-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }

    #kairu-reset-btn:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    #kairu-reset-btn:active {
      background: rgba(0, 0, 0, 0.1);
    }

    #kairu-chat-history {
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-message {
      padding: 8px 12px;
      border-radius: 12px;
      max-width: 90%;
      font-size: 13px;
      line-height: 1.4;
      word-wrap: break-word;
    }

    .chat-message.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .chat-message.assistant {
      align-self: flex-start;
      background: rgba(245, 245, 245, 0.8);
      color: #333;
    }

    .chat-message.system {
      align-self: center;
      background: rgba(102, 126, 234, 0.1);
      color: #667eea;
      font-size: 12px;
      font-style: italic;
      border: 1px solid rgba(102, 126, 234, 0.2);
    }

    .kairu-input-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #${KAIRU_INPUT_ID} {
      width: 100%;
      min-height: 60px;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      resize: vertical;
      box-sizing: border-box;
      font-family: inherit;
      background: rgba(255, 255, 255, 0.5);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    #${KAIRU_INPUT_ID}:focus {
      outline: none;
      border-color: #667eea;
      background: rgba(255, 255, 255, 0.7);
    }

    #kairu-submit-btn {
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    #kairu-submit-btn:hover {
      opacity: 0.9;
    }

    #kairu-submit-btn:active {
      opacity: 0.8;
    }

    #kairu-debug-log {
      margin-top: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 8px;
      background: #fafafa;
    }

    #kairu-debug-log summary {
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      padding: 4px;
      user-select: none;
    }

    #kairu-debug-log summary:hover {
      color: #333;
    }

    #kairu-log-content {
      margin-top: 8px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 11px;
      font-family: monospace;
      line-height: 1.4;
    }

    .log-entry {
      padding: 4px 8px;
      margin: 2px 0;
      border-radius: 4px;
      background: white;
      border-left: 3px solid #ccc;
    }

    .log-entry.info {
      border-left-color: #2196F3;
    }

    .log-entry.success {
      border-left-color: #4CAF50;
    }

    .log-entry.error {
      border-left-color: #f44336;
    }

    .log-entry.warning {
      border-left-color: #FF9800;
    }

    .log-time {
      color: #999;
      font-size: 10px;
    }

    .log-raw {
      margin-top: 8px;
      padding: 8px;
      background: #f0f0f0;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 150px;
      overflow-y: auto;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(container);

  // Restore logs, chat history, conversation, and enabled state from storage
  await restoreLogs();
  await restoreChatHistory();
  await restoreConversation();
  await restoreEnabledState();

  // Add event listeners
  const character = document.getElementById("kairu-character")!;
  const inputPanel = document.getElementById("kairu-input-panel")!;
  const input = document.getElementById(KAIRU_INPUT_ID) as HTMLTextAreaElement;
  const submitBtn = document.getElementById(
    "kairu-submit-btn"
  ) as HTMLButtonElement;
  const resetBtn = document.getElementById(
    "kairu-reset-btn"
  ) as HTMLButtonElement;

  // Reset button click
  resetBtn.addEventListener("click", () => {
    if (confirm("会話履歴をリセットしますか？")) {
      // Clear conversation history
      clearConversation();

      // Clear chat UI
      const chatHistory = document.getElementById("kairu-chat-history");
      if (chatHistory) {
        chatHistory.innerHTML = "";
        saveChatHistory(); // Save empty state
      }

      addLog("会話履歴をリセットしました", "info");
    }
  });

  // Show input panel on hover
  character.addEventListener("mouseenter", () => {
    inputPanel.style.display = "block";
    // Scroll chat history to bottom when panel is shown
    const chatHistory = document.getElementById("kairu-chat-history");
    if (chatHistory) {
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  });

  // Keep panel open when hovering over it
  container.addEventListener("mouseleave", () => {
    inputPanel.style.display = "none";
  });

  // Submit button click
  submitBtn.addEventListener("click", async () => {
    const userInput = input.value.trim();
    if (!userInput) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";
    clearLog();
    addLog(`ユーザー入力: ${userInput}`, "info");

    // Start loading animation
    character.classList.add("loading");

    // Add user message to chat history
    addChatMessage(userInput, "user");

    try {
      // Check if extension context is valid
      if (!isExtensionContextValid()) {
        addLog(
          "拡張機能が更新されました。ページをリロードしてください。",
          "error"
        );
        addChatMessage(
          "エラー: 拡張機能が更新されました。ページをリロード (F5) してください。",
          "assistant"
        );
        return;
      }

      // Get API key
      const response = await chrome.runtime.sendMessage({
        type: "GET_API_KEY",
      });
      const apiKey = response.apiKey;

      if (!apiKey) {
        addLog("APIキーが設定されていません", "error");
        addChatMessage(
          "エラー: APIキーが設定されていません。拡張機能のポップアップから設定してください。",
          "assistant"
        );
        return;
      }

      // Add user message to conversation history
      conversationHistory.push({
        role: "user",
        content: userInput,
      });

      // Keep only last 30 messages
      if (conversationHistory.length > MAX_HISTORY_LENGTH) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH);
      }

      // Call OpenAI API
      addLog("OpenAI APIを呼び出しています...", "info");
      const aiResponse = await callOpenAI(apiKey, userInput);
      addRawLog("AI応答 (生データ)", aiResponse);

      // Add assistant response to conversation history
      conversationHistory.push({
        role: "assistant",
        content: aiResponse,
      });

      // Keep only last 30 messages
      if (conversationHistory.length > MAX_HISTORY_LENGTH) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH);
      }

      // Save conversation to storage
      saveConversation();

      // Parse response and execute actions
      await processAIResponse(aiResponse);
      input.value = "";
    } catch (error) {
      console.error("Error:", error);

      // Handle context invalidation error
      if (handleContextInvalidation(error)) {
        addLog(
          "拡張機能が更新されました。ページをリロードしてください。",
          "error"
        );
        addChatMessage(
          "エラー: 拡張機能が更新されました。ページをリロード (F5) してください。",
          "assistant"
        );
        return;
      }

      const errorMsg = `エラーが発生しました: ${(error as Error).message}`;
      addLog(errorMsg, "error");
      addChatMessage(errorMsg, "assistant");
    } finally {
      // Stop loading animation
      character.classList.remove("loading");
      submitBtn.disabled = false;
      submitBtn.textContent = "送信";
    }
  });

  // Allow Cmd+Enter (or Ctrl+Enter on Windows) to submit
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitBtn.click();
    }
  });
}

// Get page HTML structure
function getPageHTML(): string {
  // Get body HTML, excluding Kairu UI
  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  // Remove Kairu UI
  const kairuContainer = bodyClone.querySelector(`#${KAIRU_CONTAINER_ID}`);
  if (kairuContainer) {
    kairuContainer.remove();
  }

  // Remove script tags, style tags, and comments
  bodyClone
    .querySelectorAll("script, style, noscript, svg, path")
    .forEach((el) => el.remove());

  // Get HTML
  let html = bodyClone.innerHTML;

  // Clean up excessive whitespace
  html = html.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();

  return html;
}

// Get interactive elements on the page (simplified list for reference)
function getPageElements(): string {
  const inputs = Array.from(
    document.querySelectorAll("input, textarea, select")
  );
  const buttons = Array.from(
    document.querySelectorAll("button, [role='button'], a")
  );

  // Helper function to check if element is visible
  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      (el as HTMLElement).offsetWidth > 0 &&
      (el as HTMLElement).offsetHeight > 0
    );
  };

  const inputInfo = inputs
    .filter((el) => !el.closest(`#${KAIRU_CONTAINER_ID}`) && isVisible(el))
    .map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type") || "text";
      const name = el.getAttribute("name") || "";
      const id = el.getAttribute("id") || "";
      const placeholder = el.getAttribute("placeholder") || "";
      const value = (el as HTMLInputElement).value?.substring(0, 50) || ""; // Increased from 20 to 50
      return `${i + 1}. <${tag}${type !== "text" ? ` type="${type}"` : ""}${
        name ? ` name="${name}"` : ""
      }${id ? ` id="${id}"` : ""}${
        placeholder ? ` placeholder="${placeholder}"` : ""
      }${value ? ` value="${value}"` : ""}>`;
    })
    .join("\n");

  const buttonInfo = buttons
    .filter((el) => !el.closest(`#${KAIRU_CONTAINER_ID}`) && isVisible(el))
    .map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.trim().substring(0, 80) || ""; // Increased from 30 to 80
      const id = el.getAttribute("id") || "";
      const className = el.getAttribute("class")?.split(" ")[0] || "";
      const role = el.getAttribute("role") || "";
      const href = el.getAttribute("href") || "";
      return `${i + 1}. <${tag}${id ? ` id="${id}"` : ""}${
        className ? ` class="${className}"` : ""
      }${role ? ` role="${role}"` : ""}${
        href ? ` href="${href.substring(0, 50)}"` : ""
      }> "${text}"`;
    })
    .join("\n");

  return `
入力可能な要素:
${inputInfo || "なし"}

クリック可能な要素:
${buttonInfo || "なし"}
`;
}

// Call OpenAI API with page information
async function callOpenAI(
  apiKey: string,
  userMessage: string
): Promise<string> {
  showStatus("📦 ページ情報を収集中...");

  // Collect page information
  addLog("インタラクティブ要素を取得中...", "info");
  const pageElements = getPageElements();
  addRawLog("検出されたページ要素", pageElements);

  addLog("ページHTML構造を取得中...", "info");
  const pageHTML = getPageHTML();
  addRawLog("送信するHTML構造", pageHTML);

  const pageContext = `
現在のページ情報:
- URL: ${window.location.href}
- タイトル: ${document.title}

## インタラクティブ要素（重要）
以下は、クリックや入力が可能な主要な要素のリストです。

${pageElements}

## ページのHTML構造
ページ全体のHTML構造です。正確なセレクタを作成するために使用してください。

${pageHTML}
`;

  showStatus("🐬💭 Kairuくんが処理を考えています...");

  const systemPrompt = `あなたはKairuというブラウザ操作アシスタントです。ユーザーの指示に従ってブラウザを操作します。

## 重要な指示

1. **インタラクティブ要素リストを優先的に参照する**
   - まず「インタラクティブ要素」セクションを確認してください
   - このリストには、クリック可能なボタンや入力欄が番号付きで整理されています
   - 操作対象の要素を特定する際は、このリストを最優先で使用してください
   - リストに記載されている要素の属性（id, name, type等）を使ってセレクタを作成してください

2. **正確なセレクタの作成 - 絶対に守るべきルール**
   - **禁止**: \`[href*="店名"]\` や \`[href*="ボタンのテキスト"]\` のようなセレクタは絶対に使用禁止
   - **理由**: href属性にはURL（例: "/tokyo/rstdtl/..."）が入っており、テキスト内容は含まれていません
   - **正しい方法**: リンクやボタンのテキスト内容でクリックする場合は、必ず\`text\`パラメータを使用してください

   **セレクタの優先順位:**
   1. id属性がある場合: \`#element-id\`
   2. name属性がある場合: \`[name="element-name"]\`
   3. class属性のみの場合: \`.class-name\`
   4. テキスト内容でクリックする場合: \`text\`パラメータを使用（selectorは不要）

   **具体例:**
   - ❌ 間違い: \`{"action": "click", "selector": "a[href*='和牛らーめん']"}\`
   - ✅ 正解: \`{"action": "click", "text": "和牛らーめん 極"}\`
   - ✅ 正解: \`{"action": "click", "selector": "a.list-rst__rst-name-target"}\`
   - ✅ 正解: \`{"action": "click", "selector": "button#submit-btn"}\`

3. **テキストコンテンツの参照**
   - インタラクティブ要素リストで見つからない場合、ページテキストを参照してください
   - テキストコンテンツはページに表示されている文字列のみです

4. **要素が見つからない場合**
   - インタラクティブ要素リストとテキストコンテンツの両方を見ても該当する要素がない場合は、messageで「〜が見つかりませんでした」と伝える
   - actionsは空配列にする

操作可能なアクション:
1. click: 要素をクリック
   - selectorで指定: \`{"action": "click", "selector": "button.submit-btn"}\`
   - textで指定: \`{"action": "click", "text": "ログイン"}\`
   - 推奨: テキストが表示されている要素は、textパラメータを使用する方が確実です
2. type: フォームに入力 (selectorで要素を指定、valueで入力値を指定)
3. navigate: ページ遷移 (urlで指定)
4. scroll: スクロール (directionで"up"か"down"を指定)
5. get_info: ページ情報を取得 (typeで"title", "url", "text"を指定)

応答形式 (必ずJSON):
{
  "message": "ユーザーへの説明（何をするか）",
  "actions": [
    {"action": "type", "selector": "input[name='q']", "value": "検索ワード"},
    {"action": "click", "text": "検索"}
  ]
}

**重要な注意事項:**
- リンクやボタンをテキストでクリックする場合、\`selector\`パラメータは完全に省略し、\`text\`パラメータのみを使用してください
- 例: \`{"action": "click", "text": "和牛らーめん 極"}\` ← selectorは不要
- \`[href*="..."]\`セレクタは絶対に使わないでください

会話のみの場合はactionsを空配列にしてください。`;

  // Build messages array with conversation history
  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    // Add conversation history (last 30 messages)
    ...conversationHistory,
    // Add current user message with page context
    {
      role: "user",
      content: pageContext + "\n\nユーザーの指示: " + userMessage,
    },
  ];

  // Calculate approximate token count (rough estimate: 1 token ≈ 4 characters)
  const requestBody = JSON.stringify({
    model: "gpt-5-nano",
    messages: messages,
  });
  const approxTokens = Math.ceil(requestBody.length / 4);

  addLog(
    `OpenAI APIにリクエスト送信中... (履歴: ${conversationHistory.length}件, 推定トークン: ${approxTokens})`,
    "info"
  );

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: requestBody,
  });

  if (!response.ok) {
    hideStatus();
    const errorText = await response.text();
    addLog(`APIエラー詳細: ${errorText}`, "error");
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  hideStatus();
  return data.choices[0].message.content;
}

// Process AI response and execute actions
async function processAIResponse(aiResponse: string): Promise<void> {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(aiResponse);
    addLog("AI応答を解析しました", "success");

    // Display message to user
    if (parsed.message) {
      addLog(`メッセージ: ${parsed.message}`, "info");
      // Add assistant message to chat history
      addChatMessage(parsed.message, "assistant");
    }

    // Execute actions
    if (parsed.actions && Array.isArray(parsed.actions)) {
      addLog(`${parsed.actions.length}個のアクションを実行します`, "info");
      for (let i = 0; i < parsed.actions.length; i++) {
        const action = parsed.actions[i];
        addLog(
          `アクション ${i + 1}/${parsed.actions.length}: ${action.action}`,
          "info"
        );
        try {
          await executeAction(action);
        } catch (error) {
          const errorMsg = `アクション実行エラー: ${(error as Error).message}`;
          addLog(errorMsg, "error");
          // Also show error in chat
          addChatMessage(`❌ ${errorMsg}`, "assistant");
        }
        // Wait between actions (longer delay to see each action clearly)
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      addLog("すべてのアクションが完了しました", "success");
    } else {
      addLog("実行するアクションはありません", "info");
    }
  } catch (e) {
    // If not JSON, treat as plain text
    addLog("JSON解析失敗。テキストとして表示します", "warning");
    addChatMessage(aiResponse, "assistant");
  }
}

// Execute a single action
async function executeAction(action: any): Promise<void> {
  console.log("Executing action:", action);

  // Enable AI operation mode to allow interactions
  isAIOperating = true;
  addLog("AI操作モード: ON", "info");

  try {
    switch (action.action) {
      case "click":
        await clickElement(action.selector, action.text);
        break;
      case "type":
        await typeInElement(action.selector, action.value);
        break;
      case "navigate":
        window.location.href = action.url;
        break;
      case "scroll":
        scrollPage(action.direction);
        break;
      case "get_info":
        const info = getPageInfo(action.type);
        console.log("Page info:", info);
        break;
      default:
        console.warn("Unknown action:", action.action);
    }
  } finally {
    // Disable AI operation mode after a short delay
    setTimeout(() => {
      isAIOperating = false;
      addLog("AI操作モード: OFF", "info");
    }, 100);
  }
}

// Click an element
async function clickElement(selector?: string, text?: string): Promise<void> {
  let element: HTMLElement | null = null;

  if (selector) {
    addLog(`セレクタで要素を検索: ${selector}`, "info");
    element = document.querySelector(selector);
  }

  if (!element && text) {
    addLog(`テキストで要素を検索: ${text}`, "info");
    // Search by text content
    const allElements = document.querySelectorAll("button, a, [role='button']");
    for (const el of Array.from(allElements)) {
      if (el.textContent?.trim().includes(text)) {
        element = el as HTMLElement;
        break;
      }
    }
  }

  if (element) {
    element.click();
    addLog(
      `要素をクリックしました: ${
        element.tagName
      } - ${element.textContent?.substring(0, 30)}`,
      "success"
    );
    console.log("Clicked element:", element);
  } else {
    const errorMsg = `要素が見つかりませんでした (selector: ${selector}, text: ${text})`;
    addLog(errorMsg, "error");
    throw new Error(errorMsg);
  }
}

// Type into an input element
async function typeInElement(selector: string, value: string): Promise<void> {
  addLog(`入力欄を検索: ${selector}`, "info");
  const element = document.querySelector(selector) as
    | HTMLInputElement
    | HTMLTextAreaElement;

  if (element) {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    addLog(
      `入力しました: "${value}" → ${element.tagName}[${
        element.name || element.id
      }]`,
      "success"
    );
    console.log("Typed into element:", element);
  } else {
    const errorMsg = `入力欄が見つかりませんでした: ${selector}`;
    addLog(errorMsg, "error");
    throw new Error(errorMsg);
  }
}

// Scroll the page
function scrollPage(direction: string): void {
  const scrollAmount = window.innerHeight * 0.8;
  if (direction === "down") {
    window.scrollBy({ top: scrollAmount, behavior: "smooth" });
    addLog(`下にスクロールしました (${scrollAmount}px)`, "success");
  } else if (direction === "up") {
    window.scrollBy({ top: -scrollAmount, behavior: "smooth" });
    addLog(`上にスクロールしました (${scrollAmount}px)`, "success");
  }
}

// Get page information
function getPageInfo(type: string): string {
  switch (type) {
    case "title":
      return document.title;
    case "url":
      return window.location.href;
    case "text":
      return document.body.innerText.substring(0, 500);
    default:
      return "";
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "TOGGLE_KAIRU") {
    kairuEnabled = request.enabled;
    console.log("Kairu mode:", kairuEnabled ? "enabled" : "disabled");

    // Show or hide Kairu UI
    const container = document.getElementById(KAIRU_CONTAINER_ID);
    if (container) {
      container.style.display = kairuEnabled ? "block" : "none";
    }

    // Save enabled state to storage
    saveEnabledState(kairuEnabled);

    sendResponse({ success: true });
  }
  return true;
});

// Block all page interactions except Kairu UI
function blockPageInteractions(e: Event) {
  // Don't block if Kairu is disabled
  if (!kairuEnabled) {
    return;
  }

  const target = e.target as HTMLElement;

  // Allow interactions with Kairu UI
  if (target.closest(`#${KAIRU_CONTAINER_ID}`)) {
    return;
  }

  // Allow AI operations
  if (isAIOperating) {
    return;
  }

  // Block everything else
  e.preventDefault();
  e.stopPropagation();
}

// Initialize when page is fully loaded (including JS-generated content)
if (document.readyState === "complete") {
  // Page already loaded
  createKairuUI();
} else {
  // Wait for page to fully load
  window.addEventListener("load", () => {
    // Add small delay to allow JS to populate content
    setTimeout(createKairuUI, 500);
  });
}

// Block all interactions
const events = [
  "click",
  "mousedown",
  "mouseup",
  "keydown",
  "keypress",
  "keyup",
  "submit",
];
events.forEach((eventType) => {
  document.addEventListener(eventType, blockPageInteractions, true);
});
