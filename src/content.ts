const batchSize = 10; // TODO: Make this configurable/ anything more than 10 seems to cause inconsistency
const preferredLanguage = navigator.language.split('-')[0];
let detectedLanguage = '';

const excludedTags: string[] = ["SCRIPT", "STYLE", "META", "NOSCRIPT", "I"];
const translationRecord: Map<Node, string> = new Map();
let mutationObserver: MutationObserver;

if (document.readyState === "complete") {
        setTimeout(startTranslation);
} else {
        document.onreadystatechange = () => {
                if (document.readyState === "complete") {
                        setTimeout(startTranslation);
                }
        };
}

// Interfaces
interface TranslationResponse {
        translatedText: string[];
}

interface TranslationCacheEntry {
        translatedText: string;
        expiry: number;
}

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
                        // Refresh key
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
}

const cacheExpiryTime = 24 * 60 * 60 * 1000; // 24 hours
const translationCache = new LRUCache(10000); // Adjust the size according to your needs

// Utility functions
function isNumber(str: string): boolean {
        return !isNaN(Number(str));
}

async function getLang(text: string): Promise<string> {
        const langResult = await chrome.i18n.detectLanguage(text);
        return langResult.languages[0]?.language ?? "";
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
        detectedLanguage = await getLang(sampleText);

        if (detectedLanguage.length === 0) {
                return;
        }

        if (detectedLanguage === preferredLanguage) {
                console.log("Skipping translation, not needed");
                return;
        }

        const autoTranslate = await shouldAutoTranslate(detectedLanguage);
        if (autoTranslate) {
                translateDocument(batchSize);
        } else {
                console.log("showing popup", autoTranslate);
                createTranslationDialog();
        }
}

async function translateDocument(batchSize: number): Promise<void> {
        await translationCache.loadCache(); // Load the cache from storage

        gatherTextNodes(document.body).then(allTextNodes => {
                translateInBatches(allTextNodes, batchSize);
        });

        watchForMutation();
}

const pendingTextNodes: Set<Node> = new Set();
const textNodeQueue: Set<Node> = new Set();
let aggregationTimeout: NodeJS.Timeout;
const aggregationDelay = 300; // 200ms delay

function watchForMutation(): void {
        mutationObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                        if (mutation.type === 'childList') {
                                mutation.addedNodes.forEach((node) => {
                                        if (node.nodeType === Node.ELEMENT_NODE) {
                                                gatherTextNodes(node).then((nodes: Set<Node>) => {
                                                        nodes.forEach(n => textNodeQueue.add(n));
                                                });
                                        }
                                });
                        }
                });

                if (aggregationTimeout) {
                        clearTimeout(aggregationTimeout);
                }

                aggregationTimeout = setTimeout(() => {
                        while (textNodeQueue.size > 0) {
                                const node = textNodeQueue.values().next().value;
                                textNodeQueue.delete(node);
                                pendingTextNodes.add(node);
                        }
                        translateInBatches(pendingTextNodes, batchSize);
                        pendingTextNodes.clear();
                }, aggregationDelay);
        });

        mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
        });
}

async function gatherTextNodes(element: Node): Promise<Set<Node>> {
        const allTextNodes: Set<Node> = new Set<Node>();
        const childNodes = element.childNodes;
        for (let node of childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0 && !translationRecord.get(node)) {
                        // Ignore text that is a number
                        if (!isNumber(node.textContent)) {
                                translationRecord.set(node, node.textContent); // Store original text
                                allTextNodes.add(node);
                        }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                        // Don't translate certain elements
                        if (excludedTags.includes((node as HTMLElement).tagName)) {
                                continue;
                        }
                        const childTextNodes = await gatherTextNodes(node);
                        childTextNodes.forEach(node => allTextNodes.add(node));
                }
        }
        return allTextNodes;
}

async function translateInBatches(textNodesSet: Set<Node>, batchSize: number): Promise<void> {
        const textNodes = Array.from(textNodesSet);
        const cachedResults: Map<Node, string> = new Map();
        const toTranslate: { node: Node; text: string }[] = [];

        for (const node of textNodes) {
                const textContent = node.textContent || '';
                const cacheEntry = translationCache.get(textContent);
                if (cacheEntry) {
                        cachedResults.set(node, cacheEntry.translatedText);
                } else {
                        toTranslate.push({ node, text: textContent });
                }
        }

        // Apply cached translations
        for (const [node, translatedText] of cachedResults.entries()) {
                node.textContent = translatedText;
        }

        // Process batches for remaining translations
        console.log("Making %d requests to GPT", Math.ceil(toTranslate.length / batchSize));
        for (let i = 0; i < toTranslate.length; i += batchSize) {
                const batch = toTranslate.slice(i, i + batchSize);
                const textArray = batch.map(item => item.text);
                chrome.runtime.sendMessage({ action: "translate", text: textArray }, async function (response: TranslationResponse) {
                        if (response.translatedText && Array.isArray(response.translatedText)) {
                                batch.forEach((item, index) => {
                                        const node = item.node;
                                        const translatedText = response.translatedText[index];
                                        if (document.contains(node) && translatedText) {
                                                node.textContent = translatedText;
                                                // Write to cache if detected language is English
                                                getLang(translatedText).then((langDetected: string) => {
                                                        if (langDetected === 'en') {
                                                                translationCache.set(item.text, { translatedText, expiry: Date.now() + cacheExpiryTime });
                                                        }
                                                })
                                        }
                                });
                                await translationCache.saveCache(); // Save the updated cache to storage
                        }
                });
        }
}

function createTranslationDialog(): void {
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

        // Load content into the dialog from ../public/popup.html
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
                                translateDocument(batchSize);
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

// Function to untranslate the document
function untranslateDocument(): void {
        if (mutationObserver) {
                mutationObserver.disconnect();
        }
        translationRecord.forEach((originalText: string, node: Node) => {
                if (document.contains(node)) {
                        node.textContent = originalText;
                }
        });

        translationRecord.clear();
}

// Listen for untranslatePage request
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "untranslatePage") {
                untranslateDocument();
                sendResponse({ status: "success" });
        } else if (request.action === "translatePage") {
                startTranslation();
                sendResponse({ status: "success" });
        }
});
