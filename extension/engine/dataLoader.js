/**
 * Extension Engine — Data Loader
 * Loads and exposes all five master JSON files with typed accessors.
 * Data is bundled with the extension so no network request is needed.
 */

(function () {
  if (typeof window !== 'undefined' && window.__dfkDataLoader) return;

  let abilitiesData = null;
  let statusesData = null;
  let consumablesData = null;
  let encountersData = null;
  let enemyPoliciesData = null;
  let loaded = false;

  async function loadAllData() {
    if (loaded) return;
    const base = chrome.runtime.getURL('data/');

    const files = [
      'abilities.master.json',
      'statuses.master.json',
      'consumables.master.json',
      'encounters.master.json',
      'enemy_policies.master.json',
    ];

    const responses = await Promise.all(
      files.map(async (f) => {
        const res = await fetch(base + f);
        if (!res.ok) throw new Error(`[DFK Engine] Failed to fetch ${f}: ${res.status}`);
        return res.json();
      })
    );

    abilitiesData = responses[0];
    statusesData = responses[1];
    consumablesData = responses[2];
    encountersData = responses[3];
    enemyPoliciesData = responses[4];

    loaded = true;
    console.log('[DFK Engine] Data loaded successfully');
  }

  function getAbilities() {
    return abilitiesData ? abilitiesData.abilities : [];
  }

  function getAbilityById(id) {
    return getAbilities().find(a => a.id === id) || null;
  }

  function getAbilityByName(name) {
    const lc = name.toLowerCase();
    return getAbilities().find(a => a.name.toLowerCase() === lc) || null;
  }

  function getAbilitiesByClass(heroClass) {
    const lc = heroClass.toLowerCase();
    return getAbilities().filter(a => a.class.toLowerCase() === lc);
  }

  function getActiveAbilitiesByClass(heroClass) {
    return getAbilitiesByClass(heroClass).filter(a => a.type === 'active');
  }

  function getStatuses() {
    return statusesData ? statusesData.statuses : [];
  }

  function getStatusById(id) {
    return getStatuses().find(s => s.id === id) || null;
  }

  function getConsumables() {
    return consumablesData ? consumablesData.consumables : [];
  }

  function getConsumableById(id) {
    return getConsumables().find(c => c.id === id) || null;
  }

  function getConsumableByName(name) {
    const lc = name.toLowerCase();
    return getConsumables().find(c => c.name.toLowerCase() === lc) || null;
  }

  function getEncounters() {
    return encountersData ? encountersData.encounters : [];
  }

  function getEncounterById(id) {
    return getEncounters().find(e => e.encounterId === id || e.id === id) || null;
  }

  function findEncounterByEnemyNames(enemyNames) {
    const nameSet = new Set(enemyNames.map(n => n.toLowerCase()));
    return getEncounters().find(e => {
      const formationNames = new Set();
      const formationTypes = new Set();
      for (const f of e.formation) {
        if (f.name) formationNames.add(f.name.toLowerCase());
        if (f.displayName) formationNames.add(f.displayName.toLowerCase());
        if (f.enemyType) formationTypes.add(f.enemyType.toLowerCase());
        if (f.enemyId) formationTypes.add(f.enemyId.toLowerCase());
      }
      for (const n of nameSet) {
        if (!formationNames.has(n) && !formationTypes.has(n)) return false;
      }
      return true;
    }) || null;
  }

  function getEnemyPolicies() {
    return enemyPoliciesData ? enemyPoliciesData.policies : [];
  }

  function getEnemyPolicyById(enemyId) {
    return getEnemyPolicies().find(p => p.enemyId === enemyId || p.enemyType === enemyId) || null;
  }

  function isLoaded() {
    return loaded;
  }

  const dataLoader = {
    loadAllData,
    isLoaded,
    getAbilities,
    getAbilityById,
    getAbilityByName,
    getAbilitiesByClass,
    getActiveAbilitiesByClass,
    getStatuses,
    getStatusById,
    getConsumables,
    getConsumableById,
    getConsumableByName,
    getEncounters,
    getEncounterById,
    findEncounterByEnemyNames,
    getEnemyPolicies,
    getEnemyPolicyById,
  };

  if (typeof window !== 'undefined') {
    window.__dfkDataLoader = dataLoader;
  }
})();
