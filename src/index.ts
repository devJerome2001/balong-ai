require("dotenv/config");

const { Client, IntentsBitField, Message } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

import { ConversationHistory } from "./type";
import { CONVERSATION_HISTORY_LIMIT, SYSTEM_PROMPT } from "./constant";

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

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

// Get the model
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Get the channel IDs from the environment variable
const discordChannelIds = process.env.DISCORD_SERVER_CHANNEL_ID?.split(",").map(id => id.trim()) ?? [];

client.on("messageCreate", async (message: typeof Message) => {
  if (message.author.bot) return; // Ignore bot messages
  if (!discordChannelIds.includes(message.channel.id)) return; // Ignore messages from other channels
  if (message.content.startsWith("!")) return; // Ignore messages that start with !

  if (!message.mentions.has(client.user.id)) return;

  try {
    await message.channel.sendTyping();

    // Fetch previous messages for context
    let previousMessages = await message.channel.messages.fetch({ limit: CONVERSATION_HISTORY_LIMIT });
    previousMessages = previousMessages.reverse();

    // Build conversation history in Gemini format
    const conversationHistory: ConversationHistory = [];

    previousMessages.forEach((msg: typeof Message) => {
      if (msg.content.startsWith("!")) return; // Skip command messages
      if (msg.author.bot && msg.author.id !== client.user.id) return; // Skip other bots

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

    // Start chat with history
    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    // Clean the message content by removing the mention
    let cleanContent = message.content.replace(`<@${client.user.id}>`, '').trim();

    // Send the current message with system prompt
    const prompt = `
    ${SYSTEM_PROMPT}
    Respond to: ${cleanContent}
    `;
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    // Discord has a 2000 character limit for messages
    if (text.length > 2000) {
      await message.channel.send(text.substring(0, 1997) + "...");
    } else {
      await message.channel.send(text);
    }

  } catch (error) {
    console.error("Error generating response:", error);
    await message.channel.send("Sorry, I encountered an error while generating a response.");
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
