/**
 * Server setup and initialization
 */
import express from 'express';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Set up static file serving and JSON parsing
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

/**
 * DialogueProcessor class handles text segmentation and voice assignment
 * for multi-voice text-to-speech conversion
 */
class DialogueProcessor {
  constructor() {
    // Configure available voices for different roles
    this.VOICE_CONFIG = {
      narrator: 'alloy',
      voices: [
        { voice: 'echo', type: 'male' },     // First male voice
        { voice: 'nova', type: 'female' },    // First female voice
        { voice: 'onyx', type: 'male' },      // Second male voice
        { voice: 'shimmer', type: 'female' }  // Second female voice
      ]
    };
    this.characterProfiles = new Map();
    this.nextVoiceIndex = 0;
  }

  /**
   * Assigns a voice to a speaker based on order of appearance
   * @param {string} speaker - The name of the speaker
   * @returns {string} The assigned voice identifier
   */
  assignVoice(speaker) {
    // Return existing voice if speaker already has one
    if (this.characterProfiles.has(speaker)) {
      return this.characterProfiles.get(speaker).voice;
    }

    // Assign next available voice in sequence
    const voiceConfig = this.VOICE_CONFIG.voices[this.nextVoiceIndex % this.VOICE_CONFIG.voices.length];
    this.nextVoiceIndex++;

    this.characterProfiles.set(speaker, {
      voice: voiceConfig.voice,
      type: voiceConfig.type
    });

    console.log(`Assigned ${voiceConfig.voice} to ${speaker}`);
    return voiceConfig.voice;
  }

  /**
   * Parses a line of text to identify dialogue parts
   * @param {string} line - The line to parse
   * @returns {Object} Parsed line information
   */
  parseDialogueLine(line) {
    line = line.trim();
    
    // Check for "Speaker: dialogue" format
    const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      return {
        isDialogue: true,
        speaker: colonMatch[1].trim(),
        text: colonMatch[2].trim()
      };
    }

    // Check for "dialogue," speaker said" format
    const quoteMatch = line.match(/^"([^"]+)"\s*,?\s*([^,\.]+)\s+(?:said|asked|replied)/i);
    if (quoteMatch) {
      return {
        isDialogue: true,
        speaker: quoteMatch[2].trim(),
        text: quoteMatch[1].trim()
      };
    }

    // Not a dialogue line, treat as narration
    return { isDialogue: false, text: line };
  }

  /**
   * Process text and split into segments with appropriate voices
   * @param {string} text - The text to process
   * @returns {Array} Array of segments with assigned voices
   */
  processText(text) {
    const lines = text.split('\n');
    const segments = [];
    let backgroundLines = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsedLine = this.parseDialogueLine(line);
      console.log('Parsed line:', parsedLine);
      
      if (parsedLine.isDialogue) {
        // Process any accumulated background narration
        if (backgroundLines.length > 0) {
          segments.push({
            text: backgroundLines.join(' '),
            voice: this.VOICE_CONFIG.narrator
          });
          backgroundLines = [];
        }

        segments.push({
          text: parsedLine.text,
          voice: this.assignVoice(parsedLine.speaker)
        });
      } else {
        backgroundLines.push(parsedLine.text);
      }
    }

    // Process any remaining background narration
    if (backgroundLines.length > 0) {
      segments.push({
        text: backgroundLines.join(' '),
        voice: this.VOICE_CONFIG.narrator
      });
    }

    console.log('Processed segments:', segments);
    return segments;
  }
}

/**
 * Merges multiple MP3 buffers into a single file using ffmpeg
 * @param {Array<Buffer>} buffers - Array of MP3 buffers to merge
 * @returns {Promise<Buffer>} Merged MP3 buffer
 */
async function mergeMp3Files(buffers) {
  const tmpDir = path.join(__dirname, 'tmp');
  await fs.mkdir(tmpDir, { recursive: true });

  // Write individual buffers to temporary files
  const tempFiles = [];
  for (let i = 0; i < buffers.length; i++) {
    const tempPath = path.join(tmpDir, `part${i}.mp3`);
    await fs.writeFile(tempPath, buffers[i]);
    tempFiles.push(tempPath);
  }

  // Create ffmpeg input list
  const inputListPath = path.join(tmpDir, 'inputs.txt');
  const inputListContent = tempFiles.map(f => `file '${f}'`).join('\n');
  await fs.writeFile(inputListPath, inputListContent);

  const outputPath = path.join(tmpDir, `output_${Date.now()}.mp3`);

  // Merge files using ffmpeg
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', inputListPath,
      '-c', 'copy',
      outputPath
    ]);

    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

  const mergedBuffer = await fs.readFile(outputPath);

  // Clean up temporary files
  for (const file of tempFiles) {
    await fs.unlink(file).catch(() => {});
  }
  await fs.unlink(inputListPath).catch(() => {});
  await fs.unlink(outputPath).catch(() => {});

  return mergedBuffer;
}

/**
 * API endpoint for text-to-speech conversion
 * Handles both single voice and dialogue modes
 */
app.get('/proxy', async (req, res) => {
  const text = req.query.query;
  const model = req.query.model || 'tts-1';
  const outputType = req.query.outputType || 'single';
  const voice = req.query.voice || 'alloy';

  try {
    if (outputType === 'dialogue') {
      console.log('Processing dialogue mode');
      const dialogueProcessor = new DialogueProcessor();
      const segments = dialogueProcessor.processText(text);
      const audioBuffers = [];

      // Process each segment with its assigned voice
      for (const segment of segments) {
        console.log(`Converting segment with voice: ${segment.voice}`);
        const mp3 = await openai.audio.speech.create({
          model: model,
          voice: segment.voice,
          input: segment.text,
        });
        
        const buffer = Buffer.from(await mp3.arrayBuffer());
        audioBuffers.push(buffer);
      }

      // Merge all audio segments
      const mergedBuffer = await mergeMp3Files(audioBuffers);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': mergedBuffer.length,
      });
      res.send(mergedBuffer);
      
    } else {
      // Single voice mode
      console.log('Processing single voice mode:', voice);
      const mp3 = await openai.audio.speech.create({
        model: model,
        voice: voice,
        input: text,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to quit.');
});