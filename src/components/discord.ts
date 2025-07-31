import { Client, IntentsBitField, Message } from "discord.js";
import { ConversationHistory } from "./type";
import {
  CONVERSATION_HISTORY_LIMIT,
  SYSTEM_PROMPT,
  COOLDOWN_DURATION,
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_AGE,
  USER_COOLDOWNS,
  containsBlockedContent,
  pickRandom
} from "./utils";
import { initializeModel, geminiKeys, checkGeminiApiKey as geminiCheckApiKey } from "./gemini";
import { config } from "../config";

let model = initializeModel(config.geminiKey);
let currentGeminiKeyIndex = 0;

const discordChannelIds = config.discordChannelId.split(",").map(id => id.trim()) ?? [];

/**
 * Initializes and starts the Discord bot.
 */
export function startDiscordBot() {
  const client = new Client({
    intents: [
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.MessageContent,
    ]
  });

  client.on("ready", () => {
    console.log("Bot is online!");
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (!discordChannelIds.includes(message.channel.id)) return;
    if (message.content.startsWith("!")) return;
    if (!client.user || !message.mentions.has(client.user.id)) return;

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
      if (!cleanContent) {
        await message.reply("❓ Please include a message with your mention.");
        return;
      }
      if (cleanContent.length > MAX_MESSAGE_LENGTH) {
        await message.reply(`📏 Message too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`);
        return;
      }
      if (containsBlockedContent(cleanContent)) {
        await message.reply("🚫 I cannot respond to that type of content.");
        return;
      }
      if ("sendTyping" in message.channel && typeof message.channel.sendTyping === "function") {
        await message.channel.sendTyping();
      }
      // Fetch previous messages for context with error handling
      let previousMessages;
      try {
        previousMessages = await message.channel.messages.fetch({ limit: CONVERSATION_HISTORY_LIMIT });
        previousMessages = previousMessages.reverse();
      } catch (fetchError) {
        console.error("Error fetching message history:", fetchError);
        previousMessages = new Map();
      }
      // Build conversation history in Gemini format
      const conversationHistory: ConversationHistory = [];
      previousMessages.forEach((msg: Message) => {
        if (msg.content.startsWith("!")) return;
        if (msg.author.bot && (!client.user || msg.author.id !== client.user.id)) return;
        if (now - msg.createdTimestamp > MAX_HISTORY_AGE) return;
        if (msg.content.length > MAX_MESSAGE_LENGTH) return;
        if (client.user && msg.author.id === client.user.id) {
          conversationHistory.push({ role: "model", parts: [{ text: msg.content }] });
        } else {
          conversationHistory.push({ role: "user", parts: [{ text: msg.content }] });
        }
      });
      // Ensure conversation history starts with a user message
      while (conversationHistory.length > 0 && conversationHistory[0].role === "model") {
        conversationHistory.shift();
      }
      if (conversationHistory.length === 0 || conversationHistory[0].role !== "user") {
        conversationHistory.length = 0;
      }
      // Helper to try API call and switch keys on quota/invalid errors
      const apiCall = async () => {
        let attempts = 0;
        let lastError;
        while (attempts < geminiKeys.length) {
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
            if (msg.includes('quota') || msg.includes('limit') || msg.includes('API key') || msg.includes('invalid') || msg.includes('permission')) {
              attempts++;
              currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % geminiKeys.length;
              console.warn(`Switching to next Gemini API key (#${currentGeminiKeyIndex + 1}) due to error: ${msg}`);
              try {
                await geminiCheckApiKey(geminiKeys[currentGeminiKeyIndex]);
                model = initializeModel(geminiKeys[currentGeminiKeyIndex]);
              } catch (checkErr) {
                continue;
              }
            } else {
              throw error;
            }
            lastError = error;
          }
        }
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
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      if (!text || text.trim().length === 0) {
        await message.reply("🤖 I generated an empty response. Please try rephrasing your question.");
        return;
      }
      if (text.length > 2000) {
        if ("send" in message.channel && typeof message.channel.send === "function") {
          await message.channel.send(text.substring(0, 1997) + "...");
        }
      } else {
        if ("send" in message.channel && typeof message.channel.send === "function") {
          await message.channel.send(text);
        }
      }
    } catch (error) {
      console.error("Error generating response:", error);
      const timeoutMessages = ["Bruh."];
      const quotaMessages = [
        "I reached my quota, you kept asking me stupid questions.",
        "I'm out of credits, you could've stopped talking to me.",
        "Bruh, good job. I'm all out",
        "Angelo Lacson, out.",
        "Bruh, you're asking me too many questions."
      ];
      const safetyMessages = ["I'm not answering that question."];
      const genericMessages = [
        "I'm not gonna give you a proper answer.",
        "Quit asking, you're messing me up.",
        "I'm gonna go for a cigarette, don't talk to me.",
        "Man.",
        "Shut up."
      ];
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
      if (now - lastRequest > COOLDOWN_DURATION * 10) {
        USER_COOLDOWNS.delete(userId);
      }
    }
  }, 60000);

  // Check all Gemini API keys and pick the first valid one
  (async () => {
    let foundValid = false;
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        await geminiCheckApiKey(geminiKeys[i]);
        currentGeminiKeyIndex = i;
        model = initializeModel(geminiKeys[i]);
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

  client.login(config.discordToken);
}
