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

// Initialize Google Generative AI with error handling
let genAI, model;
try {
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
} catch (error) {
  console.error("Failed to initialize Google Generative AI:", error);
  process.exit(1);
}

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

    // API call with timeout and retry logic
    const apiCallWithTimeout = async (timeoutMs: number = 30000) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('API call timeout')), timeoutMs)
      );

      const apiCall = async () => {
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
      };

      return Promise.race([apiCall(), timeout]);
    };

    // Attempt API call with retry
    let text;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        text = await apiCallWithTimeout();
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
    if ((error as Error).message.includes('timeout')) {
      await message.reply("⏰ Request timed out. Please try again.");
    } else if ((error as Error).message.includes('quota') || (error as Error).message.includes('limit')) {
      await message.reply("📊 API quota exceeded. Please try again later.");
    } else if ((error as Error).message.includes('safety')) {
      await message.reply("🛡️ Response blocked for safety reasons.");
    } else {
      await message.reply("❌ Sorry, I encountered an error while generating a response.");
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

client.login(process.env.DISCORD_BOT_TOKEN);
