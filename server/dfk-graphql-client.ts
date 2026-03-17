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
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
  currentQuest: string | null;
  owner: string | null;
}

function mapHeroResponse(raw: any): DFKHeroProfile | null {
  if (!raw) return null;
  return {
    heroId: String(raw.id || raw.normalizedId || ''),
    normalizedId: String(raw.normalizedId || raw.id || ''),
    mainClass: raw.mainClassStr || '',
    subClass: raw.subClassStr || '',
    level: raw.level || 1,
    rarity: raw.rarity || 0,
    generation: raw.generation || 0,
    stats: {
      str: raw.strength || 0,
      dex: raw.dexterity || 0,
      agi: raw.agility || 0,
      int: raw.intelligence || 0,
      wis: raw.wisdom || 0,
      vit: raw.vitality || 0,
      end: raw.endurance || 0,
      lck: raw.luck || 0,
    },
    hp: raw.hp || 0,
    mp: raw.mp || 0,
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

  const idList = heroIds.map(id => `"${id}"`).join(', ');
  const query = `
    query GetHeroes {
      heroes(where: { id_in: [${idList}] }) {
        ${HERO_FIELDS}
      }
    }
  `;

  const data = await gqlRequest(query);
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
  const allHeroes = await fetchHeroesByOwner(ownerAddress, 100);
  return allHeroes.filter(h => h.currentQuest && h.currentQuest !== '0x0000000000000000000000000000000000000000');
}
