const batchSize = 4;
const preferredLanguage = navigator.language.split('-')[0];
let detectedLanguage = '';

const excludedTags: string[] = ["SCRIPT", "STYLE", "META", "NOSCRIPT", "I"];

if (document.readyState !== 'loading') {
        setTimeout(startTranslation, 500);  // specify batch size
} else {
        document.addEventListener('DOMContentLoaded', function () {
                setTimeout(startTranslation, 500);  // specify batch size
        });
}

// Interfaces
interface TranslationResponse {
        translatedText: string[];
}

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

function translateDocument(batchSize: number): void {
        console.log("Harvesting text");
        gatherTextNodes(document.body).then(allTextNodes => {
                translateInBatches(allTextNodes, batchSize);
        });
        watchForMutation();
}

const pendingTextNodes: Set<Node> = new Set();
const textNodeQueue: Set<Node> = new Set();
let aggregationTimeout: any;
const aggregationDelay = 200; // 200ms delay

function watchForMutation(): void {
        const observer = new MutationObserver((mutations) => {
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

        observer.observe(document.body, {
                childList: true,
                subtree: true,
        });
}

async function gatherTextNodes(element: Node): Promise<Set<Node>> {
        const allTextNodes: Set<Node> = new Set<Node>();
        const childNodes = element.childNodes;
        for (let node of childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
                        // Ignore text that is a number
                        if (!isNumber(node.textContent)) {
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

function translateInBatches(textNodesSet: Set<Node>, batchSize: number): void {
        const textNodes = Array.from(textNodesSet);
        console.log("Making %d requests to GPT", Math.ceil(textNodes.length / batchSize));
        for (let i = 0; i < textNodes.length; i += batchSize) {
                const batch = textNodes.slice(i, i + batchSize);
                const textArray = batch.map(node => node.textContent);
                chrome.runtime.sendMessage({ action: "translate", text: textArray }, function (response: TranslationResponse) {
                        if (response.translatedText && Array.isArray(response.translatedText)) {
                                batch.forEach((node, index) => {
                                        if (document.contains(node)) {
                                                if (typeof (response?.translatedText[index]) !== "string") {
                                                        console.error(response?.translatedText[index], typeof (response?.translatedText[index], "Index : ", index));
                                                }
                                                node.textContent = response.translatedText[index];
                                        }
                                });
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

// Chrome runtime message listener
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.action === 'getDetectedLanguage') {
                sendResponse({ detectedLanguage: detectedLanguage });
        } else if (request.action === 'startTranslation') {
                const alwaysTranslate = request.alwaysTranslate;
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
        }
});
