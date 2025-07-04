require("dotenv/config");

const { Client, IntentsBitField, Message } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

import { ConversationHistory } from "./type";
import { CONVERSATION_HISTORY_LIMIT, SYSTEM_PROMPT, BLOCKED_PATTERNS, COOLDOWN_DURATION, MAX_MESSAGE_LENGTH, MAX_HISTORY_AGE, USER_COOLDOWNS } from "./constant";

const containsBlockedContent = (text: string): boolean => {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(text));
};

const isValidEnvironment = (): boolean => {
  const required = ['GOOGLE_GEMINI_API_KEY', 'DISCORD_BOT_TOKEN'];
  return required.every(key => process.env[key]);
};

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ]
});

// Validate environment on startup
if (!isValidEnvironment()) {
  console.error("Missing required environment variables");
  process.exit(1);
}

client.on("ready", () => {
  console.log("Bot is online!");
});

// Read Gemini API keys from environment (comma-separated)
const geminiApiKeys = (process.env.GOOGLE_GEMINI_API_KEYS || process.env.GOOGLE_GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
if (geminiApiKeys.length === 0) {
  console.error('No Gemini API keys provided. Set GOOGLE_GEMINI_API_KEYS or GOOGLE_GEMINI_API_KEY.');
  process.exit(1);
}

// Store current key index and model
let currentGeminiKeyIndex = 0;
let genAI: any;
let model: ReturnType<typeof GoogleGenerativeAI.prototype.getGenerativeModel>;

// Function to initialize model with a given key
const initGeminiModel = (apiKey: string) => {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};

// Get the channel IDs from the environment variable
const discordChannelIds = process.env.DISCORD_SERVER_CHANNEL_ID?.split(",").map(id => id.trim()) ?? [];

client.on("messageCreate", async (message: typeof Message) => {
  if (message.author.bot) return; // Ignore bot messages
  if (!discordChannelIds.includes(message.channel.id)) return; // Ignore messages from other channels
  if (message.content.startsWith("!")) return; // Ignore messages that start with !

  if (!message.mentions.has(client.user.id)) return;

  try {
    // Rate limiting guard
    const userId = message.author.id;
    const now = Date.now();
    const userLastRequest = USER_COOLDOWNS.get(userId);

    if (userLastRequest && now - userLastRequest < COOLDOWN_DURATION) {
      const remainingTime = Math.ceil((COOLDOWN_DURATION - (now - userLastRequest)) / 1000);
      await message.reply(`⏱️ Please wait ${remainingTime} seconds before making another request.`);
      return;
    }

    USER_COOLDOWNS.set(userId, now);

    // Clean the message content by removing the mention
    let cleanContent = message.content.replace(`<@${client.user.id}>`, '').trim();

    // Input validation guards
    if (!cleanContent) {
      await message.reply("❓ Please include a message with your mention.");
      return;
    }

    if (cleanContent.length > MAX_MESSAGE_LENGTH) {
      await message.reply(`📏 Message too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }

    // Content filtering guard
    if (containsBlockedContent(cleanContent)) {
      await message.reply("🚫 I cannot respond to that type of content.");
      return;
    }

    await message.channel.sendTyping();

    // Fetch previous messages for context with error handling
    let previousMessages;
    try {
      previousMessages = await message.channel.messages.fetch({ limit: CONVERSATION_HISTORY_LIMIT });
      previousMessages = previousMessages.reverse();
    } catch (fetchError) {
      console.error("Error fetching message history:", fetchError);
      previousMessages = new Map(); // Empty collection
    }

    // Build conversation history in Gemini format
    const conversationHistory: ConversationHistory = [];

    previousMessages.forEach((msg: typeof Message) => {
      if (msg.content.startsWith("!")) return; // Skip command messages
      if (msg.author.bot && msg.author.id !== client.user.id) return; // Skip other bots

      // Age guard - skip messages older than 24 hours
      if (now - msg.createdTimestamp > MAX_HISTORY_AGE) return;

      // Content length guard for history
      if (msg.content.length > MAX_MESSAGE_LENGTH) return;

      if (msg.author.id === client.user.id) {
        // Bot's previous response
        conversationHistory.push({
          role: "model",
          parts: [{ text: msg.content }]
        });
      } else {
        // User message
        conversationHistory.push({
          role: "user",
          parts: [{ text: msg.content }]
        });
      }
    });

    // CRITICAL FIX: Ensure conversation history starts with a user message
    // Remove any leading model messages
    while (conversationHistory.length > 0 && conversationHistory[0].role === "model") {
      conversationHistory.shift();
    }

    // If conversation history is empty or doesn't start with user, create minimal history
    if (conversationHistory.length === 0 || conversationHistory[0].role !== "user") {
      conversationHistory.length = 0; // Clear the array
    }

    // Helper to try API call and switch keys on quota/invalid errors
    const apiCall = async () => {
      let attempts = 0;
      let lastError;
      while (attempts < geminiApiKeys.length) {
        try {
          const chat = model.startChat({
            history: conversationHistory,
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.7,
            },
          });
          const prompt = `
          ${SYSTEM_PROMPT}
          Respond to: ${cleanContent}
          `;
          const result = await chat.sendMessage(prompt);
          const response = await result.response;
          return response.text();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          // If quota or invalid key, try next key
          if (msg.includes('quota') || msg.includes('limit') || msg.includes('API key') || msg.includes('invalid') || msg.includes('permission')) {
            attempts++;
            currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % geminiApiKeys.length;
            console.warn(`Switching to next Gemini API key (#${currentGeminiKeyIndex + 1}) due to error: ${msg}`);
            try {
              await checkGeminiApiKey(geminiApiKeys[currentGeminiKeyIndex]);
              initGeminiModel(geminiApiKeys[currentGeminiKeyIndex]);
            } catch (checkErr) {
              // If the next key is also invalid, continue to next
              continue;
            }
          } else {
            // For other errors, throw immediately
            throw error;
          }
          lastError = error;
        }
      }
      // If all keys fail
      throw lastError || new Error('All Gemini API keys failed.');
    };

    // Attempt API call with retry
    let text;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        text = await apiCall();
        break;
      } catch (error) {
        retryCount++;
        if (retryCount > maxRetries) {
          throw error;
        }
        console.log(`API call failed, retrying... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
      }
    }

    // Response validation
    if (!text || text.trim().length === 0) {
      await message.reply("🤖 I generated an empty response. Please try rephrasing your question.");
      return;
    }

    // Discord has a 2000 character limit for messages
    if (text.length > 2000) {
      await message.channel.send(text.substring(0, 1997) + "...");
    } else {
      await message.channel.send(text);
    }

  } catch (error) {
    console.error("Error generating response:", error);

    // Specific error handling
    // Define random error messages for each condition
    const timeoutMessages = [
      "Bruh.",
    ];
    const quotaMessages = [
      "I reached my quota, you kept asking me stupid questions.",
      "I'm out of credits, you could've stopped talking to me.",
      "Bruh, good job. I'm all out",
      "Angelo Lacson, out.",
      "Bruh, you're asking me too many questions."
    ];
    const safetyMessages = [
      "I'm not answering that question.",
    ];
    const genericMessages = [
      "I'm not gonna give you a proper answer.",
      "Quit asking, you're messing me up.",
      "I'm gonna go for a cigarette, don't talk to me.",
      "Man.",
      "Shut up."
    ];
    // Helper to pick a random message
    const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    if ((error as Error).message.includes('timeout')) {
      await message.reply(pickRandom(timeoutMessages));
    } else if ((error as Error).message.includes('quota') || (error as Error).message.includes('limit')) {
      await message.reply(pickRandom(quotaMessages));
    } else if ((error as Error).message.includes('safety')) {
      await message.reply(pickRandom(safetyMessages));
    } else {
      await message.reply(pickRandom(genericMessages));
    }
  }
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Clean up cooldown map periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, lastRequest] of USER_COOLDOWNS.entries()) {
    if (now - lastRequest > COOLDOWN_DURATION * 10) { // Clean up after 10x cooldown duration
      USER_COOLDOWNS.delete(userId);
    }
  }
}, 60000); // Run every minute

// Utility to check Gemini API key validity and quota
const checkGeminiApiKey = async (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API key is not set");
  }
  const API_VERSION = "v1";
  const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini API key check failed: ${errorMsg}`);
  }
};

(async () => {
  // Check all Gemini API keys and pick the first valid one
  let foundValid = false;
  for (let i = 0; i < geminiApiKeys.length; i++) {
    try {
      await checkGeminiApiKey(geminiApiKeys[i]);
      currentGeminiKeyIndex = i;
      initGeminiModel(geminiApiKeys[i]);
      foundValid = true;
      console.log(`Gemini API key #${i + 1} is valid and will be used.`);
      break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Gemini API key #${i + 1} is invalid: ${errorMsg}`);
    }
  }
  if (!foundValid) {
    console.error('No valid Gemini API keys found. Exiting.');
    process.exit(1);
  }
})();

client.login(process.env.DISCORD_BOT_TOKEN);
