// Background Service Worker
console.log('Kairu AI Background Service Worker loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Kairu AI extension installed');
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in background:', request);

  if (request.type === 'GET_API_KEY') {
    // Retrieve API key from storage
    chrome.storage.sync.get(['openaiApiKey'], (result) => {
      sendResponse({ apiKey: result.openaiApiKey });
    });
    return true; // Keep the message channel open for async response
  }

  if (request.type === 'SAVE_API_KEY') {
    // Save API key to storage
    chrome.storage.sync.set({ openaiApiKey: request.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
