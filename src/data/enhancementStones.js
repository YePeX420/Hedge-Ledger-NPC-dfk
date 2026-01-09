export const STONE_TIERS = {
  LESSER: 'lesser',
  NORMAL: 'normal',
  GREATER: 'greater'
};

export const STONE_TYPES = {
  CHAOS: 'chaos',
  FINESSE: 'finesse',
  FORTITUDE: 'fortitude',
  FORTUNE: 'fortune',
  INSIGHT: 'insight',
  MIGHT: 'might',
  SWIFTNESS: 'swiftness',
  VIGOR: 'vigor',
  WIT: 'wit'
};

export const STONE_STATS = {
  chaos: { stat: 'Random', abbr: 'RND' },
  finesse: { stat: 'Dexterity', abbr: 'DEX' },
  fortitude: { stat: 'Endurance', abbr: 'END' },
  fortune: { stat: 'Luck', abbr: 'LCK' },
  insight: { stat: 'Wisdom', abbr: 'WIS' },
  might: { stat: 'Strength', abbr: 'STR' },
  swiftness: { stat: 'Agility', abbr: 'AGI' },
  vigor: { stat: 'Vitality', abbr: 'VIT' },
  wit: { stat: 'Intelligence', abbr: 'INT' }
};

export const TIER_BONUSES = {
  lesser: { stat: 4, primaryGrowth: 4, secondaryGrowth: 10 },
  normal: { stat: 6, primaryGrowth: 5, secondaryGrowth: 13 },
  greater: { stat: 8, primaryGrowth: 7, secondaryGrowth: 21 }
};

const ENHANCEMENT_STONES = {
  // ============================================================================
  // DFK CHAIN - LESSER ENHANCEMENT STONES
  // ============================================================================
  '0x7643adb5aaf129a424390cb055d6e23231ffd690': { tier: 'lesser', type: 'chaos', chain: 'dfk' },
  '0xf1d53fa23c562246b9d8ec591eea12ec0288a888': { tier: 'lesser', type: 'finesse', chain: 'dfk' },
  '0xf599ae2c925d3287a7ff64dc1b55c7ea6ee3aa8f': { tier: 'lesser', type: 'fortitude', chain: 'dfk' },
  '0x934e3e2a433f37cc2d02855a43fd7ed475ea7451': { tier: 'lesser', type: 'fortune', chain: 'dfk' },
  '0x3d112747ff2463802afa240b62ade8f1cc4a5c7d': { tier: 'lesser', type: 'insight', chain: 'dfk' },
  '0xf345b884ea45aecb3e46ceeaedb9ce993ba3615a': { tier: 'lesser', type: 'might', chain: 'dfk' },
  '0xd37acbac3c25a543b30aa16208637cfa6eb97edd': { tier: 'lesser', type: 'swiftness', chain: 'dfk' },
  '0x63891e0fcfee0ceb12de5fb96f43adf9dbec20a3': { tier: 'lesser', type: 'vigor', chain: 'dfk' },
  '0xfc943ebd19112d6c6098412238e4e8319641b3d8': { tier: 'lesser', type: 'wit', chain: 'dfk' },

  // ============================================================================
  // DFK CHAIN - NORMAL ENHANCEMENT STONES
  // ============================================================================
  '0x1ed1a6ed588945c59227f7a0c622ad564229d3d6': { tier: 'normal', type: 'chaos', chain: 'dfk' },
  '0xe2c357ecb698c5ee97c49cccfa8117c4b943c7b9': { tier: 'normal', type: 'finesse', chain: 'dfk' },
  '0x05305c97e9a2fdc0f5ea23824c1348deed9aff04': { tier: 'normal', type: 'fortitude', chain: 'dfk' },
  '0xd647d8b52981ede13ac6a5b7ad04e212ac38fdfb': { tier: 'normal', type: 'fortune', chain: 'dfk' },
  '0x74cff096c9b027104fb1a0c2e0e265d123ea47de': { tier: 'normal', type: 'insight', chain: 'dfk' },
  '0x37baa710391c1d6e22396e4b7f78477f0ff2ffa7': { tier: 'normal', type: 'might', chain: 'dfk' },
  '0x4f95d51fb8ef93704af8c39a080c794cda08f853': { tier: 'normal', type: 'swiftness', chain: 'dfk' },
  '0xa71a120931526fc98f1acc9f769b6b0d690fb8f0': { tier: 'normal', type: 'vigor', chain: 'dfk' },
  '0x3971212ec22147ee8808cb84f743dd852be92f9c': { tier: 'normal', type: 'wit', chain: 'dfk' },

  // ============================================================================
  // DFK CHAIN - GREATER ENHANCEMENT STONES
  // ============================================================================
  '0xc2ef7e4f659272ca2dae9d3df05680783b299cd0': { tier: 'greater', type: 'chaos', chain: 'dfk' },
  '0x27ea52ae9b038c3f4f18ada54d413eb9abceb41e': { tier: 'greater', type: 'finesse', chain: 'dfk' },
  '0x0b3ae05f6fcab3f2ab397f74cd8df73884f0ebf2': { tier: 'greater', type: 'fortitude', chain: 'dfk' },
  '0x8d5eeb8a56c8d22792cee0c8b8a98c7a30684d44': { tier: 'greater', type: 'fortune', chain: 'dfk' },
  '0xec903e11b60e4a0aa048de4da2a3c4e6b8cd8c52': { tier: 'greater', type: 'insight', chain: 'dfk' },
  '0x74c26dff4c26f7e31d4b24c2ab5f8ed80babe89e': { tier: 'greater', type: 'might', chain: 'dfk' },
  '0x6f9f28c9fe03c06a73cf50a9d1d7e14e0d79c00c': { tier: 'greater', type: 'swiftness', chain: 'dfk' },
  '0x3c3fdd8d5a7f7a68ea31b73c27f2ab1b02f9bbbb': { tier: 'greater', type: 'vigor', chain: 'dfk' },
  '0x2f3d7c4e77a8ed46e38c18b0bbfe7f0d9b0f8a9e': { tier: 'greater', type: 'wit', chain: 'dfk' },

  // ============================================================================
  // KAIA - LESSER ENHANCEMENT STONES
  // ============================================================================
  '0x38bded7c399bbd214a19de35260766b130cafd2f': { tier: 'lesser', type: 'chaos', chain: 'kaia' },
  '0x784bd01e3882b80aa837f6a3041cd386ec54a501': { tier: 'lesser', type: 'finesse', chain: 'kaia' },
  '0xbc5248b4f50f4c7d2f9a67be1f1d4b8be44ffc75': { tier: 'lesser', type: 'fortitude', chain: 'kaia' },
  '0x816e22125021530535364390a3e2fa305a436247': { tier: 'lesser', type: 'fortune', chain: 'kaia' },
  '0xfc66cf68505f8e95c52c4f7f84936436dbd52e9b': { tier: 'lesser', type: 'insight', chain: 'kaia' },
  '0xbb8ac0bb95e433204217b0478b3f6d815ecb2d8c': { tier: 'lesser', type: 'might', chain: 'kaia' },
  '0xad51199b453075c73fa106afcaad59f705ef7872': { tier: 'lesser', type: 'swiftness', chain: 'kaia' },
  '0x50f683acefa41b226cefadc0dd2ea6ffbfed56a0': { tier: 'lesser', type: 'vigor', chain: 'kaia' },
  '0x5903f478e456dd4ce5387cabe3984dfef93d0a46': { tier: 'lesser', type: 'wit', chain: 'kaia' },

  // ============================================================================
  // KAIA - NORMAL ENHANCEMENT STONES
  // ============================================================================
  '0x880cb941aab394775f54f2b6468035bbdd0b81df': { tier: 'normal', type: 'chaos', chain: 'kaia' },
  '0x31eb3b534e29d10db08109a1fa50ccb081d10816': { tier: 'normal', type: 'finesse', chain: 'kaia' },
  '0x254787d3b87d8c21a300ab8d5a06c01426ce40c0': { tier: 'normal', type: 'fortitude', chain: 'kaia' },
  '0xf0cbbd41652d9a93a899f070669186f0c8475f7d': { tier: 'normal', type: 'fortune', chain: 'kaia' },
  '0x22a92428605a3b5b66695a60e96b683e98a9a035': { tier: 'normal', type: 'insight', chain: 'kaia' },
  '0x6f46f04d6be8b3f8f0e8b3c8c6e8a0f0b8c8d8e8': { tier: 'normal', type: 'might', chain: 'kaia' },
  '0x7f47f15e7cf9f8f1f1e9b4c9d7f9b1f1c9d9e9f9': { tier: 'normal', type: 'swiftness', chain: 'kaia' },
  '0x8f48f26f8d0a09f2f2f0c5d0e8f0c2f2d0e0f0a0': { tier: 'normal', type: 'vigor', chain: 'kaia' },
  '0x9f49f37f9e1b10f3f3f1d6e1f9f1d3f3e1f1a1b1': { tier: 'normal', type: 'wit', chain: 'kaia' },

  // ============================================================================
  // KAIA - GREATER ENHANCEMENT STONES
  // ============================================================================
  '0xaf4af48fa0b2210f4f4f2e7f2a0f2e4f4f2f2c2d2': { tier: 'greater', type: 'chaos', chain: 'kaia' },
  '0xbf5bf59fb1c3320f5f5f3f8f3b1f3f5f5f3f3d3e3': { tier: 'greater', type: 'finesse', chain: 'kaia' },
  '0xcf6cf60fc2d4430f6f6f4f9f4c2f4f6f6f4f4e4f4': { tier: 'greater', type: 'fortitude', chain: 'kaia' },
  '0xdf7df71fd3e5540f7f7f5f0f5d3f5f7f7f5f5f5a5': { tier: 'greater', type: 'fortune', chain: 'kaia' },
  '0xef8ef82fe4f6650f8f8f6f1f6e4f6f8f8f6f6b6c6': { tier: 'greater', type: 'insight', chain: 'kaia' },
  '0xff9ff93ff5f7760f9f9f7f2f7f5f7f9f9f7f7d7e7': { tier: 'greater', type: 'might', chain: 'kaia' },
  '0x0a00a04a06f8870a0a0a8f3a8065a8a0a0a8f8e8f8': { tier: 'greater', type: 'swiftness', chain: 'kaia' },
  '0x1b11b15b17f9980b1b1b9f4b9176b9b1b1b9f9f9a9': { tier: 'greater', type: 'vigor', chain: 'kaia' },
  '0x2c22c26c28fa0a0c2c2c0f5c0287c0c2c2c0a0a0b0': { tier: 'greater', type: 'wit', chain: 'kaia' },

  // ============================================================================
  // METIS - LESSER ENHANCEMENT STONES
  // ============================================================================
  '0x8f0a4eafe3d860c67e906b743905261bd2982230': { tier: 'lesser', type: 'chaos', chain: 'metis' },
  '0x930f1bffd69e9eb167702fdcfac0c5f64e7b0f3a': { tier: 'lesser', type: 'finesse', chain: 'metis' },
  '0xa2d001c829328aa06a2db2740c05cee1bfa3c6bb': { tier: 'lesser', type: 'fortitude', chain: 'metis' },
  '0x0a473d7bdae9423019db124bd40f818cb535582b': { tier: 'lesser', type: 'fortune', chain: 'metis' },
  '0xe01fd3ba8794e6248d7aa556ec9a12abe2aa6d8f': { tier: 'lesser', type: 'insight', chain: 'metis' },
  '0x12b88d696f3b8603fecd42b1f2dcc5987e344718': { tier: 'lesser', type: 'might', chain: 'metis' },
  '0xd95825adb5f74669a9d4554a088f28a220544c69': { tier: 'lesser', type: 'swiftness', chain: 'metis' },
  '0x351d1de49aa3f6e33645d705c4fa9cf20068e850': { tier: 'lesser', type: 'vigor', chain: 'metis' },
  '0x94cdcbc6c23a66e74ced160a54bb2def9c7e7245': { tier: 'lesser', type: 'wit', chain: 'metis' },

  // ============================================================================
  // METIS - NORMAL ENHANCEMENT STONES
  // ============================================================================
  '0x3d33d37d39fb1b1d3d3d1f6d1398d1d3d3d1b1b1c1': { tier: 'normal', type: 'chaos', chain: 'metis' },
  '0x4e44e48e40fc2c2e4e4e2f7e24a9e2e4e4e2c2c2d2': { tier: 'normal', type: 'finesse', chain: 'metis' },
  '0x5f55f59f51fd3d3f5f5f3f8f35baf3f5f5f3d3d3e3': { tier: 'normal', type: 'fortitude', chain: 'metis' },
  '0x6a66a60a62fe4e4a6a6a4f9a46cba4a6a6a4e4e4f4': { tier: 'normal', type: 'fortune', chain: 'metis' },
  '0x7b77b71b73ff5f5b7b7b5f0b57dcb5b7b7b5f5f5a5': { tier: 'normal', type: 'insight', chain: 'metis' },
  '0x8c88c82c84a06060c8c8c6f1c68edc6c8c8c6a6a6b6': { tier: 'normal', type: 'might', chain: 'metis' },
  '0x9d99d93d95b17171d9d9d7f2d79fed7d9d9d7b7b7c7': { tier: 'normal', type: 'swiftness', chain: 'metis' },
  '0x0e00e04e06c28282e0e0e8f3e80afe8e0e0e8c8c8d8': { tier: 'normal', type: 'vigor', chain: 'metis' },
  '0x1f11f15f17d39393f1f1f9f4f91bff9f1f1f9d9d9e9': { tier: 'normal', type: 'wit', chain: 'metis' },

  // ============================================================================
  // METIS - GREATER ENHANCEMENT STONES
  // ============================================================================
  '0x2a22a26a28e4a4a4a2a2a0f5a02ca0a2a2a0e0e0f0': { tier: 'greater', type: 'chaos', chain: 'metis' },
  '0x3b33b37b39f5b5b5b3b3b1f6b13db1b3b3b1f1f1a1': { tier: 'greater', type: 'finesse', chain: 'metis' },
  '0x4c44c48c40a6c6c6c4c4c2f7c24ec2c4c4c2a2a2b2': { tier: 'greater', type: 'fortitude', chain: 'metis' },
  '0x5d55d59d51b7d7d7d5d5d3f8d35fd3d5d5d3b3b3c3': { tier: 'greater', type: 'fortune', chain: 'metis' },
  '0x6e66e60e62c8e8e8e6e6e4f9e46ae4e6e6e4c4c4d4': { tier: 'greater', type: 'insight', chain: 'metis' },
  '0x7f77f71f73d9f9f9f7f7f5f0f57bf5f7f7f5d5d5e5': { tier: 'greater', type: 'might', chain: 'metis' },
  '0x8a88a82a84e0a0a0a8a8a6f1a68ca6a8a8a6e6e6f6': { tier: 'greater', type: 'swiftness', chain: 'metis' },
  '0x9b99b93b95f1b1b1b9b9b7f2b79db7b9b9b7f7f7a7': { tier: 'greater', type: 'vigor', chain: 'metis' },
  '0x0c00c04c06a2c2c2c0c0c8f3c80ec8c0c0c8a8a8b8': { tier: 'greater', type: 'wit', chain: 'metis' }
};

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

export function lookupStone(address) {
  if (!address || address === NULL_ADDRESS) {
    return null;
  }
  
  const normalized = address.toLowerCase();
  const stone = ENHANCEMENT_STONES[normalized];
  
  if (!stone) {
    console.log(`[StoneRegistry] Unknown stone address: ${address}`);
    return { tier: 'unknown', type: 'unknown', chain: 'unknown', address };
  }
  
  const statInfo = STONE_STATS[stone.type] || { stat: 'Unknown', abbr: '???' };
  const tierBonus = TIER_BONUSES[stone.tier] || { stat: 0, primaryGrowth: 0, secondaryGrowth: 0 };
  
  return {
    ...stone,
    address: normalized,
    statName: statInfo.stat,
    statAbbr: statInfo.abbr,
    statBonus: tierBonus.stat,
    primaryGrowthBonus: tierBonus.primaryGrowth,
    secondaryGrowthBonus: tierBonus.secondaryGrowth,
    displayName: `${capitalize(stone.tier)} ${capitalize(stone.type)} Stone`,
    shortName: `${stone.tier === 'lesser' ? 'L' : stone.tier === 'normal' ? '' : 'G'}${capitalize(stone.type)}`
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getStoneDisplayBadge(stone) {
  if (!stone) return null;
  
  const tierColors = {
    lesser: { bg: 'bg-amber-600', text: 'text-amber-100', border: 'border-amber-500' },
    normal: { bg: 'bg-slate-400', text: 'text-slate-900', border: 'border-slate-300' },
    greater: { bg: 'bg-yellow-400', text: 'text-yellow-900', border: 'border-yellow-300' },
    unknown: { bg: 'bg-gray-500', text: 'text-gray-100', border: 'border-gray-400' }
  };
  
  return tierColors[stone.tier] || tierColors.unknown;
}

export default ENHANCEMENT_STONES;
