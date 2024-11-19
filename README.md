# OpenAI Text-to-Speech Practice Tool

A web application that converts text to speech using OpenAI's TTS API. Perfect for practicing English speaking, especially for IELTS preparation. You can write your own speaking materials and convert them to natural-sounding speech for listening and mimicking.

## Background

This tool is designed to help English learners, particularly IELTS candidates, improve their speaking skills by:
- Converting your written responses to natural speech
- Hearing proper pronunciation of your prepared materials
- Creating practice materials for shadowing exercises
- Saving model answers as audio files for repeated practice

## Features

- Multiple voice options (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
- Two quality levels: faster conversion (tts-1) or higher quality (tts-1-hd)
- Simple and clean interface
- Audio playback controls

## Setup

1. Clone the repository

2. Create `.env` file in root:

```bash
OPENAI_API_KEY=your-openai-api-key
```

3. Install dependencies:
```bash
npm install
```

4. Start server:
```bash
npm start
```

Visit `http://localhost:3000` in your browser.

## Usage Example

1. Type or paste your speaking practice material:
```
Some people believe that extreme sports help build character.
To what extent do you agree or disagree with this statement?

Well, I believe extreme sports can significantly contribute to character development.
Firstly, these activities push individuals out of their comfort zones...
```

2. Select voice and quality preferences
3. Click "Convert to Speech"
4. Save the audio for practice

## Note

You need an OpenAI API key with access to the TTS models. Visit [OpenAI Platform](https://platform.openai.com/) to get your API key.

## Dependencies

- Node.js
- Express
- OpenAI API
- dotenv