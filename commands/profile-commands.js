// commands/profile-commands.js
// Debug and admin commands for the Player User Model system

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { 
  getOrCreateProfileByDiscordId, 
  getQuickProfileSummary,
  forceReclassify,
  setTierOverride,
  listProfiles
} from '../player-profile-service.js';
import { ARCHETYPES, TIERS, STATES, BEHAVIOR_TAGS } from '../classification-config.js';

// ============================================================================
// COMMAND DEFINITIONS
// ============================================================================

/**
 * /hedge-profile - View your own or another user's profile
 */
export const profileCommand = {
  data: new SlashCommandBuilder()
    .setName('hedge-profile')
    .setDescription('View player classification profile')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to view (admin only, defaults to yourself)')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const isAdmin = await checkAdminPermission(interaction);
    
    // Non-admins can only view their own profile
    if (targetUser.id !== interaction.user.id && !isAdmin) {
      return interaction.reply({
        content: 'You can only view your own profile.',
        ephemeral: true
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const profile = await getOrCreateProfileByDiscordId(targetUser.id, targetUser.username);
      const embed = createProfileEmbed(profile, targetUser);
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ProfileCommand] Error:', error);
      await interaction.editReply({
        content: 'Failed to load profile. Please try again.',
      });
    }
  }
};

/**
 * /hedge-reclassify - Force reclassification of a user
 */
export const reclassifyCommand = {
  data: new SlashCommandBuilder()
    .setName('hedge-reclassify')
    .setDescription('Force reclassification of a player (admin only)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to reclassify')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    const isAdmin = await checkAdminPermission(interaction);
    if (!isAdmin) {
      return interaction.reply({
        content: 'This command requires admin permissions.',
        ephemeral: true
      });
    }
    
    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const beforeProfile = await getOrCreateProfileByDiscordId(targetUser.id, targetUser.username);
      const afterProfile = await forceReclassify(targetUser.id);
      
      const changes = [];
      if (beforeProfile.archetype !== afterProfile.archetype) {
        changes.push(`Archetype: ${beforeProfile.archetype} → ${afterProfile.archetype}`);
      }
      if (beforeProfile.tier !== afterProfile.tier) {
        changes.push(`Tier: ${beforeProfile.tier} → ${afterProfile.tier}`);
      }
      if (beforeProfile.state !== afterProfile.state) {
        changes.push(`State: ${beforeProfile.state} → ${afterProfile.state}`);
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`Reclassified: ${targetUser.username}`)
        .setColor(0x00FF00)
        .setDescription(changes.length > 0 ? changes.join('\n') : 'No changes detected')
        .addFields(
          { name: 'Current Archetype', value: afterProfile.archetype, inline: true },
          { name: 'Current Tier', value: getTierDisplay(afterProfile.tier), inline: true },
          { name: 'Current State', value: afterProfile.state, inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ReclassifyCommand] Error:', error);
      await interaction.editReply({
        content: 'Failed to reclassify. Please try again.',
      });
    }
  }
};

/**
 * /hedge-set-tier - Manually set a user's tier
 */
export const setTierCommand = {
  data: new SlashCommandBuilder()
    .setName('hedge-set-tier')
    .setDescription('Manually set a player\'s access tier (admin only)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to modify')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('tier')
        .setDescription('New tier level (0-4)')
        .setRequired(true)
        .addChoices(
          { name: 'Tier 0 - Guest', value: 0 },
          { name: 'Tier 1 - Bronze', value: 1 },
          { name: 'Tier 2 - Silver', value: 2 },
          { name: 'Tier 3 - Gold', value: 3 },
          { name: 'Tier 4 - Council of Hedge', value: 4 }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    const isAdmin = await checkAdminPermission(interaction);
    if (!isAdmin) {
      return interaction.reply({
        content: 'This command requires admin permissions.',
        ephemeral: true
      });
    }
    
    const targetUser = interaction.options.getUser('user');
    const newTier = interaction.options.getInteger('tier');
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const updatedProfile = await setTierOverride(targetUser.id, newTier);
      
      const embed = new EmbedBuilder()
        .setTitle(`Tier Updated: ${targetUser.username}`)
        .setColor(getTierColor(newTier))
        .addFields(
          { name: 'New Tier', value: getTierDisplay(newTier), inline: true },
          { name: 'Override Active', value: 'Yes (manual)', inline: true }
        )
        .setFooter({ text: 'This tier override persists until manually changed' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[SetTierCommand] Error:', error);
      await interaction.editReply({
        content: 'Failed to update tier. Please try again.',
      });
    }
  }
};

/**
 * /hedge-profiles-list - List profiles with filters (admin only)
 */
export const listProfilesCommand = {
  data: new SlashCommandBuilder()
    .setName('hedge-profiles-list')
    .setDescription('List player profiles with filters (admin only)')
    .addStringOption(option =>
      option
        .setName('archetype')
        .setDescription('Filter by archetype')
        .setRequired(false)
        .addChoices(
          { name: 'Guest', value: 'GUEST' },
          { name: 'Adventurer', value: 'ADVENTURER' },
          { name: 'Player', value: 'PLAYER' },
          { name: 'Investor', value: 'INVESTOR' },
          { name: 'Extractor', value: 'EXTRACTOR' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('tier')
        .setDescription('Filter by tier')
        .setRequired(false)
        .addChoices(
          { name: 'Tier 0 - Guest', value: 0 },
          { name: 'Tier 1 - Bronze', value: 1 },
          { name: 'Tier 2 - Silver', value: 2 },
          { name: 'Tier 3 - Gold', value: 3 },
          { name: 'Tier 4 - Council', value: 4 }
        )
    )
    .addBooleanOption(option =>
      option
        .setName('whales')
        .setDescription('Show only whales')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Number of results (default 10)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    const isAdmin = await checkAdminPermission(interaction);
    if (!isAdmin) {
      return interaction.reply({
        content: 'This command requires admin permissions.',
        ephemeral: true
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const filter = {
        archetype: interaction.options.getString('archetype'),
        tier: interaction.options.getInteger('tier'),
        isWhale: interaction.options.getBoolean('whales'),
        limit: interaction.options.getInteger('limit') || 10
      };
      
      // Remove null/undefined values
      Object.keys(filter).forEach(key => {
        if (filter[key] === null || filter[key] === undefined) {
          delete filter[key];
        }
      });
      
      const profiles = await listProfiles(filter);
      
      if (profiles.length === 0) {
        return interaction.editReply({
          content: 'No profiles found matching your criteria.',
        });
      }
      
      const embed = new EmbedBuilder()
        .setTitle('Player Profiles')
        .setColor(0x5865F2)
        .setDescription(`Showing ${profiles.length} profiles`)
        .setTimestamp();
      
      // Add up to 10 profiles as fields
      for (const profile of profiles.slice(0, 10)) {
        const flags = [];
        if (profile.flags?.isWhale) flags.push('Whale');
        if (profile.flags?.isExtractor) flags.push('Extractor');
        if (profile.flags?.isHighPotential) flags.push('High Potential');
        
        embed.addFields({
          name: profile.discordUsername || `ID: ${profile.discordId}`,
          value: [
            `**Archetype:** ${profile.archetype}`,
            `**Tier:** ${getTierDisplay(profile.tier)}`,
            `**State:** ${profile.state}`,
            `**Tags:** ${(profile.behaviorTags || []).slice(0, 3).join(', ') || 'None'}`,
            flags.length > 0 ? `**Flags:** ${flags.join(', ')}` : ''
          ].filter(Boolean).join('\n'),
          inline: true
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ListProfilesCommand] Error:', error);
      await interaction.editReply({
        content: 'Failed to list profiles. Please try again.',
      });
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has admin permissions
 */
async function checkAdminPermission(interaction) {
  // Bot owner always has admin
  const botOwnerId = process.env.BOT_OWNER_ID;
  if (botOwnerId && interaction.user.id === botOwnerId) {
    return true;
  }
  
  // Check guild admin permissions
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  
  return false;
}

/**
 * Create a rich embed for profile display
 */
function createProfileEmbed(profile, user) {
  const tierColor = getTierColor(profile.tier);
  
  const embed = new EmbedBuilder()
    .setTitle(`Player Profile: ${user.username}`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setColor(tierColor)
    .setTimestamp();
  
  // Main classification
  embed.addFields(
    { name: 'Archetype', value: getArchetypeEmoji(profile.archetype) + ' ' + profile.archetype, inline: true },
    { name: 'Tier', value: getTierDisplay(profile.tier), inline: true },
    { name: 'State', value: getStateEmoji(profile.state) + ' ' + profile.state, inline: true }
  );
  
  // Behavior tags
  const tags = profile.behaviorTags || [];
  if (tags.length > 0) {
    embed.addFields({
      name: 'Behavior Tags',
      value: tags.map(t => `\`${t}\``).join(' '),
      inline: false
    });
  }
  
  // KPIs
  const kpis = profile.kpis || {};
  embed.addFields(
    { name: 'Engagement Score', value: String(kpis.engagementScore || 0), inline: true },
    { name: 'Financial Score', value: String(kpis.financialScore || 0), inline: true },
    { name: 'Retention Score', value: String(kpis.retentionScore || 0), inline: true }
  );
  
  // Flags
  const flags = profile.flags || {};
  const activeFlags = [];
  if (flags.isWhale) activeFlags.push('Whale');
  if (flags.isExtractor) activeFlags.push('Extractor');
  if (flags.isHighPotential) activeFlags.push('High Potential');
  
  if (activeFlags.length > 0) {
    embed.addFields({
      name: 'Flags',
      value: activeFlags.join(', '),
      inline: false
    });
  }
  
  // Wallet info
  if (profile.walletAddress) {
    embed.addFields({
      name: 'Primary Wallet',
      value: `\`${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}\``,
      inline: true
    });
  }
  
  // DFK Snapshot if available
  const snapshot = profile.dfkSnapshot;
  if (snapshot) {
    embed.addFields(
      { name: 'Heroes', value: String(snapshot.heroCount || 0), inline: true },
      { name: 'LP Positions', value: String(snapshot.lpPositionsCount || 0), inline: true },
      { name: 'JEWEL Balance', value: String(Math.round(snapshot.jewelBalance || 0)), inline: true }
    );
  }
  
  // Activity info
  if (profile.lastSeenAt) {
    embed.setFooter({ 
      text: `Last seen: ${new Date(profile.lastSeenAt).toLocaleDateString()}` 
    });
  }
  
  return embed;
}

/**
 * Get tier display string with emoji
 */
function getTierDisplay(tier) {
  const displays = {
    0: 'Tier 0 - Guest',
    1: 'Tier 1 - Bronze',
    2: 'Tier 2 - Silver',
    3: 'Tier 3 - Gold',
    4: 'Tier 4 - Council of Hedge'
  };
  return displays[tier] || `Tier ${tier}`;
}

/**
 * Get color for tier
 */
function getTierColor(tier) {
  const colors = {
    0: 0x808080, // Gray
    1: 0xCD7F32, // Bronze
    2: 0xC0C0C0, // Silver
    3: 0xFFD700, // Gold
    4: 0x9932CC  // Purple (Council)
  };
  return colors[tier] || 0x5865F2;
}

/**
 * Get archetype emoji
 */
function getArchetypeEmoji(archetype) {
  const emojis = {
    GUEST: '',
    ADVENTURER: '',
    PLAYER: '',
    INVESTOR: '',
    EXTRACTOR: ''
  };
  return emojis[archetype] || '';
}

/**
 * Get state emoji
 */
function getStateEmoji(state) {
  const emojis = {
    CURIOUS: '',
    OPTIMIZING: '',
    EXPANDING: '',
    COMMITTED: '',
    EXTRACTING: ''
  };
  return emojis[state] || '';
}

// Export all commands
export const profileCommands = [
  profileCommand,
  reclassifyCommand,
  setTierCommand,
  listProfilesCommand
];

export default profileCommands;
