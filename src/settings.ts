if (document.readyState !== 'loading') {
        setUpPage();
} else {
        document.addEventListener('DOMContentLoaded', () => {
                setUpPage();
        });
}

async function setUpPage() {
        const modelSelect = document.getElementById('model') as HTMLSelectElement;
        const openaiApiKeyInput = document.getElementById('openaiApiKey') as HTMLInputElement;
        const googleApiKeyInput = document.getElementById('googleApiKey') as HTMLInputElement;
        const anthropicApiKeyInput = document.getElementById('anthropicApiKey') as HTMLInputElement;
        const deepseekApiKeyInput = document.getElementById('deepseekApiKey') as HTMLInputElement;
        const saveSettingsButton = document.getElementById('saveSettings');
        const untranslateButton = document.getElementById('untranslatePage');
        const translateButton = document.getElementById('translatePage');

        // Fetch the model and company mapping from background.js
        const modelCompanyMapping = await getModelCompanyMapping();

        // Populate the model dropdown
        for (const model in modelCompanyMapping) {
                const option = document.createElement('option');
                option.value = model;
                option.text = `${model} (${modelCompanyMapping[model]})`;
                modelSelect.appendChild(option);
        }

        // Load saved settings
        chrome.storage.sync.get(['model', 'openaiApiKey', 'anthropicApiKey', 'googleApiKey', 'deepseekApiKey'], (items) => {
                if (items.model) {
                        modelSelect.value = items.model;
                }
                if (items.openaiApiKey) {
                        openaiApiKeyInput.value = items.openaiApiKey;
                }
                if (items.googleApiKey) {
                        googleApiKeyInput.value = items.googleApiKey;
                }
                if (items.anthropicApiKey) {
                        anthropicApiKeyInput.value = items.anthropicApiKey;
                }
                if (items.deepseekApiKey) {
                        deepseekApiKeyInput.value = items.deepseekApiKey;
                }
        });

        // Save settings when the save button is clicked
        saveSettingsButton?.addEventListener('click', () => {
                const selectedModel = modelSelect.value;
                const openaiApiKey = openaiApiKeyInput.value;
                const anthropicApiKey = anthropicApiKeyInput.value;
                const googleApiKey = googleApiKeyInput.value;
                const deepseekApiKey = deepseekApiKeyInput.value;

                chrome.storage.sync.set({
                        model: selectedModel,
                        openaiApiKey: openaiApiKey,
                        anthropicApiKey: anthropicApiKey,
                        googleApiKey: googleApiKey,
                        deepseekApiKey: deepseekApiKey,
                }, () => {
                        console.log('Settings saved');
                });
                window.close();
        });

        // Add event listener for the untranslate button
        untranslateButton?.addEventListener('click', () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0].id) {
                                chrome.tabs.sendMessage(tabs[0].id, { action: 'untranslatePage' }, (response) => {
                                        console.log('Untranslate response:', response);
                                });
                        }
                });
        });

        translateButton?.addEventListener('click', () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0].id) {
                                chrome.tabs.sendMessage(tabs[0].id, { action: 'translatePage' }, (response) => {
                                        console.log('Translate response:', response);
                                });
                        }
                });
        });
}

function getModelCompanyMapping(): Promise<any> {
        return new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: "getModelCompanyMapping" }, (response) => {
                        resolve(response);
                });
        });
}
