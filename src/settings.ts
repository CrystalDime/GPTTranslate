interface TranslationRule {
  targetTranslation: string;
  explanation: string;
}

interface Settings {
  model?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  deepseekApiKey?: string;
  translationRules?: TranslationRule[];
}

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
  const clearCacheButton = document.getElementById('clearCache');
  const toggleContextButton = document.getElementById('toggleContext');
  const translationContext = document.getElementById('translationContext');
  const addRuleButton = document.getElementById('addRule');
  const contextRulesContainer = document.getElementById('contextRules');

  // Translation context management
  let translationRules: TranslationRule[] = [];

  toggleContextButton?.addEventListener('click', () => {
    translationContext?.classList.toggle('visible');
    toggleContextButton.textContent = translationContext?.classList.contains('visible')
      ? 'Hide Translation Context'
      : 'Show Translation Context';
  });

  function createRuleElement(rule: TranslationRule, index: number): HTMLDivElement {
    const ruleDiv = document.createElement('div');
    ruleDiv.className = 'context-rule';

    const targetInput = document.createElement('input');
    targetInput.type = 'text';
    targetInput.placeholder = 'Desired translation';
    targetInput.value = rule.targetTranslation;
    targetInput.addEventListener('input', () => {
      translationRules[index].targetTranslation = targetInput.value;
    });

    const explanationInput = document.createElement('input');
    explanationInput.type = 'text';
    explanationInput.placeholder = 'When to use this translation (context)';
    explanationInput.value = rule.explanation;
    explanationInput.addEventListener('input', () => {
      translationRules[index].explanation = explanationInput.value;
    });

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-rule';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      translationRules.splice(index, 1);
      renderRules();
    });

    ruleDiv.appendChild(targetInput);
    ruleDiv.appendChild(explanationInput);
    ruleDiv.appendChild(removeButton);

    return ruleDiv;
  }

  function renderRules() {
    if (!contextRulesContainer) return;

    contextRulesContainer.innerHTML = '';
    translationRules.forEach((rule, index) => {
      const ruleElement = createRuleElement(rule, index);
      contextRulesContainer.appendChild(ruleElement);
    });
  }

  addRuleButton?.addEventListener('click', () => {
    translationRules.push({
      targetTranslation: '',
      explanation: ''
    });
    renderRules();
  });

  // Load existing translation rules
  chrome.storage.sync.get(['translationRules'], (items) => {
    if (items.translationRules) {
      translationRules = items.translationRules;
      renderRules();
    }
  });

  // Model mapping setup
  const modelCompanyMapping = await getModelCompanyMapping();
  for (const model in modelCompanyMapping) {
    const option = document.createElement('option');
    option.value = model;
    option.text = `${model} (${modelCompanyMapping[model]})`;
    modelSelect.appendChild(option);
  }

  // Load all saved settings
  chrome.storage.sync.get([
    'model',
    'openaiApiKey',
    'anthropicApiKey',
    'googleApiKey',
    'deepseekApiKey'
  ], (items) => {
    if (items.model) modelSelect.value = items.model;
    if (items.openaiApiKey) openaiApiKeyInput.value = items.openaiApiKey;
    if (items.googleApiKey) googleApiKeyInput.value = items.googleApiKey;
    if (items.anthropicApiKey) anthropicApiKeyInput.value = items.anthropicApiKey;
    if (items.deepseekApiKey) deepseekApiKeyInput.value = items.deepseekApiKey;
  });

  // Save all settings
  saveSettingsButton?.addEventListener('click', () => {
    const settings: Settings = {
      model: modelSelect.value,
      openaiApiKey: openaiApiKeyInput.value,
      anthropicApiKey: anthropicApiKeyInput.value,
      googleApiKey: googleApiKeyInput.value,
      deepseekApiKey: deepseekApiKeyInput.value,
      translationRules: translationRules.filter(rule =>
        rule.targetTranslation.trim() !== '' && rule.explanation.trim() !== ''
      )
    };

    chrome.storage.sync.set(settings, () => {
      console.log('Settings saved');
      window.close();
    });
  });

  // Action button handlers
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

  clearCacheButton?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'clearCache' }, (response) => {
          console.log('Cache cleared response:', response);
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
