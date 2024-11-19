import express from 'express';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/proxy', async (req, res) => {
    const query = req.query.query;
    const voice = req.query.voice || 'alloy';
    const model = req.query.model || 'tts-1';
    
    try {
        const mp3 = await openai.audio.speech.create({
            model: model,
            voice: voice,
            input: query,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length
        });
        res.send(buffer);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});