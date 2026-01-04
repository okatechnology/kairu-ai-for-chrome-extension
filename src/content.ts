// Content Script
console.log("Kairu AI Content Script loaded");

// Kairu settings
const KAIRU_CONTAINER_ID = "kairu-ai-container";
const KAIRU_INPUT_ID = "kairu-ai-input";

// Kairu enabled state
let kairuEnabled = false;

// Conversation history (keep last 1000 messages)
interface Message {
  role: "user" | "assistant";
  content: string;
}
let conversationHistory: Message[] = [];
const MAX_HISTORY_LENGTH = 1000;

// サイト種別
type SiteType = "text" | "sns" | "video";

// Quiz-related state
interface VisitedSite {
  url: string;
  title: string;
  visitedAt: number;
  content: string; // Summary of page content
  siteType: SiteType; // サイトの種別
}

// 日付別の閲覧履歴
interface DailyVisitedSites {
  [date: string]: VisitedSite[]; // 日付 (YYYY-MM-DD) をキーとした閲覧履歴
}

// 1問分のクイズ
interface QuizQuestion {
  question: string;
  options: string[]; // 3 choices
  correctAnswer: number; // Index of correct answer (0-2)
}

interface QuizState {
  isQuizMode: boolean;
  currentQuiz: {
    question: string;
    options: string[]; // 3-4 choices (legacy support)
    correctAnswer: number; // Index of correct answer (0-3)
  } | null;
  attempts: number;
  // 新しい5問クイズ用
  quizQuestions: QuizQuestion[]; // 5問のクイズ
  currentQuestionIndex: number; // 現在の問題番号 (0-4)
  correctCount: number; // 正解数
}

let messageCount = 0; // Count of user-assistant message pairs
let lastQuizCount = 0; // Message count when last quiz was given
let visitedSites: VisitedSite[] = [];
let dailyVisitedSites: DailyVisitedSites = {}; // 日付別の閲覧履歴
let lastSessionEnd: number = 0; // 前回セッション終了時のタイムスタンプ（レガシー）
let lastMessageSent: number = 0; // 最後にメッセージを送った時刻
let quizShownToday: string = ""; // 今日クイズを表示した日付 (YYYY-MM-DD)
let quizState: QuizState = {
  isQuizMode: false,
  currentQuiz: null,
  attempts: 0,
  quizQuestions: [],
  currentQuestionIndex: 0,
  correctCount: 0,
};

// クイズ生成中フラグ（多重送信防止用）
let isGeneratingQuiz = false;
// クイズ生成ID（多重レスポンス破棄用）
let currentQuizGenerationId: string | null = null;
const MAX_VISITED_SITES = 50; // Keep track of last 50 sites
const QUIZ_INTERVAL = 5; // Quiz every 5 message pairs (legacy, not used in new logic)

// ========================================
// クイズ出題タイミング設定
// ========================================
const QUIZ_INTERVAL_MS_NORMAL = 24 * 60 * 60 * 1000; // 本番: 24時間
const QUIZ_INTERVAL_MS_DEBUG = 20 * 1000; // デバッグ: 30秒

// デバッグモードフラグ
let debugMode = false;

// クイズ間隔を取得する関数
function getQuizIntervalMs(): number {
  return debugMode ? QUIZ_INTERVAL_MS_DEBUG : QUIZ_INTERVAL_MS_NORMAL;
}

// クイズの問題数
const QUIZ_QUESTION_COUNT = 5;

// 日別閲覧履歴の最大保持日数
const MAX_DAILY_HISTORY_DAYS = 7;

// Storage keys
const STORAGE_KEYS = {
  LOGS: "kairu_logs",
  CHAT_HISTORY: "kairu_chat_history",
  ENABLED: "kairu_enabled",
  CONVERSATION: "kairu_conversation",
  POSITION: "kairu_position",
  MESSAGE_COUNT: "kairu_message_count",
  LAST_QUIZ_COUNT: "kairu_last_quiz_count",
  VISITED_SITES: "kairu_visited_sites",
  QUIZ_STATE: "kairu_quiz_state",
  WINDOW_OPEN: "kairu_window_open",
  LAST_SESSION_END: "kairu_last_session_end", // 前回終了時のタイムスタンプ（レガシー）
  LAST_MESSAGE_SENT: "kairu_last_message_sent", // 最後にメッセージを送った時刻
  DAILY_VISITED_SITES: "kairu_daily_visited_sites", // 日付別の閲覧履歴
  QUIZ_SHOWN_TODAY: "kairu_quiz_shown_today", // 今日クイズを表示したか
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
      // Don't scroll here - window might be hidden (display: none)
      // Scrolling will be done in restoreWindowState if window is open
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

// Restore debug mode from storage
async function restoreDebugMode() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get("kairu_debug_mode");
    if (result.kairu_debug_mode !== undefined) {
      debugMode = result.kairu_debug_mode;
      console.log("[Kairu] Debug mode restored:", debugMode);
      updateDebugUIVisibility();
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore debug mode:", error);
  }
}

// Quiz timer update interval
let quizTimerInterval: ReturnType<typeof setInterval> | null = null;

// Update debug UI visibility based on debug mode
function updateDebugUIVisibility() {
  const debugLog = document.getElementById("kairu-debug-log");
  const quizTimer = document.getElementById("kairu-next-quiz-timer");

  if (debugLog) {
    debugLog.style.display = debugMode ? "block" : "none";
  }

  if (quizTimer) {
    quizTimer.style.display = debugMode ? "block" : "none";
  }

  // Start or stop quiz timer updates
  if (debugMode) {
    startQuizTimerUpdates();
  } else {
    stopQuizTimerUpdates();
  }
}

// Start periodic quiz timer updates
function startQuizTimerUpdates() {
  // Clear existing interval
  if (quizTimerInterval !== null) {
    clearInterval(quizTimerInterval);
  }

  // Update immediately
  updateQuizTimerDisplay();

  // Update every second
  quizTimerInterval = setInterval(updateQuizTimerDisplay, 1000);
}

// Stop quiz timer updates
function stopQuizTimerUpdates() {
  if (quizTimerInterval !== null) {
    clearInterval(quizTimerInterval);
    quizTimerInterval = null;
  }
}

// Update quiz timer display
function updateQuizTimerDisplay() {
  const timerText = document.getElementById("kairu-next-quiz-text");
  if (!timerText) return;

  // クイズモード中は別のメッセージを表示
  if (quizState.isQuizMode) {
    timerText.textContent = "クイズモード中";
    return;
  }

  // クイズ生成中は別のメッセージを表示
  if (isGeneratingQuiz) {
    timerText.textContent = "クイズ生成中...";
    return;
  }

  // まだメッセージを送ったことがない場合
  if (lastMessageSent === 0) {
    timerText.textContent = "メッセージ送信後にカウント開始";
    return;
  }

  const now = Date.now();
  const quizInterval = getQuizIntervalMs();
  const timeSinceLastMessage = now - lastMessageSent;
  const timeRemaining = quizInterval - timeSinceLastMessage;

  if (timeRemaining <= 0) {
    timerText.textContent = "次のフォーカスでクイズ出題";
  } else {
    // 時間をフォーマット
    const seconds = Math.floor(timeRemaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      timerText.textContent = `次のクイズまで: ${hours}時間${minutes % 60}分${
        seconds % 60
      }秒`;
    } else if (minutes > 0) {
      timerText.textContent = `次のクイズまで: ${minutes}分${seconds % 60}秒`;
    } else {
      timerText.textContent = `次のクイズまで: ${seconds}秒`;
    }
  }
}

// Save position to storage
async function savePosition(bottom: number, right: number) {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.POSITION]: { bottom, right },
    });
    console.log("[Kairu] Position saved to storage:", { bottom, right });
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save position:", error);
  }
}

// Restore position from storage
async function restorePosition() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.POSITION);
    console.log("[Kairu] Restoring position from storage:", result);
    if (result[STORAGE_KEYS.POSITION]) {
      const { bottom, right } = result[STORAGE_KEYS.POSITION];
      const container = document.getElementById(KAIRU_CONTAINER_ID);
      if (container) {
        container.style.bottom = `${bottom}px`;
        container.style.right = `${right}px`;
      }
      console.log("[Kairu] Position restored successfully:", { bottom, right });
    } else {
      console.log("[Kairu] No position found in storage, using default");
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore position:", error);
  }
}

// Restore window open/close state from storage
async function restoreWindowState() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.WINDOW_OPEN);
    console.log("[Kairu] Restoring window state from storage:", result);
    const inputPanel = document.getElementById("kairu-input-panel");
    if (inputPanel) {
      const isOpen = result[STORAGE_KEYS.WINDOW_OPEN] === true;
      inputPanel.style.display = isOpen ? "block" : "none";
      console.log(
        "[Kairu] Window state restored successfully:",
        isOpen ? "open" : "closed"
      );

      // Scroll chat history to bottom if window is open
      // Use requestAnimationFrame + setTimeout to ensure layout is complete
      if (isOpen) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const chatHistory = document.getElementById("kairu-chat-history");
            if (chatHistory) {
              console.log(
                "[Kairu] Before scroll - scrollTop:",
                chatHistory.scrollTop,
                "scrollHeight:",
                chatHistory.scrollHeight
              );
              chatHistory.scrollTop = chatHistory.scrollHeight;
              console.log(
                "[Kairu] After scroll - scrollTop:",
                chatHistory.scrollTop,
                "scrollHeight:",
                chatHistory.scrollHeight
              );
            }
          }, 100);
        });
      }
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore window state:", error);
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

// Save message count to storage
async function saveMessageCount() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.MESSAGE_COUNT]: messageCount,
    });
    console.log("[Kairu] Message count saved to storage:", messageCount);
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save message count:", error);
  }
}

// Restore message count from storage
async function restoreMessageCount() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.MESSAGE_COUNT);
    if (result[STORAGE_KEYS.MESSAGE_COUNT] !== undefined) {
      messageCount = result[STORAGE_KEYS.MESSAGE_COUNT];
      console.log("[Kairu] Message count restored:", messageCount);
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore message count:", error);
  }
}

// Save last quiz count to storage
async function saveLastQuizCount() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_QUIZ_COUNT]: lastQuizCount,
    });
    console.log("[Kairu] Last quiz count saved to storage:", lastQuizCount);
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save last quiz count:", error);
  }
}

// Restore last quiz count from storage
async function restoreLastQuizCount() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_QUIZ_COUNT);
    if (result[STORAGE_KEYS.LAST_QUIZ_COUNT] !== undefined) {
      lastQuizCount = result[STORAGE_KEYS.LAST_QUIZ_COUNT];
      console.log("[Kairu] Last quiz count restored:", lastQuizCount);
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore last quiz count:", error);
  }
}

// Save visited sites to storage
async function saveVisitedSites() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.VISITED_SITES]: visitedSites,
    });
    console.log("[Kairu] Visited sites saved to storage:", visitedSites.length);
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save visited sites:", error);
  }
}

// Restore visited sites from storage
async function restoreVisitedSites() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.VISITED_SITES);
    if (result[STORAGE_KEYS.VISITED_SITES]) {
      visitedSites = result[STORAGE_KEYS.VISITED_SITES];
      console.log("[Kairu] Visited sites restored:", visitedSites.length);
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore visited sites:", error);
  }
}

// Save quiz state to storage
async function saveQuizState() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.QUIZ_STATE]: quizState });
    console.log("[Kairu] Quiz state saved to storage");
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save quiz state:", error);
  }
}

// Restore quiz state from storage
async function restoreQuizState() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.QUIZ_STATE);
    if (result[STORAGE_KEYS.QUIZ_STATE]) {
      quizState = result[STORAGE_KEYS.QUIZ_STATE];
      console.log("[Kairu] Quiz state restored:", quizState);

      // If in quiz mode, regenerate quiz buttons (they don't have event listeners after reload)
      if (quizState.isQuizMode && quizState.currentQuiz) {
        console.log("[Kairu] Regenerating quiz buttons after reload");

        // Remove old quiz message from chat history
        const oldQuiz = document.getElementById("kairu-current-quiz");
        if (oldQuiz) {
          oldQuiz.remove();
        }

        // Regenerate quiz with working buttons
        addQuizMessage(
          quizState.currentQuiz.question,
          quizState.currentQuiz.options
        );
      }
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore quiz state:", error);
  }
}

// Save last session end timestamp
async function saveLastSessionEnd() {
  if (!isExtensionContextValid()) return;

  try {
    lastSessionEnd = Date.now();
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_SESSION_END]: lastSessionEnd,
    });
    console.log(
      "[Kairu] Last session end saved:",
      new Date(lastSessionEnd).toLocaleString()
    );
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save last session end:", error);
  }
}

// Restore last session end timestamp
async function restoreLastSessionEnd() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(
      STORAGE_KEYS.LAST_SESSION_END
    );
    if (result[STORAGE_KEYS.LAST_SESSION_END]) {
      lastSessionEnd = result[STORAGE_KEYS.LAST_SESSION_END];
      console.log(
        "[Kairu] Last session end restored:",
        new Date(lastSessionEnd).toLocaleString()
      );
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore last session end:", error);
  }
}

// Save last message sent timestamp
async function saveLastMessageSent() {
  if (!isExtensionContextValid()) return;

  try {
    lastMessageSent = Date.now();
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_MESSAGE_SENT]: lastMessageSent,
    });
    console.log(
      "[Kairu] Last message sent saved:",
      new Date(lastMessageSent).toLocaleString()
    );
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save last message sent:", error);
  }
}

// Restore last message sent timestamp
async function restoreLastMessageSent() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(
      STORAGE_KEYS.LAST_MESSAGE_SENT
    );
    if (result[STORAGE_KEYS.LAST_MESSAGE_SENT]) {
      lastMessageSent = result[STORAGE_KEYS.LAST_MESSAGE_SENT];
      console.log(
        "[Kairu] Last message sent restored:",
        new Date(lastMessageSent).toLocaleString()
      );
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore last message sent:", error);
  }
}

// Get today's date string (YYYY-MM-DD)
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

// Get yesterday's date string (YYYY-MM-DD)
function getYesterdayDateString(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

// Format timestamp to human-readable time (e.g., "2026年1月4日 14:30頃")
function formatVisitTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}年${month}月${day}日 ${hours}:${minutes}頃`;
}

// Save daily visited sites to storage
async function saveDailyVisitedSites() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.DAILY_VISITED_SITES]: dailyVisitedSites,
    });
    console.log("[Kairu] Daily visited sites saved");
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save daily visited sites:", error);
  }
}

// Restore daily visited sites from storage
async function restoreDailyVisitedSites() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(
      STORAGE_KEYS.DAILY_VISITED_SITES
    );
    if (result[STORAGE_KEYS.DAILY_VISITED_SITES]) {
      dailyVisitedSites = result[STORAGE_KEYS.DAILY_VISITED_SITES];
      console.log(
        "[Kairu] Daily visited sites restored:",
        Object.keys(dailyVisitedSites).length,
        "days"
      );

      // Clean up old entries (keep only last MAX_DAILY_HISTORY_DAYS days)
      cleanupOldDailyHistory();
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore daily visited sites:", error);
  }
}

// Clean up daily history older than MAX_DAILY_HISTORY_DAYS
async function cleanupOldDailyHistory() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_DAILY_HISTORY_DAYS);
  const cutoffDateString = `${cutoffDate.getFullYear()}-${String(
    cutoffDate.getMonth() + 1
  ).padStart(2, "0")}-${String(cutoffDate.getDate()).padStart(2, "0")}`;

  let cleaned = false;
  for (const dateKey of Object.keys(dailyVisitedSites)) {
    if (dateKey < cutoffDateString) {
      delete dailyVisitedSites[dateKey];
      cleaned = true;
    }
  }

  if (cleaned) {
    await saveDailyVisitedSites();
    console.log("[Kairu] Cleaned up old daily history");
  }
}

// Save quiz shown today flag
async function saveQuizShownToday() {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.QUIZ_SHOWN_TODAY]: quizShownToday,
    });
    console.log("[Kairu] Quiz shown today saved:", quizShownToday);
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to save quiz shown today:", error);
  }
}

// Restore quiz shown today flag
async function restoreQuizShownToday() {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get(
      STORAGE_KEYS.QUIZ_SHOWN_TODAY
    );
    if (result[STORAGE_KEYS.QUIZ_SHOWN_TODAY]) {
      quizShownToday = result[STORAGE_KEYS.QUIZ_SHOWN_TODAY];
      console.log("[Kairu] Quiz shown today restored:", quizShownToday);
    }
  } catch (error) {
    if (handleContextInvalidation(error)) return;
    console.error("[Kairu] Failed to restore quiz shown today:", error);
  }
}

// SNS・動画サイトのドメインリスト
const SNS_VIDEO_DOMAINS = [
  "youtube.com",
  "www.youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "twitch.tv",
  "www.twitch.tv",
  "nicovideo.jp",
  "www.nicovideo.jp",
  "dailymotion.com",
  "www.dailymotion.com",
  "vimeo.com",
  "www.vimeo.com",
  "reddit.com",
  "www.reddit.com",
  "threads.net",
  "www.threads.net",
  "linkedin.com",
  "www.linkedin.com",
];

// サイト種別を判定する関数
function detectSiteType(url: string): SiteType {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    // SNS・動画サイトかチェック
    for (const domain of SNS_VIDEO_DOMAINS) {
      if (hostname === domain || hostname.endsWith("." + domain)) {
        // YouTube, TikTok, Twitch, ニコ動などは動画サイト
        if (
          hostname.includes("youtube") ||
          hostname.includes("tiktok") ||
          hostname.includes("twitch") ||
          hostname.includes("nicovideo") ||
          hostname.includes("dailymotion") ||
          hostname.includes("vimeo")
        ) {
          return "video";
        }
        // それ以外はSNS
        return "sns";
      }
    }

    // デフォルトはテキストベース
    return "text";
  } catch {
    return "text";
  }
}

// Record current site visit
async function recordSiteVisit() {
  const currentUrl = window.location.href;
  const currentTitle = document.title;

  // Get page content summary (first 500 characters of visible text)
  const pageText = document.body.innerText.substring(0, 500);

  // サイト種別を判定
  const siteType = detectSiteType(currentUrl);

  // Check if this URL is already in the list (update if exists)
  const existingIndex = visitedSites.findIndex(
    (site) => site.url === currentUrl
  );

  const siteInfo: VisitedSite = {
    url: currentUrl,
    title: currentTitle,
    visitedAt: Date.now(),
    content: pageText,
    siteType: siteType,
  };

  if (existingIndex >= 0) {
    // Update existing entry
    visitedSites[existingIndex] = siteInfo;
  } else {
    // Add new entry
    visitedSites.push(siteInfo);

    // Keep only last MAX_VISITED_SITES
    if (visitedSites.length > MAX_VISITED_SITES) {
      visitedSites = visitedSites.slice(-MAX_VISITED_SITES);
    }
  }

  await saveVisitedSites();

  // 日付別履歴にも追加
  const today = getTodayDateString();
  if (!dailyVisitedSites[today]) {
    dailyVisitedSites[today] = [];
  }

  // 同じURLが今日すでにあれば更新、なければ追加
  const dailyExistingIndex = dailyVisitedSites[today].findIndex(
    (site) => site.url === currentUrl
  );
  if (dailyExistingIndex >= 0) {
    dailyVisitedSites[today][dailyExistingIndex] = siteInfo;
  } else {
    dailyVisitedSites[today].push(siteInfo);

    // 1日あたりの最大件数制限
    if (dailyVisitedSites[today].length > MAX_VISITED_SITES) {
      dailyVisitedSites[today] = dailyVisitedSites[today].slice(
        -MAX_VISITED_SITES
      );
    }
  }

  await saveDailyVisitedSites();
  console.log("[Kairu] Recorded site visit:", currentTitle, "type:", siteType);
}

// Check if it's time to show a quiz (triggered on input focus)
function shouldShowQuizOnFocus(): boolean {
  // Don't show quiz if already in quiz mode
  if (quizState.isQuizMode) {
    console.log("[Kairu] Quiz check: already in quiz mode");
    return false;
  }

  // Check if enough time has passed since last message sent
  if (lastMessageSent === 0) {
    console.log("[Kairu] Quiz check: no previous message");
    return false;
  }

  const timeSinceLastMessage = Date.now() - lastMessageSent;
  const quizInterval = getQuizIntervalMs();
  if (timeSinceLastMessage < quizInterval) {
    console.log(
      "[Kairu] Quiz check: not enough time passed",
      timeSinceLastMessage,
      "ms (need",
      quizInterval,
      "ms)"
    );
    return false;
  }

  console.log("[Kairu] Quiz check: should show quiz!");
  return true;
}

// Legacy function - check if it's time to show a quiz (based on message count)
function shouldShowQuiz(): boolean {
  // Don't show quiz if already in quiz mode
  if (quizState.isQuizMode) {
    return false;
  }

  // Need at least 2 visited sites to create a quiz
  if (visitedSites.length < 2) {
    return false;
  }

  // Check if enough messages have passed since last quiz
  const messagesSinceLastQuiz = messageCount - lastQuizCount;
  return messagesSinceLastQuiz >= QUIZ_INTERVAL;
}

// Generate quiz using OpenAI API
async function generateQuiz(
  apiKey: string
): Promise<{ question: string; options: string[]; correctAnswer: number }> {
  // Select a random visited site (not the current one)
  const currentUrl = window.location.href;
  const eligibleSites = visitedSites.filter((site) => site.url !== currentUrl);

  if (eligibleSites.length === 0) {
    // Fallback to all sites if current URL doesn't match
    eligibleSites.push(...visitedSites);
  }

  const randomSite =
    eligibleSites[Math.floor(Math.random() * eligibleSites.length)];

  const quizPrompt = `以下のサイト情報を基に、ユーザーが過去に訪問したサイトの内容を理解しているか確認するための4択クイズを1つ作成してください。

サイト情報:
- タイトル: ${randomSite.title}
- URL: ${randomSite.url}
- 内容の一部: ${randomSite.content}

クイズの条件:
1. 質問文には必ずサイトのタイトル（「${randomSite.title}」）を含めること
2. 「このサイト」という表現は使わず、具体的なサイト名を使うこと
3. 「先ほど見た〜」「以前訪問した〜」などの表現を使って、過去のサイトであることを明示すること
4. サイトの主なテーマや内容に関する質問にする
5. 4つの選択肢を用意する（1つが正解、3つが不正解）
6. 不正解の選択肢は、もっともらしいが明らかに違うものにする
7. 正解の選択肢のインデックス（0-3）も返す

質問文の例:
- 「先ほど見た「${randomSite.title}」の主なテーマは何でしたか？」
- 「以前訪問した「${randomSite.title}」で紹介されていた内容は何ですか？」

以下のJSON形式で応答してください：
{
  "question": "質問文",
  "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "correctAnswer": 0
}`;

  // Log the quiz generation prompt
  addLog("クイズ生成プロンプトを送信中...", "info");
  addRawLog("クイズ生成プロンプト", quizPrompt);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            "あなたはクイズを作成するアシスタントです。ユーザーが訪問したサイトの内容を理解しているか確認する4択クイズを作成します。",
        },
        {
          role: "user",
          content: quizPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Quiz generation failed: ${response.status}`);
  }

  const data = await response.json();
  const aiResponseContent = data.choices[0].message.content;

  // Log the quiz generation response
  addLog("クイズ生成完了", "success");
  addRawLog("クイズ生成レスポンス", aiResponseContent);

  const quizData = JSON.parse(aiResponseContent);

  return {
    question: quizData.question,
    options: quizData.options,
    correctAnswer: quizData.correctAnswer,
  };
}

// Generate 5 quizzes based on browsing history since last quiz
async function generateDailyQuizzes(apiKey: string): Promise<QuizQuestion[]> {
  // 前回クイズ出題後から今までの閲覧履歴を使用
  const sitesForQuiz = [...visitedSites];

  // 閲覧履歴がない場合は空配列を返す（クイズをスキップ）
  if (sitesForQuiz.length === 0) {
    console.log("[Kairu] 閲覧履歴がないためクイズをスキップ");
    return [];
  }

  // サイトをテキスト系とSNS/動画系に分類
  const textSites = sitesForQuiz.filter((site) => site.siteType === "text");
  const snsVideoSites = sitesForQuiz.filter(
    (site) => site.siteType === "sns" || site.siteType === "video"
  );

  // クイズ生成用のプロンプトを作成
  let quizPrompt = `ユーザーが最近閲覧したサイトの情報を基に、${QUIZ_QUESTION_COUNT}問の3択クイズを作成してください。

## 閲覧したサイト一覧:\n`;

  // サイト情報を追加（閲覧時刻を含める）
  sitesForQuiz.forEach((site) => {
    const visitTimeStr = formatVisitTime(site.visitedAt);
    quizPrompt += `
### ${site.title}
- URL: ${site.url}
- 閲覧時刻: ${visitTimeStr}
- 種別: ${
      site.siteType === "text"
        ? "テキストベース"
        : site.siteType === "sns"
        ? "SNS"
        : "動画サイト"
    }
- 内容の一部: ${site.content.substring(0, 300)}
`;
  });

  quizPrompt += `
## クイズ作成のルール:

### 絶対に禁止:
- 「サイト1」「サイト2」「サイト49」のような「サイト + 数字」という表現は絶対に使わないでください
- URLやURLの一部（パス、ID、パラメータなど）に関する問題は絶対に出さないでください
- 例えば「このURLのパスは？」「status/123456のIDは？」のような問題は禁止です
- 質問文や選択肢にURLをそのまま含めないでください

### 良いクイズの例:
- 「○○というサイトで読んだ記事のテーマは何でしたか？」
- 「YouTubeで見た動画のジャンルは？」
- 「1月4日の午後に閲覧したサイトはどれですか？」
- 「○○の記事で紹介されていた内容として正しいものは？」

### テキストベースのサイトに関するクイズ（${textSites.length}件のサイトがあります）:
- サイトの内容に関する具体的な質問を作成
- ページの内容やテーマについて質問する

### SNS・動画サイトに関するクイズ（${snsVideoSites.length}件のサイトがあります）:
- 閲覧履歴の流れや閲覧時刻に関する質問を作成
- どのサイトを見たか、いつ見たかなどを質問する
- 例: 「14時頃に閲覧していたサイトは何でしたか。」
- 例: 「昨日の夜に見ていたサイトはどれでしょうか。」

### 共通ルール:
1. 各問題は3つの選択肢を用意（1つが正解、2つが不正解）
2. 不正解の選択肢は、もっともらしいが明らかに違うものにする
3. 正解の選択肢のインデックス（0-2）も返す
4. テキストベースサイトとSNS/動画サイトの両方からバランスよく出題する
5. 閲覧時刻を活用した問題も積極的に出題する

## 出力形式（厳守）:
以下のJSON配列形式で${QUIZ_QUESTION_COUNT}問分を応答してください：
[
  {
    "question": "質問文1",
    "options": ["選択肢A", "選択肢B", "選択肢C"],
    "correctAnswer": 0
  },
  {
    "question": "質問文2",
    "options": ["選択肢A", "選択肢B", "選択肢C"],
    "correctAnswer": 1
  },
  ...
]`;

  addLog("5問クイズ生成プロンプトを送信中...", "info");
  addRawLog("クイズ生成プロンプト", quizPrompt);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            "あなたはクイズを作成するアシスタントです。ユーザーが最近訪問したサイトの内容を理解しているか確認する3択クイズを5問作成します。必ずJSON配列形式で応答してください。",
        },
        {
          role: "user",
          content: quizPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Quiz generation failed: ${response.status}`);
  }

  const data = await response.json();
  let aiResponseContent = data.choices[0].message.content;

  addLog("5問クイズ生成完了", "success");
  addRawLog("クイズ生成レスポンス", aiResponseContent);

  // JSONブロックから配列を抽出（```json ... ``` に囲まれている場合の対応）
  const jsonMatch = aiResponseContent.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    aiResponseContent = jsonMatch[1];
  }

  const quizzes: QuizQuestion[] = JSON.parse(aiResponseContent);

  // 5問に足りない場合は補完
  while (quizzes.length < QUIZ_QUESTION_COUNT) {
    quizzes.push({
      question: `最近訪問したサイトについての質問です。（問題${
        quizzes.length + 1
      }）`,
      options: ["選択肢A", "選択肢B", "選択肢C"],
      correctAnswer: 0,
    });
  }

  return quizzes.slice(0, QUIZ_QUESTION_COUNT);
}

// Start new 5-question quiz mode (startup quiz)
async function startStartupQuizMode(apiKey: string): Promise<void> {
  // 多重送信防止: 既に生成中またはクイズモード中は何もしない
  if (isGeneratingQuiz) {
    addLog("クイズ生成中のため、新しいクイズ生成をスキップしました", "warning");
    return;
  }
  if (quizState.isQuizMode) {
    addLog(
      "クイズモード中のため、新しいクイズ生成をスキップしました",
      "warning"
    );
    return;
  }

  // クイズ生成開始
  isGeneratingQuiz = true;
  const generationId = `quiz_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  currentQuizGenerationId = generationId;

  addLog("スタートアップクイズモードを開始します（5問）", "info");

  // 吹き出しを表示し、入力を無効化
  setQuizBubbleVisible(true);
  setInputDisabled(true, "クイズを作成中...");

  try {
    // Generate 5 quizzes
    const quizzes = await generateDailyQuizzes(apiKey);

    // 多重レスポンス破棄: 生成IDが変わっていたら結果を無視
    if (currentQuizGenerationId !== generationId) {
      addLog("古いクイズ生成レスポンスを破棄しました", "warning");
      return;
    }

    // 吹き出しを非表示
    setQuizBubbleVisible(false);

    // 昨日の履歴がない場合はスキップ
    if (quizzes.length === 0) {
      addLog("昨日の閲覧履歴がないためクイズをスキップしました", "info");
      isGeneratingQuiz = false;
      currentQuizGenerationId = null;
      setInputDisabled(false);
      return;
    }

    // Set quiz state
    quizState.isQuizMode = true;
    quizState.quizQuestions = quizzes;
    quizState.currentQuestionIndex = 0;
    quizState.correctCount = 0;
    quizState.currentQuiz = quizzes[0];
    quizState.attempts = 0;

    await saveQuizState();

    // Mark as shown today
    quizShownToday = getTodayDateString();
    await saveQuizShownToday();

    // Clear visited sites after quiz generation (for next quiz cycle)
    visitedSites = [];
    await saveVisitedSites();

    // Disable input during quiz mode (update placeholder)
    setInputDisabled(true, "クイズに回答してください...");

    // Show first question
    addChatMessage(
      `🎯 最近の閲覧内容に関するクイズです！（全${QUIZ_QUESTION_COUNT}問）`,
      "assistant"
    );
    addQuizMessage(`Q1. ${quizzes[0].question}`, quizzes[0].options);
    addLog("スタートアップクイズを出題しました（問1）", "success");
  } catch (error) {
    addLog(`クイズ生成エラー: ${(error as Error).message}`, "error");
    console.error("Quiz generation error:", error);
    setQuizBubbleVisible(false);
    setInputDisabled(false);
  } finally {
    isGeneratingQuiz = false;
    currentQuizGenerationId = null;
  }
}

// Enable/disable input field during quiz mode
function setInputDisabled(disabled: boolean, placeholder?: string) {
  const input = document.getElementById(KAIRU_INPUT_ID) as HTMLTextAreaElement;
  const submitBtn = document.getElementById(
    "kairu-submit-btn"
  ) as HTMLButtonElement;

  if (input) {
    // disabledにする場合はフォーカスを外す
    if (disabled && document.activeElement === input) {
      input.blur();
    }
    input.disabled = disabled;
    if (disabled) {
      input.placeholder = placeholder || "クイズに回答してください...";
      input.classList.add("quiz-disabled");
    } else {
      input.placeholder = "やりたいことを入力してください...";
      input.classList.remove("quiz-disabled");
    }
  }

  if (submitBtn) {
    submitBtn.disabled = disabled;
  }
}

// Show/hide quiz generation bubble
function setQuizBubbleVisible(visible: boolean) {
  const bubble = document.getElementById("kairu-quiz-bubble");
  if (bubble) {
    bubble.style.display = visible ? "block" : "none";
  }
}

// Check startup quiz answer and proceed to next question
async function checkStartupQuizAnswer(selectedIndex: number): Promise<void> {
  if (!quizState.isQuizMode || quizState.quizQuestions.length === 0) {
    return;
  }

  const currentQuestion =
    quizState.quizQuestions[quizState.currentQuestionIndex];
  const isCorrect = selectedIndex === currentQuestion.correctAnswer;

  // Get quiz buttons
  const quizMessage = document.getElementById("kairu-current-quiz");
  const buttons = quizMessage?.querySelectorAll(".quiz-option-btn");

  // Update button colors
  if (buttons) {
    // Show selected button result
    if (buttons[selectedIndex]) {
      (buttons[selectedIndex] as HTMLButtonElement).style.background = isCorrect
        ? "#4caf50"
        : "#f44336";
      (buttons[selectedIndex] as HTMLButtonElement).style.borderColor =
        isCorrect ? "#4caf50" : "#f44336";
      (buttons[selectedIndex] as HTMLButtonElement).style.color = "white";
    }
    // Show correct answer if wrong
    if (!isCorrect && buttons[currentQuestion.correctAnswer]) {
      (
        buttons[currentQuestion.correctAnswer] as HTMLButtonElement
      ).style.background = "#4caf50";
      (
        buttons[currentQuestion.correctAnswer] as HTMLButtonElement
      ).style.borderColor = "#4caf50";
      (
        buttons[currentQuestion.correctAnswer] as HTMLButtonElement
      ).style.color = "white";
    }
  }

  if (isCorrect) {
    quizState.correctCount++;
    addChatMessage(`✅ 正解！`, "assistant");
  } else {
    const correctOption =
      currentQuestion.options[currentQuestion.correctAnswer];
    addChatMessage(
      `❌ 不正解。正解は「${correctOption}」でした。`,
      "assistant"
    );
  }

  // Move to next question
  quizState.currentQuestionIndex++;
  await saveQuizState();

  if (quizState.currentQuestionIndex < quizState.quizQuestions.length) {
    // Show next question after a short delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const nextQuestion =
      quizState.quizQuestions[quizState.currentQuestionIndex];
    quizState.currentQuiz = nextQuestion;
    await saveQuizState();

    addQuizMessage(
      `Q${quizState.currentQuestionIndex + 1}. ${nextQuestion.question}`,
      nextQuestion.options
    );
    addLog(
      `クイズ問${quizState.currentQuestionIndex + 1}を出題しました`,
      "info"
    );
  } else {
    // All questions answered - show results
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const scorePercent = Math.round(
      (quizState.correctCount / QUIZ_QUESTION_COUNT) * 100
    );
    let resultMessage = `🏆 クイズ終了！\n\n結果: ${quizState.correctCount}/${QUIZ_QUESTION_COUNT}問正解 (${scorePercent}%)`;

    if (scorePercent === 100) {
      resultMessage += "\n\n🎉 パーフェクト！素晴らしいです！";
    } else if (scorePercent >= 80) {
      resultMessage += "\n\n😊 よくできました！";
    } else if (scorePercent >= 60) {
      resultMessage += "\n\n👍 まずまずですね！";
    } else {
      resultMessage += "\n\n💪 次回は頑張りましょう！";
    }

    addChatMessage(resultMessage, "assistant");

    // Exit quiz mode
    quizState.isQuizMode = false;
    quizState.currentQuiz = null;
    quizState.quizQuestions = [];
    quizState.currentQuestionIndex = 0;
    quizState.correctCount = 0;
    quizState.attempts = 0;
    await saveQuizState();

    // Re-enable input
    setInputDisabled(false);

    // Reset last message sent time (for next quiz cycle)
    await saveLastMessageSent();

    addLog("スタートアップクイズ終了", "success");
  }
}

// Start quiz mode
async function startQuizMode(apiKey: string): Promise<void> {
  addLog("クイズモードを開始します", "info");

  try {
    // Generate quiz
    const quiz = await generateQuiz(apiKey);

    // Set quiz state
    quizState.isQuizMode = true;
    quizState.currentQuiz = quiz;
    quizState.attempts = 0;

    addLog("クイズ状態を更新: isQuizMode = true", "success");

    await saveQuizState();

    // Update last quiz count
    lastQuizCount = messageCount;
    await saveLastQuizCount();

    // Show quiz to user with button options
    addQuizMessage(quiz.question, quiz.options);
    addLog("クイズを出題しました", "success");
  } catch (error) {
    addLog(`クイズ生成エラー: ${(error as Error).message}`, "error");
    console.error("Quiz generation error:", error);
  }
}

// Check quiz answer
async function checkQuizAnswer(userAnswer: string): Promise<boolean> {
  addLog("クイズ回答チェック開始", "info");

  if (!quizState.currentQuiz) {
    addLog("エラー: クイズが存在しません", "error");
    // Force exit quiz mode if no quiz exists
    quizState.isQuizMode = false;
    await saveQuizState();
    return false;
  }

  quizState.attempts++;
  await saveQuizState();

  // Parse user answer (expecting 1-4)
  const answerNum = parseInt(userAnswer.trim());

  // Check if valid number
  if (isNaN(answerNum) || answerNum < 1 || answerNum > 4) {
    addChatMessage("❌ 1から4の数字で答えてください。", "assistant");
    addLog("無効な回答形式", "warning");
    quizState.attempts--; // Don't count this as an attempt
    await saveQuizState();
    return false;
  }

  // Convert to 0-indexed
  const selectedIndex = answerNum - 1;

  // Get quiz buttons
  const quizMessage = document.getElementById("kairu-current-quiz");
  const buttons = quizMessage?.querySelectorAll(".quiz-option-btn");

  // Check if answer is correct
  const isCorrect = selectedIndex === quizState.currentQuiz.correctAnswer;

  if (isCorrect) {
    // Correct answer - highlight selected button as correct
    if (buttons && buttons[selectedIndex]) {
      (buttons[selectedIndex] as HTMLButtonElement).style.background =
        "#4caf50";
      (buttons[selectedIndex] as HTMLButtonElement).style.borderColor =
        "#4caf50";
      (buttons[selectedIndex] as HTMLButtonElement).style.color = "white";
    }

    const correctOption =
      quizState.currentQuiz.options[quizState.currentQuiz.correctAnswer];
    addChatMessage(
      `🎉 正解です！素晴らしい！\n\n答え: ${correctOption}`,
      "assistant"
    );
    addLog("クイズに正解しました", "success");

    // Exit quiz mode
    quizState.isQuizMode = false;
    quizState.currentQuiz = null;
    quizState.attempts = 0;
    await saveQuizState();
    addLog("クイズモードを終了しました", "success");

    return true;
  } else {
    // Incorrect answer - highlight selected button as incorrect and show correct one
    if (buttons) {
      if (buttons[selectedIndex]) {
        (buttons[selectedIndex] as HTMLButtonElement).style.background =
          "#f44336";
        (buttons[selectedIndex] as HTMLButtonElement).style.borderColor =
          "#f44336";
        (buttons[selectedIndex] as HTMLButtonElement).style.color = "white";
      }

      // Show correct answer after last attempt or on final answer
      const maxAttempts = 3; // Allow 3 attempts
      if (
        quizState.attempts >= maxAttempts &&
        buttons[quizState.currentQuiz.correctAnswer]
      ) {
        (
          buttons[quizState.currentQuiz.correctAnswer] as HTMLButtonElement
        ).style.background = "#4caf50";
        (
          buttons[quizState.currentQuiz.correctAnswer] as HTMLButtonElement
        ).style.borderColor = "#4caf50";
        (
          buttons[quizState.currentQuiz.correctAnswer] as HTMLButtonElement
        ).style.color = "white";
      }
    }

    const maxAttempts = 3; // Allow 3 attempts

    if (quizState.attempts < maxAttempts) {
      // Allow retry - re-enable buttons except the wrong one
      if (buttons) {
        buttons.forEach((btn, index) => {
          if (index !== selectedIndex) {
            (btn as HTMLButtonElement).disabled = false;
          }
        });
      }
      addChatMessage(
        `❌ 残念、違います。\n\nあと${
          maxAttempts - quizState.attempts
        }回挑戦できます。もう一度考えてみてください！`,
        "assistant"
      );
      addLog(`クイズ不正解（試行${quizState.attempts}回目）`, "warning");
    } else {
      // No more attempts, show answer
      const correctOption =
        quizState.currentQuiz.options[quizState.currentQuiz.correctAnswer];
      addChatMessage(
        `❌ 残念、違います。\n\n正解は「${
          quizState.currentQuiz.correctAnswer + 1
        }. ${correctOption}」でした。\n\n次は頑張ってくださいね！`,
        "assistant"
      );
      addLog("クイズ不正解、正解を表示", "warning");

      // Exit quiz mode
      quizState.isQuizMode = false;
      quizState.currentQuiz = null;
      quizState.attempts = 0;
      await saveQuizState();
      addLog("クイズモードを終了しました", "success");
    }

    return false;
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

  // Keep only last 100 log entries
  const MAX_LOG_ENTRIES = 100;
  const entries = logContent.querySelectorAll(".log-entry");
  if (entries.length > MAX_LOG_ENTRIES) {
    const entriesToRemove = entries.length - MAX_LOG_ENTRIES;
    for (let i = 0; i < entriesToRemove; i++) {
      entries[i].remove();
    }
  }

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

  // Keep only last 100 log entries
  const MAX_LOG_ENTRIES = 100;
  const entries = logContent.querySelectorAll(".log-entry");
  if (entries.length > MAX_LOG_ENTRIES) {
    const entriesToRemove = entries.length - MAX_LOG_ENTRIES;
    for (let i = 0; i < entriesToRemove; i++) {
      entries[i].remove();
    }
  }

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

// Add quiz message with button options
function addQuizMessage(question: string, options: string[]) {
  const chatHistory = document.getElementById("kairu-chat-history");
  if (!chatHistory) return;

  // Remove ID from previous quiz message (keep the message visible)
  const oldQuiz = document.getElementById("kairu-current-quiz");
  if (oldQuiz) {
    oldQuiz.removeAttribute("id");
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-message assistant quiz-message";
  messageDiv.id = "kairu-current-quiz";

  // Create quiz content
  const questionDiv = document.createElement("div");
  questionDiv.className = "quiz-question";
  questionDiv.textContent = question;
  messageDiv.appendChild(questionDiv);

  // Create button container
  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "quiz-buttons";

  // Check if this is a startup quiz (5 questions) or legacy quiz
  const isStartupQuiz = quizState.quizQuestions.length > 0;

  // Create buttons for each option
  options.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = "quiz-option-btn";
    button.textContent = `${index + 1}. ${option}`;
    button.dataset.optionIndex = String(index + 1);

    button.addEventListener("click", async () => {
      // Disable all buttons
      const allButtons = buttonsContainer.querySelectorAll("button");
      allButtons.forEach((btn) => {
        (btn as HTMLButtonElement).disabled = true;
      });

      // Check answer - use different handler for startup quiz
      if (isStartupQuiz) {
        await checkStartupQuizAnswer(index);
      } else {
        await checkQuizAnswer(String(index + 1));
      }
    });

    buttonsContainer.appendChild(button);
  });

  messageDiv.appendChild(buttonsContainer);
  chatHistory.appendChild(messageDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Save to storage
  saveChatHistory();
}

// Add system message (status update) - returns the element so it can be updated
// Show status in the input panel
function showStatus(message: string) {
  const statusTextElement = document.getElementById("kairu-status-text");
  if (!statusTextElement) return;

  statusTextElement.textContent = message;
}

// Hide status in the input panel
function hideStatus() {
  const statusTextElement = document.getElementById("kairu-status-text");
  if (!statusTextElement) return;

  statusTextElement.textContent = "";
}

// Create Kairu UI
async function createKairuUI() {
  // Check if body exists
  if (!document.body) {
    console.log("[Kairu] Body not ready, waiting...");
    setTimeout(createKairuUI, 100);
    return;
  }

  // Check if already exists
  if (document.getElementById(KAIRU_CONTAINER_ID)) {
    return;
  }

  // Create container
  const container = document.createElement("div");
  container.id = KAIRU_CONTAINER_ID;
  container.innerHTML = `
    <div id="kairu-quiz-bubble" style="display: none;">
      <span>クイズを作成中...</span>
    </div>
    <button id="kairu-character-wrapper" type="button">
      <div class="kairu-avatar-shadow"></div>
      <div id="kairu-character">
        <div class="kairu-avatar">
          <div class="kairu-avatar-inner">
            🐬
          </div>
        </div>
      </div>
    </button>
    <div id="kairu-input-panel" style="display: none;">
      <div class="kairu-panel-header">
        <span>Kairuくん</span>
        <div class="kairu-header-buttons">
          <button id="kairu-scroll-bottom-btn" title="最新の会話に移動">↓</button>
          <button id="kairu-reset-btn" title="会話をリセット">🗑️</button>
          <button id="kairu-close-btn" title="拡張機能を終了">✕</button>
        </div>
      </div>
      <div id="kairu-chat-history"></div>
      <div class="kairu-input-container">
        <textarea id="${KAIRU_INPUT_ID}" placeholder="やりたいことを入力してください..."></textarea>
        <button id="kairu-submit-btn">送信</button>
      </div>
      <details id="kairu-debug-log" style="display: none;">
        <summary>実行ログ</summary>
        <div id="kairu-log-content"></div>
      </details>
      <div id="kairu-next-quiz-timer" style="display: none;">
        <span id="kairu-next-quiz-text">次のクイズまで: 計算中...</span>
      </div>
      <div id="kairu-status">
        <p id="kairu-status-text"></p>
      </div>
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
      color-scheme: light !important;
    }

    #${KAIRU_CONTAINER_ID} * {
      color-scheme: light !important;
    }

    #kairu-quiz-bubble {
      position: absolute;
      bottom: 70px;
      right: 80px;
      background: white;
      border-radius: 12px;
      padding: 8px 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
      font-size: 13px;
      color: #333;
      white-space: nowrap;
      animation: bubblePulse 1.5s ease-in-out infinite;
    }

    #kairu-quiz-bubble::after {
      content: '';
      position: absolute;
      bottom: -8px;
      right: 20px;
      border-width: 8px 8px 0 8px;
      border-style: solid;
      border-color: white transparent transparent transparent;
    }

    @keyframes bubblePulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    #kairu-character-wrapper {
      position: relative;
      right: 8px;
      bottom: 8px;
      z-index: 1;
      cursor: grab;
      transition: transform 0.2s;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      font: inherit;
    }

    #kairu-character-wrapper:active {
      cursor: grabbing;
    }

    #kairu-character-wrapper:hover {
      transform: scale(1.1);
    }

    #kairu-character.loading {
      animation: pendulum 1s ease-in-out infinite;
    }

    #kairu-character.spinning {
      animation: spin 0.5s ease-in-out;
    }

    @keyframes pendulum {
      0%, 100% {
        transform: rotate(-15deg);
      }
      50% {
        transform: rotate(15deg);
      }
    }

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(-360deg);
      }
    }

    .kairu-avatar-shadow {
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      pointer-events: none;
    }

    .kairu-avatar {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #43a5f5 0%, #1e88e5 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      padding: 0px;
      transition: padding 0.3s ease;
      position: relative;
    }

    #kairu-character.loading .kairu-avatar {
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

    #kairu-status-text {
      margin: 0;
      padding: 0;
      color: #666;
      font-size: 10px;
      line-height: 1.5;
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

    .kairu-header-buttons {
      display: flex;
      gap: 4px;
    }

    #kairu-reset-btn,
    #kairu-scroll-bottom-btn,
    #kairu-close-btn {
      background: white;
      border: none;
      font-size: 14px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 50%;
      transition: background 0.2s;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #kairu-scroll-bottom-btn {
      font-weight: bold;
      transform: translateY(-2px);
    }

    #kairu-close-btn {
      font-weight: bold;
    }

    #kairu-reset-btn:hover,
    #kairu-scroll-bottom-btn:hover,
    #kairu-close-btn:hover {
      background: #f0f0f0;
    }

    #kairu-close-btn:hover {
      color: #f44336;
    }

    #kairu-reset-btn:active,
    #kairu-scroll-bottom-btn:active,
    #kairu-close-btn:active {
      background: #e0e0e0;
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
      white-space: pre-wrap;
    }

    .chat-message.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #43a5f5 0%, #1e88e5 100%);
      color: white !important;
    }

    .chat-message.assistant {
      align-self: flex-start;
      background: rgba(245, 245, 245, 0.8);
      color: #333 !important;
    }

    .chat-message.system {
      align-self: center;
      background: rgba(102, 126, 234, 0.1);
      color: #667eea;
      font-size: 12px;
      font-style: italic;
      border: 1px solid rgba(102, 126, 234, 0.2);
    }

    .quiz-message {
      max-width: 95% !important;
    }

    .quiz-question {
      margin-bottom: 12px;
      white-space: pre-wrap;
    }

    .quiz-buttons {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .quiz-option-btn {
      padding: 12px 16px;
      background: white;
      border: 2px solid #43a5f5;
      border-radius: 8px;
      color: #1e88e5;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
      width: 100%;
    }

    .quiz-option-btn:hover:not(:disabled) {
      background: #e3f2fd;
      border-color: #1e88e5;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(67, 165, 245, 0.2);
    }

    .quiz-option-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .quiz-option-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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
      color: #333 !important;
    }

    #${KAIRU_INPUT_ID}:focus {
      outline: none;
      border-color: #667eea;
      background: rgba(255, 255, 255, 0.7);
      color: #333 !important;
    }

    #${KAIRU_INPUT_ID}.quiz-disabled {
      background: rgba(200, 200, 200, 0.5);
      color: #999 !important;
      cursor: not-allowed;
    }

    #${KAIRU_INPUT_ID}.quiz-disabled::placeholder {
      color: #999;
    }

    #kairu-submit-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, #43a5f5 0%, #1e88e5 100%);
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

    #kairu-submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
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

    #kairu-next-quiz-timer {
      margin-top: 8px;
      padding: 8px 12px;
      background: #e3f2fd;
      border-radius: 6px;
      font-size: 12px;
      color: #1565c0;
      text-align: center;
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

  // Restore logs, chat history, conversation, position, and enabled state from storage
  await restoreLogs();
  await restoreChatHistory();
  await restoreConversation();
  await restorePosition();
  await restoreWindowState();
  await restoreEnabledState();
  await restoreMessageCount();
  await restoreLastQuizCount();
  await restoreVisitedSites();
  await restoreQuizState();
  await restoreLastSessionEnd();
  await restoreLastMessageSent();
  await restoreDailyVisitedSites();
  await restoreQuizShownToday();
  await restoreDebugMode();

  // Record initial site visit
  await recordSiteVisit();

  // Add event listeners
  const characterWrapper = document.getElementById("kairu-character-wrapper")!;
  const character = document.getElementById("kairu-character")!;
  const inputPanel = document.getElementById("kairu-input-panel")!;
  const input = document.getElementById(KAIRU_INPUT_ID) as HTMLTextAreaElement;
  const submitBtn = document.getElementById(
    "kairu-submit-btn"
  ) as HTMLButtonElement;
  const resetBtn = document.getElementById(
    "kairu-reset-btn"
  ) as HTMLButtonElement;
  const scrollBottomBtn = document.getElementById(
    "kairu-scroll-bottom-btn"
  ) as HTMLButtonElement;
  const closeBtn = document.getElementById(
    "kairu-close-btn"
  ) as HTMLButtonElement;

  // Scroll to bottom button click
  scrollBottomBtn.addEventListener("click", () => {
    const chatHistory = document.getElementById("kairu-chat-history");
    if (chatHistory) {
      chatHistory.scrollTo({
        top: chatHistory.scrollHeight,
        behavior: "smooth",
      });
    }
  });

  // Reset button click
  resetBtn.addEventListener("click", async () => {
    if (confirm("会話履歴と実行ログをリセットしますか？")) {
      console.log("[Kairu] リセット開始");

      // Clear conversation history
      clearConversation();

      // Clear chat UI
      const chatHistory = document.getElementById("kairu-chat-history");
      if (chatHistory) {
        chatHistory.innerHTML = "";
        saveChatHistory(); // Save empty state
      }

      // Clear execution log
      clearLog();

      // Reset quiz-related state
      messageCount = 0;
      lastQuizCount = 0;
      quizState = {
        isQuizMode: false,
        currentQuiz: null,
        attempts: 0,
        quizQuestions: [],
        currentQuestionIndex: 0,
        correctCount: 0,
      };

      console.log("[Kairu] クイズ状態をリセット:", quizState);

      // Save cleared state
      await saveMessageCount();
      await saveLastQuizCount();
      await saveQuizState();

      addLog("会話履歴と実行ログをリセットしました", "info");
      addLog(`クイズモード状態: ${quizState.isQuizMode}`, "success");
    }
  });

  // Close button click - disable Kairu and save session end time
  closeBtn.addEventListener("click", async () => {
    console.log("[Kairu] 終了ボタンがクリックされました");

    // Disable Kairu
    kairuEnabled = false;

    // Hide Kairu UI
    container.style.display = "none";

    // Save enabled state
    await saveEnabledState(kairuEnabled);

    // Save session end timestamp for quiz timing
    await saveLastSessionEnd();

    console.log("[Kairu] 拡張機能を終了しました");
  });

  // Input focus event - check if quiz should be shown
  input.addEventListener("focus", async () => {
    if (!kairuEnabled) return;
    if (quizState.isQuizMode) return;
    if (isGeneratingQuiz) return; // クイズ生成中はスキップ

    if (shouldShowQuizOnFocus()) {
      console.log("[Kairu] フォーカス時にクイズ条件を満たしています");

      // Get API key and start quiz
      try {
        if (isExtensionContextValid()) {
          const response = await chrome.runtime.sendMessage({
            type: "GET_API_KEY",
          });
          const apiKey = response.apiKey;

          if (apiKey) {
            await startStartupQuizMode(apiKey);
          }
        }
      } catch (error) {
        console.error("[Kairu] クイズの開始に失敗:", error);
      }
    }
  });

  // Toggle input panel on click (will be triggered by mouseup if not dragging)
  const togglePanel = () => {
    // Toggle panel visibility
    const isVisible = inputPanel.style.display === "block";
    const newVisibility = !isVisible;
    inputPanel.style.display = newVisibility ? "block" : "none";

    // Save window state to storage
    if (isExtensionContextValid()) {
      chrome.storage.local.set({ [STORAGE_KEYS.WINDOW_OPEN]: newVisibility });
    }

    // Add spinning animation to inner character
    character.classList.add("spinning");
    setTimeout(() => {
      character.classList.remove("spinning");
    }, 500);

    // Scroll chat history to bottom when panel is opened
    if (newVisibility) {
      const chatHistory = document.getElementById("kairu-chat-history");
      if (chatHistory) {
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }
  };

  // Toggle panel with Command + K (or Ctrl + K on Windows/Linux)
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();

      togglePanel();

      // Focus on input when opening
      const isVisible = inputPanel.style.display === "block";
      if (isVisible) {
        input.focus();
      }
    }
  });

  // Drag and drop functionality
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialBottom = 0;
  let initialRight = 0;

  characterWrapper.addEventListener("mousedown", (e) => {
    // Only start drag if not clicking to toggle
    if (e.button !== 0) return; // Only left mouse button

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    // Get current position
    const containerRect = container.getBoundingClientRect();
    initialBottom = window.innerHeight - containerRect.bottom;
    initialRight = window.innerWidth - containerRect.right;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    // Get container dimensions
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate new position (invert Y because bottom increases downward)
    let newBottom = initialBottom - deltaY;
    let newRight = initialRight - deltaX;

    // Apply boundaries
    // Bottom: minimum 0, maximum (window height - container height)
    newBottom = Math.max(
      0,
      Math.min(newBottom, window.innerHeight - containerHeight)
    );
    // Right: minimum 0, maximum (window width - container width)
    newRight = Math.max(
      0,
      Math.min(newRight, window.innerWidth - containerWidth)
    );

    container.style.bottom = `${newBottom}px`;
    container.style.right = `${newRight}px`;
  });

  document.addEventListener("mouseup", (e) => {
    if (isDragging) {
      isDragging = false;

      // Save position to storage
      const containerRect = container.getBoundingClientRect();
      const bottom = window.innerHeight - containerRect.bottom;
      const right = window.innerWidth - containerRect.right;
      savePosition(bottom, right);

      // Check if it was a click (no significant movement)
      const deltaX = Math.abs(e.clientX - dragStartX);
      const deltaY = Math.abs(e.clientY - dragStartY);
      const wasClick = deltaX < 5 && deltaY < 5;

      // If it was a click, trigger the toggle
      if (wasClick) {
        togglePanel();
      }
    }
  });

  // Submit button click
  submitBtn.addEventListener("click", async () => {
    // Prevent submit if already disabled
    if (submitBtn.disabled) {
      return;
    }

    const userInput = input.value.trim();
    if (!userInput) return;

    // Clear input immediately
    input.value = "";

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

      // Check if in quiz mode
      addLog(`現在のクイズモード状態: ${quizState.isQuizMode}`, "info");

      if (quizState.isQuizMode) {
        // In quiz mode: buttons only, no text input
        addLog("クイズモード中です - ボタンで回答してください", "info");
        addChatMessage(
          "クイズに回答中です。上のボタンをクリックして回答してください。",
          "assistant"
        );
        return;
      }

      // Record site visit before processing
      await recordSiteVisit();

      // Add user message to conversation history
      conversationHistory.push({
        role: "user",
        content: userInput,
      });

      // Keep only last 1000 messages
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

      // Keep only last 1000 messages
      if (conversationHistory.length > MAX_HISTORY_LENGTH) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH);
      }

      // Increment message count (one exchange = user + assistant)
      messageCount++;
      await saveMessageCount();

      // Save conversation to storage
      saveConversation();

      // Save last message sent timestamp for quiz timing
      await saveLastMessageSent();

      // Parse response and execute actions
      await processAIResponse(aiResponse);

      // Re-enable button after AI response is processed
      // (allows user to send messages while quiz is being generated)
      submitBtn.disabled = false;
      submitBtn.textContent = "送信";
      character.classList.remove("loading");

      // Check if it's time to show a quiz
      addLog(
        `クイズ判定: メッセージ数=${messageCount}, 前回クイズ=${lastQuizCount}, 訪問サイト数=${visitedSites.length}, クイズモード=${quizState.isQuizMode}`,
        "info"
      );

      if (shouldShowQuiz()) {
        addLog("クイズ出題条件を満たしました", "success");
        // Wait a bit before showing quiz
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await startQuizMode(apiKey);
      } else {
        addLog("クイズ出題条件を満たしていません", "warning");
      }
    } catch (error) {
      console.error("Error:", error);

      // Restore input if empty (error occurred)
      if (!input.value.trim()) {
        input.value = userInput;
      }

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
      // Ensure button is re-enabled and animation is stopped in case of error
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
// Get page text content (for understanding page context)
function getPageTextContent(): string {
  // Get body clone, excluding Kairu UI
  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  // Remove Kairu UI
  const kairuContainer = bodyClone.querySelector(`#${KAIRU_CONTAINER_ID}`);
  if (kairuContainer) {
    kairuContainer.remove();
  }

  // Remove script tags, style tags, and other non-content elements
  bodyClone
    .querySelectorAll("script, style, noscript, svg, path, iframe")
    .forEach((el) => el.remove());

  // Get text content only
  let text = bodyClone.textContent || "";

  // Clean up excessive whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Limit to reasonable size (first 10000 characters)
  if (text.length > 10000) {
    text =
      text.substring(0, 10000) + "\n... (テキストが長すぎるため省略されました)";
  }

  return text;
}

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

  // Limit to reasonable size (first 250000 characters)
  if (html.length > 250000) {
    html =
      html.substring(0, 250000) + "\n... (HTMLが長すぎるため省略されました)";
  }

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
      const ariaLabel = el.getAttribute("aria-label") || "";
      const value = (el as HTMLInputElement).value?.substring(0, 50) || "";
      return `${i + 1}. <${tag}${type !== "text" ? ` type="${type}"` : ""}${
        name ? ` name="${name}"` : ""
      }${id ? ` id="${id}"` : ""}${
        placeholder ? ` placeholder="${placeholder}"` : ""
      }${ariaLabel ? ` aria-label="${ariaLabel}"` : ""}${
        value ? ` value="${value}"` : ""
      }>`;
    })
    .join("\n");

  const buttonInfo = buttons
    .filter((el) => !el.closest(`#${KAIRU_CONTAINER_ID}`) && isVisible(el))
    .map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.trim().substring(0, 80) || "";
      const id = el.getAttribute("id") || "";
      const name = el.getAttribute("name") || "";
      const className = el.getAttribute("class")?.split(" ")[0] || "";
      const role = el.getAttribute("role") || "";
      const href = el.getAttribute("href") || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      return `${i + 1}. <${tag}${id ? ` id="${id}"` : ""}${
        name ? ` name="${name}"` : ""
      }${className ? ` class="${className}"` : ""}${
        role ? ` role="${role}"` : ""
      }${ariaLabel ? ` aria-label="${ariaLabel}"` : ""}${
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
  addLog("ページテキストを取得中...", "info");
  const pageText = getPageTextContent();
  addRawLog("ページテキスト", pageText);

  addLog("インタラクティブ要素を取得中...", "info");
  const pageElements = getPageElements();
  addRawLog("検出されたページ要素", pageElements);

  const pageContext = `
現在のページ情報:
- URL: ${window.location.href}
- タイトル: ${document.title}

## ページ内容（テキストのみ）
${pageText}

## インタラクティブ要素リスト
以下は、クリックや入力が可能な主要な要素のリストです。
このリストから要素を選択して操作してください。

${pageElements}

注意: リストに無い要素を操作する必要がある場合のみ、textパラメータを使用してください。
`;

  showStatus("🐬💭 Kairuくんが処理を考えています...");

  const systemPrompt = `あなたはKairuというブラウザ操作アシスタントです。ユーザーの指示に従ってブラウザを操作します。

## 🚨 ユーザーへの応答ルール
- 「インタラクティブ要素リスト」「セレクタ」「selector」「要素」などの技術的な用語をユーザーに見せないでください
- ユーザーには操作の結果や次に何をするかをシンプルに伝えてください
- 内部的な仕組みや技術的な詳細は一切言及しないでください
- 「候補を提案します」「要素を選んでください」のような内部処理をユーザーに委ねるメッセージは禁止です
- できない操作がある場合は「〜が見つかりませんでした」とだけ伝えてください

## 🚨 最重要ルール：インタラクティブ要素リストを必ず使用すること（内部処理用）

**要素をクリックする際の手順（必須）:**
1. まず「インタラクティブ要素」セクションで該当する要素を探す
2. 要素が見つかった場合は、そのid, name, classなどの属性を使ってselectorを作成する
3. **textパラメータは最後の手段**: インタラクティブ要素リストに該当する要素が無い場合のみ使用

**具体例（Googleの検索ボタン）:**
インタラクティブ要素リストに以下のような要素がある場合:

  1. <button name="btnK" class="gNO89b"> "Google 検索"

❌ 間違い: {"action": "click", "text": "検索"}
✅ 正解: {"action": "click", "selector": "button[name='btnK']"}
✅ 正解: {"action": "click", "selector": ".gNO89b"}

**なぜselectorを優先するか:**
- textパラメータは曖昧で、意図しない要素をクリックする可能性がある
- selectorは正確で確実
- インタラクティブ要素リストに記載されている要素は確実に存在する

## その他の重要な指示

1. **正確なセレクタの作成 - 絶対に守るべきルール**
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
   - **リンクをクリックする場合の重要なルール:**
     - リンクのテキストの一部だけでもマッチします（部分一致OK）
     - 大文字小文字は区別されません
     - リンクのテキストが長い場合、キーワードだけを指定してもOK
     - 例: リンクが「Claude Code Documentation - Getting Started」の場合
       - ✅ \`{"action": "click", "text": "Documentation"}\` ← これでOK
       - ✅ \`{"action": "click", "text": "getting started"}\` ← 小文字でもOK
       - ✅ \`{"action": "click", "text": "claude code"}\` ← 部分一致でOK
   - 推奨: テキストが表示されている要素は、textパラメータを使用する方が確実です
2. type: フォームに入力 (selectorで要素を指定、valueで入力値を指定)
3. navigate: ページ遷移 (urlで指定)
4. scroll: スクロール (directionで"up"か"down"を指定)
5. back: ブラウザの戻るボタンを押す \`{"action": "back"}\`
6. forward: ブラウザの進むボタンを押す \`{"action": "forward"}\`
7. get_info: ページ情報を取得 (typeで"title", "url", "text"を指定)

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
    // Add conversation history (last 1000 messages)
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

    // Parse error response
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error) {
        const error = errorData.error;

        // Handle rate limit error
        if (error.code === "rate_limit_exceeded") {
          const message =
            "⏱️ APIのレート制限に達しました。少し時間をおいてから再度お試しください。";
          addChatMessage(message, "assistant");
          throw new Error(message);
        }

        // Handle other API errors
        const message = `❌ APIエラー: ${error.message || errorText}`;
        addChatMessage(message, "assistant");
        throw new Error(message);
      }
    } catch (parseError) {
      // If error response is not JSON, use the raw text
      if (parseError instanceof SyntaxError) {
        throw new Error(
          `API request failed: ${response.status} - ${errorText}`
        );
      }
      throw parseError;
    }

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
    case "back":
      addLog("ブラウザで戻る操作を実行", "info");
      window.history.back();
      break;
    case "forward":
      addLog("ブラウザで進む操作を実行", "info");
      window.history.forward();
      break;
    case "get_info":
      const info = getPageInfo(action.type);
      console.log("Page info:", info);
      break;
    default:
      console.warn("Unknown action:", action.action);
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

    // Normalize search text (lowercase, trim)
    const normalizedText = text.toLowerCase().trim();

    // Search by text content (prioritize links)
    const allElements = document.querySelectorAll("a, button, [role='button']");

    // Try exact match first
    for (const el of Array.from(allElements)) {
      const elementText = el.textContent?.toLowerCase().trim() || "";
      if (elementText === normalizedText) {
        element = el as HTMLElement;
        addLog("完全一致で要素を発見", "success");
        break;
      }
    }

    // Try partial match if exact match not found
    if (!element) {
      for (const el of Array.from(allElements)) {
        const elementText = el.textContent?.toLowerCase().trim() || "";
        if (
          elementText.includes(normalizedText) ||
          normalizedText.includes(elementText)
        ) {
          element = el as HTMLElement;
          addLog("部分一致で要素を発見", "success");
          break;
        }
      }
    }

    // For links, also try matching href
    if (!element) {
      const links = document.querySelectorAll("a[href]");
      for (const link of Array.from(links)) {
        const href = link.getAttribute("href") || "";
        const linkText = link.textContent?.toLowerCase().trim() || "";

        // Check if text matches href or link text
        if (
          href.toLowerCase().includes(normalizedText) ||
          linkText.includes(normalizedText)
        ) {
          element = link as HTMLElement;
          addLog("リンクのhrefまたはテキストで要素を発見", "success");
          break;
        }
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
    // List available links for debugging
    const availableLinks = Array.from(document.querySelectorAll("a"))
      .slice(0, 10)
      .map((link) => link.textContent?.trim().substring(0, 50))
      .filter(Boolean);

    const searchCriteria = selector
      ? `selector: ${selector}${text ? `, text: ${text}` : ""}`
      : `text: ${text}`;
    const errorMsg = `要素が見つかりませんでした (${searchCriteria})`;
    addLog(errorMsg, "error");
    addLog(
      `利用可能なリンク（最初の10件）: ${availableLinks.join(", ")}`,
      "info"
    );
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
  } else if (request.type === "SET_DEBUG_MODE") {
    debugMode = request.enabled;
    console.log("Debug mode:", debugMode ? "enabled" : "disabled");

    // Update debug UI visibility
    updateDebugUIVisibility();

    sendResponse({ success: true });
  }
  return true;
});

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

// ========================================
// URL変更の監視（SPA対応）
// ========================================
let lastRecordedUrl = window.location.href;

// URL変更時に呼ばれる共通処理
async function onUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastRecordedUrl) {
    lastRecordedUrl = currentUrl;
    console.log("[Kairu] URL changed:", currentUrl);
    // 少し待ってからページ内容を取得（SPAのコンテンツ読み込み待ち）
    setTimeout(async () => {
      await recordSiteVisit();
    }, 500);
  }
}

// History API (pushState/replaceState) をフック
const originalPushState = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (...args) {
  originalPushState(...args);
  onUrlChange();
};

history.replaceState = function (...args) {
  originalReplaceState(...args);
  onUrlChange();
};

// popstate イベント（ブラウザの戻る/進む）
window.addEventListener("popstate", () => {
  onUrlChange();
});

// hashchange イベント（ハッシュ変更）
window.addEventListener("hashchange", () => {
  onUrlChange();
});
