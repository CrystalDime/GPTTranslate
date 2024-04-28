if (document.readyState !== 'loading') {
        setUpPage();
} else {
        document.addEventListener('DOMContentLoaded', () => {
                setUpPage();
        });
}

function setUpPage() {
        console.log("setting up");
        const modelSelect = document.getElementById('model') as HTMLInputElement;
        const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
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
        saveSettingsButton?.addEventListener('click', () => {
                const selectedModel = modelSelect.value;
                const apiKey = apiKeyInput.value;

                chrome.storage.sync.set({ model: selectedModel, apiKey: apiKey }, () => {
                        console.log('Settings saved');
                });
                window.close();
        });
}
