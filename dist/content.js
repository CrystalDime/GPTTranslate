/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};
/*!************************!*\
  !*** ./src/content.ts ***!
  \************************/

const batchSize = 4;
const preferredLanguage = navigator.language.split('-')[0];
let detectedLanguage = '';
if (document.readyState !== 'loading') {
    setTimeout(() => startTranslation()); // specify batch size
}
else {
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(() => startTranslation()); // specify batch size
    });
}
async function startTranslation() {
    const sampleText = document.body.innerText;
    detectedLanguage = await getLang(sampleText);
    if (detectedLanguage === preferredLanguage) {
        console.log("Skipping translation, not needed");
        return;
    }
    const autoTranslate = await shouldAutoTranslate(detectedLanguage);
    if (autoTranslate) {
        translateDocument(batchSize);
    }
    else {
        console.log("showing popup", autoTranslate);
        createTranslationDialog();
    }
}
function watchForMutation() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        gatherTextNodes(node).then(changedTextNodes => {
                            console.log("Making " + changedTextNodes.length / batchSize + " total requests");
                            translateInBatches(changedTextNodes, batchSize);
                        });
                    }
                });
            }
        });
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
function translateDocument(batchSize) {
    console.log("Harvesting text");
    gatherTextNodes(document.body).then(allTextNodes => {
        console.log("Making " + allTextNodes.length / batchSize + " total requests");
        translateInBatches(allTextNodes, batchSize);
    });
    watchForMutation();
}
async function gatherTextNodes(element) {
    const allTextNodes = [];
    const childNodes = Array.from(element.childNodes);
    for (let node of childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
            const detectedLanguage = await getLang(node.textContent);
            if (detectedLanguage !== preferredLanguage) {
                allTextNodes.push(node);
            }
        }
        else if (node.nodeType === Node.ELEMENT_NODE) {
            const childTextNodes = await gatherTextNodes(node);
            allTextNodes.push(...childTextNodes);
        }
    }
    return allTextNodes;
}
function translateInBatches(textNodes, batchSize) {
    for (let i = 0; i < textNodes.length; i += batchSize) {
        const batch = textNodes.slice(i, i + batchSize);
        const textArray = batch.map(node => { var _a; return (_a = node.textContent) === null || _a === void 0 ? void 0 : _a.trim(); });
        chrome.runtime.sendMessage({ action: "translate", text: textArray }, function (response) {
            if (response.translatedText && Array.isArray(response.translatedText) && response.translatedText.length === batch.length) {
                batch.forEach((node, index) => {
                    if (document.contains(node.parentElement)) {
                        node.textContent = response.translatedText[index];
                    }
                });
            }
        });
    }
}
async function getLang(text) {
    var _a, _b;
    const langResult = await chrome.i18n.detectLanguage(text);
    return (_b = (_a = langResult.languages[0]) === null || _a === void 0 ? void 0 : _a.language) !== null && _b !== void 0 ? _b : "";
}
function shouldAutoTranslate(lang) {
    return new Promise((resolve) => {
        chrome.storage.sync.get('alwaysTranslateLanguages', function (data) {
            const alwaysTranslateLanguages = data.alwaysTranslateLanguages || [];
            resolve(alwaysTranslateLanguages.includes(lang));
        });
    });
}
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'getDetectedLanguage') {
        sendResponse({ detectedLanguage: detectedLanguage });
    }
    else if (request.action === 'startTranslation') {
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
function createTranslationDialog() {
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
        console.log("erroring out?");
        dialog.innerHTML = html;
        const detectedLanguageNode = dialog.querySelector('#detected-language');
        const translateButton = dialog.querySelector('#translate-btn');
        const cancelButton = dialog.querySelector('#cancel-btn');
        const alwaysTranslateCheckbox = dialog.querySelector('#always-translate-checkbox');
        if (detectedLanguageNode) {
            detectedLanguageNode.innerText = detectedLanguage;
        }
        translateButton === null || translateButton === void 0 ? void 0 : translateButton.addEventListener('click', function () {
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
        cancelButton === null || cancelButton === void 0 ? void 0 : cancelButton.addEventListener('click', function () {
            dialog.remove();
        });
        console.log("appending to body");
        // Append the dialog to the document body
        document.body.appendChild(dialog);
        dialog.showModal();
    })
        .catch(error => {
        console.error('Error loading popup.html:', error);
    });
}

/******/ })()
;
//# sourceMappingURL=content.js.map