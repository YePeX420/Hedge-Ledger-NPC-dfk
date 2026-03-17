const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';

const HERO_FIELDS = `
  id
  normalizedId
  mainClassStr
  subClassStr
  professionStr
  rarity
  level
  generation
  strength
  dexterity
  agility
  intelligence
  wisdom
  vitality
  endurance
  luck
  hp
  mp
  stamina
  currentQuest
  active1
  active2
  passive1
  passive2
  owner { id name }
`;

const QUEST_HERO_FIELDS = `
  id
  normalizedId
  mainClassStr
  subClassStr
  rarity
  level
  generation
  strength
  dexterity
  agility
  intelligence
  wisdom
  vitality
  endurance
  luck
  hp
  mp
  active1
  active2
  passive1
  passive2
  currentQuest
  owner { id name }
`;

const MAIN_CLASS_CODES: Record<number, string> = {
  0: 'Warrior', 1: 'Knight', 2: 'Thief', 3: 'Archer', 4: 'Priest',
  5: 'Wizard', 6: 'Monk', 7: 'Pirate', 8: 'Berserker', 9: 'Seer',
  10: 'Legionnaire', 11: 'Scholar', 16: 'Paladin', 17: 'DarkKnight',
  18: 'Summoner', 19: 'Ninja', 20: 'Shapeshifter', 21: 'Bard',
  24: 'Dragoon', 25: 'Sage', 26: 'Spellbow', 28: 'DreadKnight',
};

export interface DFKHeroProfile {
  heroId: string;
  normalizedId: string;
  mainClass: string;
  subClass: string;
  level: number;
  rarity: number;
  generation: number;
  stats: {
    str: number;
    dex: number;
    agi: number;
    int: number;
    wis: number;
    vit: number;
    end: number;
    lck: number;
  };
  hp: number;
  mp: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
  currentQuest: string | null;
  owner: string | null;
}

function resolveMainClass(raw: any): string {
  if (raw.mainClassStr && raw.mainClassStr !== '0') return raw.mainClassStr;
  const code = Number(raw.mainClass ?? raw.mainClassCode ?? NaN);
  return MAIN_CLASS_CODES[code] || raw.mainClassStr || '';
}

function mapHeroResponse(raw: any): DFKHeroProfile | null {
  if (!raw) return null;
  const maxHp = Number(raw.hp) || 0;
  const maxMp = Number(raw.mp) || 0;
  return {
    heroId: String(raw.id || raw.normalizedId || ''),
    normalizedId: String(raw.normalizedId || raw.id || ''),
    mainClass: resolveMainClass(raw),
    subClass: raw.subClassStr || '',
    level: Number(raw.level) || 1,
    rarity: Number(raw.rarity) || 0,
    generation: Number(raw.generation) || 0,
    stats: {
      str: Number(raw.strength) || 0,
      dex: Number(raw.dexterity) || 0,
      agi: Number(raw.agility) || 0,
      int: Number(raw.intelligence) || 0,
      wis: Number(raw.wisdom) || 0,
      vit: Number(raw.vitality) || 0,
      end: Number(raw.endurance) || 0,
      lck: Number(raw.luck) || 0,
    },
    hp: maxHp,
    mp: maxMp,
    currentHp: maxHp,
    maxHp,
    currentMp: maxMp,
    maxMp,
    active1: raw.active1 || null,
    active2: raw.active2 || null,
    passive1: raw.passive1 || null,
    passive2: raw.passive2 || null,
    currentQuest: raw.currentQuest || null,
    owner: raw.owner?.id || null,
  };
}

async function gqlRequest(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(DFK_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`DFK GraphQL request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`DFK GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

export async function fetchHeroesByIds(heroIds: string[]): Promise<DFKHeroProfile[]> {
  if (!heroIds.length) return [];

  const query = `
    query GetHeroes($ids: [ID!]!) {
      heroes(where: { id_in: $ids }) {
        ${HERO_FIELDS}
      }
    }
  `;

  const data = await gqlRequest(query, { ids: heroIds });
  const heroes = data?.heroes || [];
  return heroes.map(mapHeroResponse).filter((h: DFKHeroProfile | null): h is DFKHeroProfile => h !== null);
}

export async function fetchHeroById(heroId: string): Promise<DFKHeroProfile | null> {
  const query = `
    query GetHero($heroId: ID!) {
      hero(id: $heroId) {
        ${HERO_FIELDS}
      }
    }
  `;

  const data = await gqlRequest(query, { heroId });
  return mapHeroResponse(data?.hero);
}

export async function fetchHeroesByOwner(ownerAddress: string, limit = 50): Promise<DFKHeroProfile[]> {
  const query = `
    query GetHeroesByOwner($owner: String!, $first: Int!) {
      heroes(where: { owner: $owner }, first: $first) {
        ${HERO_FIELDS}
      }
    }
  `;

  const data = await gqlRequest(query, { owner: ownerAddress.toLowerCase(), first: limit });
  const heroes = data?.heroes || [];
  return heroes.map(mapHeroResponse).filter((h: DFKHeroProfile | null): h is DFKHeroProfile => h !== null);
}

export async function fetchQuestingHeroesByOwner(ownerAddress: string): Promise<DFKHeroProfile[]> {
  const owner = ownerAddress.toLowerCase();
  const query = `
    query GetActiveQuestHeroes($owner: String!) {
      quests(where: { heroes_: { owner: $owner }, isActive: true }, first: 20) {
        id
        heroes {
          ${QUEST_HERO_FIELDS}
        }
      }
    }
  `;

  try {
    const data = await gqlRequest(query, { owner });
    const quests: any[] = data?.quests || [];
    const heroMap = new Map<string, DFKHeroProfile>();
    for (const quest of quests) {
      for (const raw of quest.heroes || []) {
        const profile = mapHeroResponse(raw);
        if (profile && !heroMap.has(profile.heroId)) {
          heroMap.set(profile.heroId, profile);
        }
      }
    }
    if (heroMap.size > 0) return Array.from(heroMap.values());
  } catch (_) {}

  const allHeroes = await fetchHeroesByOwner(owner, 100);
  return allHeroes.filter(
    h => h.currentQuest && h.currentQuest !== '0x0000000000000000000000000000000000000000',
  );
}

export async function fetchHeroesForQuest(questId: string): Promise<DFKHeroProfile[]> {
  const query = `
    query GetQuestHeroes($questId: ID!) {
      quest(id: $questId) {
        id
        isActive
        heroes {
          ${QUEST_HERO_FIELDS}
        }
      }
    }
  `;

  const data = await gqlRequest(query, { questId });
  const heroes: any[] = data?.quest?.heroes || [];
  return heroes.map(mapHeroResponse).filter((h: DFKHeroProfile | null): h is DFKHeroProfile => h !== null);
}

export async function fetchHeroesForHunt(huntId: string, wallet?: string): Promise<DFKHeroProfile[]> {
  const parts = huntId.split('-');
  const questId = parts[parts.length - 1];

  if (questId && /^\d+$/.test(questId)) {
    try {
      const heroes = await fetchHeroesForQuest(questId);
      if (heroes.length > 0) return heroes;
    } catch (_) {}
  }

  if (wallet) {
    return fetchQuestingHeroesByOwner(wallet);
  }
  return [];
}

export async function fetchActiveHuntHeroes(walletAddress: string): Promise<DFKHeroProfile[]> {
  return fetchQuestingHeroesByOwner(walletAddress);
}
