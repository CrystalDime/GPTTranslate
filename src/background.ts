import { jsonrepair } from "jsonrepair";

chrome.runtime.onInstalled.addListener(() => {
        console.log('Extension installed and running.');
});


interface Settings {
        model?: string;
        apiKey?: string;
}
// TODO: Allow target language to be variable
const basePrompt = "You are provided with an array of texts in various languages. Your task is to translate each text into English. The output should be formatted as a JSON array named 'messages'.";

let runningTotalRequest = 0;

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.action === "translate") {
                translateText(request.text).then(translatedText => {
                        sendResponse({ translatedText: translatedText });
                }).catch(error => {
                        sendResponse(request.text);
                });
                return true; // Indicates an asynchronous response is expected
        }
});

async function translateText(textArray: string[]) {
        console.log("text to be translated:", textArray);
        const { model, apiKey } = await new Promise<Settings>((resolve) => {
                chrome.storage.sync.get(['model', 'apiKey'], (items) => {
                        resolve(items);
                });
        });

        if (!model || !apiKey) {
                console.error('Model or API key not set');
                return JSON.stringify({ messages: textArray });
        }
        if (textArray.length === 0) {
                return JSON.stringify({ messages: textArray });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                        model: model, // Specify the model
                        messages: [
                                { role: "system", content: basePrompt },
                                { role: "user", content: JSON.stringify(textArray) }
                        ],
                        response_format: { "type": "json_object" }
                })
        });

        const data = await response.json();
        console.log(JSON.stringify(data));
        console.log("Total requests made: ", runningTotalRequest++);
        const translatedText = data.choices[0].message.content.trim();

        try {
                const parsedTranslation = JSON.parse(translatedText);
                if (parsedTranslation.messages && Array.isArray(parsedTranslation.messages)) {
                        return parsedTranslation.messages;
                } else {
                        console.warn('Invalid response format from the API');
                        return JSON.parse(jsonrepair(translatedText)).messages;
                }
        } catch (error) {
                console.warn('Error parsing the translated text:', error);
                return JSON.parse(jsonrepair(translatedText)).messages;
        }
}
