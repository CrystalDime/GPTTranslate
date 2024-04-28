/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};
/*!*************************!*\
  !*** ./src/settings.ts ***!
  \*************************/

if (document.readyState !== 'loading') {
    setUpPage();
}
else {
    document.addEventListener('DOMContentLoaded', () => {
        setUpPage;
    });
}
function setUpPage() {
    const modelSelect = document.getElementById('model');
    const apiKeyInput = document.getElementById('apiKey');
    const saveSettingsButton = document.getElementById('saveSettings');
    // Load saved settings
    chrome.storage.sync.get(['model', 'apiKey'], (items) => {
        if (items.model) {
            modelSelect.value = items.model;
        }
        if (items.apiKey) {
            apiKeyInput.value = items.apiKey;
        }
    });
    // Save settings when the save button is clicked
    saveSettingsButton === null || saveSettingsButton === void 0 ? void 0 : saveSettingsButton.addEventListener('click', () => {
        const selectedModel = modelSelect.value;
        const apiKey = apiKeyInput.value;
        chrome.storage.sync.set({ model: selectedModel, apiKey: apiKey }, () => {
            console.log('Settings saved');
        });
    });
}

/******/ })()
;
//# sourceMappingURL=popup.js.map