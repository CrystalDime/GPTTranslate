class LRUCache {
  private maxSize: number;
  private cache: Map<string, TranslationCacheEntry>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  async loadCache(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get('translationCache', (data) => {
        if (data.translationCache) {
          this.cache = new Map(Object.entries(data.translationCache));
        }
        resolve();
      });
    });
  }

  async saveCache(): Promise<void> {
    const cacheObject = Object.fromEntries(this.cache);
    return new Promise((resolve) => {
      chrome.storage.local.set({ translationCache: cacheObject }, () => {
        resolve();
      });
    });
  }

  get(key: string): TranslationCacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    } else {
      this.cache.delete(key);
      return undefined;
    }
  }

  set(key: string, value: TranslationCacheEntry): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

class TranslationState {
  translationRecord: Map<Node, string>;
  translationCache: LRUCache;
  batchSize: number;
  aggregationTimeout: NodeJS.Timeout | null;
  textNodeQueue: Set<Node>;
  pendingTextNodes: Set<Node>;
  excludedTags: string[] = ["SCRIPT", "STYLE", "META", "NOSCRIPT", "I", "RP", "RT"];
  mutationObserver?: MutationObserver | null;

  constructor(batchSize: number, cacheSize: number) {
    this.translationRecord = new Map();
    this.translationCache = new LRUCache(cacheSize);
    this.batchSize = batchSize;
    this.aggregationTimeout = null;
    this.textNodeQueue = new Set();
    this.pendingTextNodes = new Set();
  }

  async clearCache(): Promise<void> {
    // Clear the in-memory cache
    this.translationCache.clear();

    // Clear the cache from Chrome's local storage
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove('translationCache', () => {
        console.log('Translation cache cleared');
        resolve();
      });
    });
  }
}

interface TranslationResponse {
  translatedText: string[];
}

interface TranslationCacheEntry {
  translatedText: string;
  expiry: number;
}

const preferredLanguage = navigator.language.split('-')[0];
const cacheExpiryTime = 24 * 60 * 60 * 1000; // 24 hours
const batchSize = 10;
const cacheSize = 10000;
const state = new TranslationState(batchSize, cacheSize);


// Program entry point
if (document.readyState === "complete") {
  setTimeout(startTranslation);
} else {
  document.onreadystatechange = () => {
    if (document.readyState === "complete") {
      setTimeout(startTranslation);
    }
  };
}


// Utility functions
function isNumber(str: string): boolean {
  return !isNaN(Number(str));
}

async function getLang(text: string): Promise<string> {
  const langResult = await chrome.i18n.detectLanguage(text);
  return langResult?.languages[0]?.language ?? "";
}

function shouldAutoTranslate(lang: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('alwaysTranslateLanguages', function (data) {
      const alwaysTranslateLanguages = data.alwaysTranslateLanguages || [];
      resolve(alwaysTranslateLanguages.includes(lang));
    });
  });
}

// Main functions
async function startTranslation(): Promise<void> {
  const sampleText = document.body.innerText;
  const detectedLanguage = await getLang(sampleText);
  if (detectedLanguage.length === 0) {
    return;
  }

  if (detectedLanguage === preferredLanguage) {
    console.log("Skipping translation, not needed");
    return;
  }

  const autoTranslate = await shouldAutoTranslate(detectedLanguage);
  if (autoTranslate) {
    translateDocument(document, state);
  } else {
    console.log("Showing popup", autoTranslate);
    createTranslationDialog(detectedLanguage, state);
  }
}

async function translateDocument(doc: Document, state: TranslationState): Promise<void> {
  await state.translationCache.loadCache();
  const allTextNodes = await gatherTextNodes(doc.body, state);

  translateInBatches(allTextNodes, state);

  watchForMutation(doc, state);
}

function watchForMutation(doc: Document, state: TranslationState): void {
  state.mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            gatherTextNodes(node, state).then((nodes: Set<Node>) => {
              nodes.forEach(n => state.textNodeQueue.add(n));
            });
          }
        });
      }
    });

    if (state.aggregationTimeout) {
      clearTimeout(state.aggregationTimeout);
    }

    state.aggregationTimeout = setTimeout(() => {
      while (state.textNodeQueue.size > 0) {
        const node = state.textNodeQueue.values().next().value;
        state.textNodeQueue.delete(node);
        state.pendingTextNodes.add(node);
      }
      translateInBatches(state.pendingTextNodes, state);
      state.pendingTextNodes.clear();
    }, 300); // Aggregation delay
  });

  state.mutationObserver.observe(doc.body, {
    childList: true,
    subtree: true,
  });
}

async function gatherTextNodes(element: Node, state: TranslationState): Promise<Set<Node>> {
  const allTextNodes: Set<Node> = new Set<Node>();
  const childNodes = element.childNodes;
  const MIN_I_TAG_LENGTH = 10; // Adjust this threshold as needed

  for (let node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0 && !state.translationRecord.get(node)) {
      if (!isNumber(node.textContent)) {
        state.translationRecord.set(node, node.textContent);
        allTextNodes.add(node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elementNode = node as HTMLElement;

      // Special handling for <i> tags
      if (elementNode.tagName === 'I') {
        const textContent = elementNode.textContent?.trim() || '';
        if (textContent.length >= MIN_I_TAG_LENGTH) {
          // Process longer <i> content
          const childTextNodes = await gatherTextNodes(node, state);
          childTextNodes.forEach(node => allTextNodes.add(node));
        }
        continue;
      }

      // Handle other excluded tags
      if (state.excludedTags.includes(elementNode.tagName)) {
        continue;
      }

      const childTextNodes = await gatherTextNodes(node, state);
      childTextNodes.forEach(node => allTextNodes.add(node));
    }
  }
  return allTextNodes;
}

async function translateInBatches(textNodesSet: Set<Node>, state: TranslationState): Promise<void> {
  const textNodes = Array.from(textNodesSet);
  const cachedResults: Map<Node, string> = new Map();
  const toTranslate: { node: Node; text: string }[] = [];

  // WARNING: This is a hack and should not be used in production!
  // This code replaces Japanese-style dialogue markers with double quotes.
  // It's not a robust solution and may cause issues with other text c

  for (const node of textNodes) {
    const textContent = node.textContent || '';
    const cacheEntry = state.translationCache.get(textContent);
    if (cacheEntry) {
      cachedResults.set(node, cacheEntry.translatedText);
    } else {
      // Hack: Replace Japanese-style dialogue markers with double quotes
      const modifiedText = textContent.replace(/「(.+?)」/g, '"$1"');
      toTranslate.push({ node, text: modifiedText });
    }
  }

  // NOTE: This modification assumes all instances of 「」are used for dialogue.
  // It may incorrectly modify other uses of these characters, potentially
  // breaking the meaning of the text in some cases.

  for (const [node, translatedText] of cachedResults.entries()) {
    node.textContent = translatedText;
  }

  console.log("Making %d requests to GPT", Math.ceil(toTranslate.length / state.batchSize));
  for (let i = 0; i < toTranslate.length; i += state.batchSize) {
    const batch = toTranslate.slice(i, i + state.batchSize);
    const textArray = batch.map(item => item.text);
    chrome.runtime.sendMessage({ action: "translate", text: textArray }, async function (response: TranslationResponse) {
      if (response.translatedText && Array.isArray(response.translatedText)) {
        batch.forEach((item, index) => {
          const node = item.node;
          const translatedText = response.translatedText[index];
          if (document.contains(node) && translatedText) {
            node.textContent = translatedText;
            getLang(translatedText).then((langDetected: string) => {
              if (langDetected === 'en') {
                state.translationCache.set(item.text, { translatedText, expiry: Date.now() + cacheExpiryTime });
              }
            });
          }
        });
        await state.translationCache.saveCache();
      }
    });
  }
}

function createTranslationDialog(detectedLanguage: string, state: TranslationState): void {
  const dialog = document.createElement('dialog');
  dialog.id = 'translation-dialog';
  dialog.style.position = 'fixed';
  dialog.style.marginLeft = 'auto';
  dialog.style.marginRight = '20vw';
  dialog.style.marginBottom = 'auto';
  dialog.style.marginTop = '0';
  dialog.style.padding = '10px';
  dialog.style.border = '1px solid #ccc';
  dialog.style.zIndex = '9999';
  dialog.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)';
  dialog.style.borderRadius = '4px';

  fetch(chrome.runtime.getURL('../public/popup.html'))
    .then(response => response.text())
    .then(html => {
      dialog.innerHTML = html;

      const detectedLanguageNode = dialog.querySelector('#detected-language') as HTMLElement;
      const translateButton = dialog.querySelector('#translate-btn');
      const cancelButton = dialog.querySelector('#cancel-btn');
      const alwaysTranslateCheckbox = dialog.querySelector('#always-translate-checkbox') as HTMLInputElement;

      if (detectedLanguageNode) {
        detectedLanguageNode.innerText = detectedLanguage;
      }

      translateButton?.addEventListener('click', function () {
        const alwaysTranslate = alwaysTranslateCheckbox.checked;
        if (alwaysTranslate) {
          chrome.storage.sync.get('alwaysTranslateLanguages', function (data) {
            const alwaysTranslateLanguages = data.alwaysTranslateLanguages || [];
            if (!alwaysTranslateLanguages.includes(detectedLanguage)) {
              alwaysTranslateLanguages.push(detectedLanguage);
              chrome.storage.sync.set({ alwaysTranslateLanguages: alwaysTranslateLanguages });
            }
          });
        }
        translateDocument(document, state);
        dialog.remove();
      });

      cancelButton?.addEventListener('click', function () {
        dialog.remove();
      });

      document.body.appendChild(dialog);
      dialog.showModal();
    })
    .catch(error => {
      console.error('Error loading popup.html:', error);
    });
}

function untranslateDocument(state: TranslationState): void {
  state.mutationObserver?.disconnect();
  state.translationRecord.forEach((originalText: string, node: Node) => {
    if (document.contains(node)) {
      node.textContent = originalText;
    }
  });

  state.translationRecord.clear();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "untranslatePage") {
    untranslateDocument(state);
    sendResponse({ status: "success" });
  } else if (request.action === "translatePage") {
    translateDocument(document, state);
    sendResponse({ status: "success" });
  } else if (request.action === "clearCache") {
    state.clearCache().then(() => {
      sendResponse({ status: "success" });
    });
    return true; // Indicates that the response is sent asynchronously
  }
});

export {
  LRUCache,
  TranslationState,
  TranslationCacheEntry,
  TranslationResponse,
  isNumber,
  getLang,
  shouldAutoTranslate,
  startTranslation,
  translateDocument,
  gatherTextNodes,
  translateInBatches,
  createTranslationDialog,
  untranslateDocument,
  watchForMutation,
};
