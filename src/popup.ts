// Popup Script
console.log('Kairu AI Popup loaded');

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  const saveButton = document.getElementById('saveApiKey') as HTMLButtonElement;
  const toggleButton = document.getElementById('toggleKairu') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  // Load saved API key
  chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, (response) => {
    if (response.apiKey) {
      apiKeyInput.value = response.apiKey;
    }
  });

  // Load saved enabled state
  let kairuEnabled = false;
  chrome.storage.local.get('kairu_enabled', (result) => {
    if (result.kairu_enabled !== undefined) {
      kairuEnabled = result.kairu_enabled;
      updateToggleButton();
    }
  });

  // Update toggle button appearance
  function updateToggleButton() {
    toggleButton.textContent = kairuEnabled ? 'Kairuを無効化' : 'Kairuを有効化';
    toggleButton.style.backgroundColor = kairuEnabled ? '#dc3545' : '#28a745';
  }

  // Save API key
  saveButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.runtime.sendMessage(
        { type: 'SAVE_API_KEY', apiKey },
        (response) => {
          if (response.success) {
            statusDiv.textContent = 'APIキーを保存しました';
            setTimeout(() => {
              statusDiv.textContent = '';
            }, 2000);
          }
        }
      );
    }
  });

  // Toggle Kairu mode
  toggleButton.addEventListener('click', () => {
    kairuEnabled = !kairuEnabled;
    updateToggleButton();

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TOGGLE_KAIRU',
          enabled: kairuEnabled,
        });
      }
    });
  });
});
