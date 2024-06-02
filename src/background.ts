import { jsonrepair } from "jsonrepair";

const modelCompanyMapping: { [key: string]: string } = {
        "gpt-3.5-turbo-0125": "openai",
        "gpt-3.5-turbo-1106": "openai",
        "gpt-4o": "openai",
        "gpt-4-turbo": "openai",
        "gemini-1.5-flash-001": "google",
        "gemini-1.5-pro-001": "google",
        "claude-3-haiku-20240307": "anthropic",
        "deepseek-chat": "deepseek",
        // Add more models and their respective companies as needed
};

const companyUrlMapping: { [key: string]: string } = {
        "openai": "https://api.openai.com/v1/chat/completions",
        "anthropic": "https://api.anthropic.com/v1/messages",
        "google": "https://generativelanguage.googleapis.com/v1beta/models/",
        "deepseek": "https://api.deepseek.com/chat/completions",
        // Add more companies and their respective URLs as needed
};

interface Settings {
        model?: string;
        openaiApiKey?: string;
        anthropicApiKey?: string;
        googleApiKey?: string;
        deepseekApiKey?: string;
}

const basePrompt = "The output should be a JSON array with key 'messages'. Translate the following array of texts into English, preserving all formatting, punctuation, and special characters.";
const basePromptCn = "输出应为一个包含键 'messages' 的有效 JSON 数组。将以下文本数组翻译成英文，保留所有格式、标点符号和特殊字符。请确保输出完全是英文，并且必须是有效的 JSON 格式。"

let runningTotalRequest = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "getModelCompanyMapping") {
                sendResponse(modelCompanyMapping);
        } else if (request.action === "translate") {
                translateText(request.text).then(translatedText => {
                        sendResponse({ translatedText: translatedText });
                }).catch(error => {
                        console.log(error);
                        sendResponse(request.text);
                });
                return true; // Indicates an asynchronous response is expected
        }
        // Other message handlers...
});

async function translateText(textArray: string[]) {
        console.debug("text to be translated:", textArray);
        const { model, openaiApiKey, anthropicApiKey, googleApiKey, deepseekApiKey } = await new Promise<Settings>((resolve) => {
                chrome.storage.sync.get(['model', 'openaiApiKey', 'anthropicApiKey', 'googleApiKey', 'deepseekApiKey'], (items) => {
                        resolve(items);
                });
        });

        if (!model || model === '') {
                console.error('Model not set');
                return JSON.stringify({ messages: textArray });
        }

        const company = modelCompanyMapping[model];
        const apiUrl = companyUrlMapping[company];
        let apiKey: string | undefined;

        if (company === 'openai') {
                apiKey = openaiApiKey;
        }
        else if (company === 'anthropic') {
                apiKey = anthropicApiKey;
        }
        else if (company === 'google') {
                apiKey = googleApiKey;
        }
        else if (company === 'deepseek') {
                apiKey = deepseekApiKey;
        }

        if (!apiKey) {
                console.error('Api key not set');
                return JSON.stringify({ messages: textArray });
        }

        if (textArray.length === 0) {
                return JSON.stringify({ messages: textArray });
        }

        const translatedText = await makeTranslationRequest(textArray, model, apiKey, apiUrl, company);

        if (translatedText.length !== textArray.length) {
                console.warn('Translation length mismatch, retrying...');
                const retryTranslatedText = await makeTranslationRequest(textArray, model, apiKey, apiUrl, company);
                return retryTranslatedText;
        }

        return translatedText;
}

async function makeTranslationRequest(textArray: string[], model: string, apiKey: string, apiUrl: string, company: string) {
        try {
                const headers: Record<string, string> = {
                        'Content-Type': 'application/json'
                };

                if (company === 'openai' || company === 'deepseek') {
                        headers['Authorization'] = `Bearer ${apiKey}`;
                } else if (company === 'anthropic') {
                        headers['x-api-key'] = `${apiKey}`;
                        headers['anthropic-version'] = "2023-06-01";
                }


                // common body fields
                const body: Record<string, any> = {};

                if (company === 'openai') {
                        body['model'] = model;
                        body['response_format'] = { "type": "json_object" };
                        body['messages'] = [
                                { role: "system", content: basePrompt },
                                { role: "user", content: JSON.stringify({ messages: textArray }) }
                        ];
                }
                else if (company === 'deepseek') {
                        body['model'] = model;
                        body['messages'] = [
                                { role: "system", content: basePromptCn },
                                { role: "user", content: JSON.stringify({ messages: textArray }) }
                        ];
                }
                else if (company === 'anthropic') {
                        body['model'] = model;
                        body['system'] = basePrompt;
                        body['max_tokens'] = 1024;
                        body['messages'] = [
                                { role: "user", content: JSON.stringify({ messages: textArray }) }
                        ];
                } else if (company === 'google') {
                        apiUrl += `${model}:generateContent?key=${apiKey}`
                        body['contents'] = [
                                { role: "user", parts: [{ text: basePrompt }] },
                                { role: "model", parts: [{ text: "Understood" }] },
                                { role: "user", parts: [{ text: JSON.stringify({ messages: textArray }) }] },
                        ];
                        body['generationConfig'] = {
                                responseMimeType: "application/json",
                        }
                        body['safety_settings'] = [
                                {
                                        category: "HARM_CATEGORY_HARASSMENT",
                                        threshold: "BLOCK_ONLY_HIGH",
                                },
                                {
                                        category: "HARM_CATEGORY_HATE_SPEECH",
                                        threshold: "BLOCK_ONLY_HIGH",
                                },
                                {
                                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                                        threshold: "BLOCK_ONLY_HIGH",
                                },
                                {
                                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                                        threshold: "BLOCK_ONLY_HIGH", // Note: Block none doesnt work here, unless apply for the allow list
                                },
                        ]
                }


                const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(body)
                });

                if (!response.ok) {
                        console.error("Request Failed. Status Code: %d, Message: %s", response.status, await response.text());
                        return textArray;
                }

                const data = await response.json();
                console.debug("Request Body: ", JSON.stringify(textArray));
                console.debug(JSON.stringify(data));
                console.debug("Total requests made: ", runningTotalRequest++);

                // certain models return json as a markdown block (deepseek) ;)
                const translatedText = removeJsonBlock(
                        data.choices?.[0]?.message?.content ||
                        data.content?.[0]?.text ||
                        data.candidates?.[0]?.content?.parts?.[0]?.text
                        || '');

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
        } catch (error) {
                return []; // if error out here, force mismatch so we get a retry.
        }
}

function removeJsonBlock(text: string): string {
        return text.trim()
                .replace(/^```json\s*/, '')
                .replace(/\s*```$/, '');
}
