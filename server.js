require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080;

const corsOptions = {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

async function getAiResponse(prompt, accountId, apiToken) {
    const cloudflareApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;

    try {
        const cfResponse = await axios.post(
            cloudflareApiUrl,
            { prompt },
            {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const data = cfResponse.data;

        if (!data.success) {
            console.error('Cloudflare API Error (in helper):', data.errors || data);
            const errorMsg = data.errors?.[0]?.message || 'Cloudflare API request failed.';
            return { success: false, error: errorMsg, status: cfResponse.status >= 400 ? cfResponse.status : 500 };
        }

        const aiAnswer = data.result?.response;

        if (!aiAnswer) {
            console.error('Could not find response text in Cloudflare data (in helper):', data);
            return { success: false, error: 'Failed to parse AI response from Cloudflare.', status: 500 };
        }

        return { success: true, answer: aiAnswer };

    } catch (error) {
        console.error('Error in Cloudflare API call helper:', error.response?.data || error.message);
        let status = 500;
        let errorMsg = 'Failed to communicate with the AI service.';

        if (error.response) {
            status = error.response.status;
            errorMsg = `Cloudflare API error: ${error.response.data?.errors?.[0]?.message || error.response.statusText || 'Unknown error'}`;
        } else if (error.request) {
            status = 504;
            errorMsg = 'No response from Cloudflare API (gateway timeout).';
        } else if (error.code === 'ECONNABORTED') {
            status = 504;
            errorMsg = 'Cloudflare API call timed out.';
        }
        return { success: false, error: errorMsg, status: status };
    }
}

app.post('/api/ask-llama', async (req, res) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const { prompt: userPrompt } = req.body;

    if (!accountId || !apiToken) {
        console.error('Server Configuration Error: Cloudflare credentials missing in .env');
        return res.status(500).json({ error: 'Server configuration error.' });
    }
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
        return res.status(400).json({ error: "Venting is required, unless you want those thoughts to stay burdened in your head. Don't worry, no one will ever know what you wrote." });
    }

    console.log(`Received prompt: "${userPrompt}". Making four calls to Cloudflare.`);

    const prompt1 = `${userPrompt} (Reply in one or two sentences. Respond in an overly sarcastic tone, as if egging on a negative thought. Try to sound clever in a cruel way. Do not respond supportively. Do not refer to yourself as 'I' or assume a personality. Do not respond with a question. No question marks. No '?'. Affirm negativity. Respond ironically.)`;
    const prompt2 = `${userPrompt} (Reply in one or two sentences. Respond optimistically. Maybe make a light-hearted joke. Do not ask for follow up questions. Do not say explicitly 'I am here to support you' or anything similar. Do not use 'we'. Do not assume a personality. Do not say 'It sounds like you're feeling' or anything similar. Do not use 'you, you're, or your'. Do not explicitly tell me what to 'think'. Do not mention 'the bright side'. Do not say 'bright side'. Be subtle. Do not use 'on (the) one hand'. Do not ask questions. No '?'. NO QUESTION MARKS. Do not use 'well', especially not at the start of a setence. Respond sarcastically. Use simple words. Do not explicitly mention 'silver linings'. Do not say 'but at least'. Do not say 'at least'. Do not use 'at least' at the beginning of a sentence. Do not say 'maybe'. Do not explicitly mention 'optimism' or 'optimist(s)'.)`;
    const prompt3 = `${userPrompt} (Respond with just a short, relevant philosophical quote. Output only the quote itself, without quotation marks or attribution unless essential.)`;
    const prompt4 = `${userPrompt} (Tell a short, relevant, joke related to this topic. Keep it very brief. Output only the joke. No 'therapy' jokes.)`;


    try {
        const results = await Promise.all([
            getAiResponse(prompt1, accountId, apiToken),
            getAiResponse(prompt2, accountId, apiToken),
            getAiResponse(prompt3, accountId, apiToken),
            getAiResponse(prompt4, accountId, apiToken)
        ]);

        const response1 = results[0];
        const response2 = results[1];
        const response3 = results[2];
        const response4 = results[3];

        console.log('Received responses from Cloudflare:', response1, response2, response3, response4);

        res.status(200).json({
            answer1: response1.success ? response1.answer : null,
            error1: !response1.success ? response1.error : null,
            answer2: response2.success ? response2.answer : null,
            error2: !response2.success ? response2.error : null,
            answer3: response3.success ? response3.answer : null,
            error3: !response3.success ? response3.error : null,
            answer4: response4.success ? response4.answer : null,
            error4: !response4.success ? response4.error : null,
        });

    } catch (overallError) {
        console.error("Unexpected error during concurrent API calls:", overallError);
        res.status(500).json({ error: "An unexpected error occurred while processing your request." });
    }
});

app.listen(port, () => {
    console.log(`Secure AI backend server listening at http://localhost:${port}`);
    console.log(`Allowing requests from: ${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}`);
});