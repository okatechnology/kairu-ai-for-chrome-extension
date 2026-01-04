// Popup Script
console.log('Kairu AI Popup loaded');

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  const saveButton = document.getElementById('saveApiKey') as HTMLButtonElement;
  const toggleButton = document.getElementById('toggleKairu') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;
  const secretArea = document.getElementById('secretArea') as HTMLDivElement;
  const debugSection = document.getElementById('debugSection') as HTMLDivElement;
  const debugModeCheckbox = document.getElementById('debugMode') as HTMLInputElement;

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

  // Load saved debug mode state
  let debugModeEnabled = false;
  let debugUIVisible = false;
  chrome.storage.local.get(['kairu_debug_mode', 'kairu_debug_ui_visible'], (result) => {
    if (result.kairu_debug_mode !== undefined) {
      debugModeEnabled = result.kairu_debug_mode;
      debugModeCheckbox.checked = debugModeEnabled;
    }
    if (result.kairu_debug_ui_visible !== undefined) {
      debugUIVisible = result.kairu_debug_ui_visible;
      if (debugUIVisible) {
        debugSection.classList.add('visible');
      }
    }
  });

  // Secret area click counter for debug mode
  let secretClickCount = 0;
  let secretClickTimer: number | null = null;

  secretArea.addEventListener('click', () => {
    secretClickCount++;

    // Reset timer
    if (secretClickTimer !== null) {
      clearTimeout(secretClickTimer);
    }

    // Reset click count after 2 seconds of no clicks
    secretClickTimer = window.setTimeout(() => {
      secretClickCount = 0;
    }, 2000);

    // Show debug section after 5 clicks
    if (secretClickCount >= 5) {
      debugUIVisible = true;
      debugSection.classList.add('visible');
      chrome.storage.local.set({ kairu_debug_ui_visible: true });
      secretClickCount = 0;
    }
  });

  // Debug mode toggle
  debugModeCheckbox.addEventListener('change', () => {
    debugModeEnabled = debugModeCheckbox.checked;
    chrome.storage.local.set({ kairu_debug_mode: debugModeEnabled });

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_DEBUG_MODE',
          enabled: debugModeEnabled,
        });
      }
    });

    statusDiv.textContent = debugModeEnabled ? 'デバッグモード有効' : 'デバッグモード無効';
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 2000);
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
