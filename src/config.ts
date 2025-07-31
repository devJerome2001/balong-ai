require("dotenv/config");

/**
 * Config object for the environment variables
 */
export const config = {
  geminiKey: process.env.GOOGLE_GEMINI_API_KEY || "",
  discordToken: process.env.DISCORD_BOT_TOKEN || "",
  discordChannelId: process.env.DISCORD_CHANNEL_ID || "",
}
