# Design Guidelines Not Applicable

## Project Type: Backend Discord Bot

This project is a **Discord bot application** with no frontend or web interface. It consists entirely of:

- Node.js backend service
- Discord.js integration for bot interactions
- OpenAI API integration for NPC character responses
- Command registration system

## Why Design Guidelines Don't Apply

Discord bots operate entirely within Discord's existing UI. There is no:
- Web interface to design
- Landing page to create
- User-facing frontend components
- Visual layouts to specify

## What the Bot Will Use

The bot will interact with users through Discord's native interface:
- **Text responses** in Discord channels
- **Slash commands** using Discord's built-in command UI
- **Embeds** (Discord's message cards) - these have limited customization:
  - Color (single hex color for the left border)
  - Title, description, fields
  - Thumbnail/image URLs
  - Footer text

## Discord Embed Styling Recommendations

If you want consistent branding in Discord embeds:

**Color**: Choose one brand color (hex code) for embed borders
**Structure**: Keep embeds concise - title, 2-4 fields max, optional image
**Tone**: Match the NPC character personality in message text

---

**Conclusion**: No web design guidelines are needed for this project. The visual experience is entirely controlled by Discord's platform. Focus should be on conversational design, character personality, and response formatting within Discord's constraints.