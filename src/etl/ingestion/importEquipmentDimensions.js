// src/etl/ingestion/importEquipmentDimensions.js
// Imports equipment dimension data from CSV files into the database
// Run with: node src/etl/ingestion/importEquipmentDimensions.js

import { rawPg } from '../../../server/db.js';
import fs from 'fs';
import path from 'path';

// Equipment contract addresses from huntsPatrolIndexer.js
const EQUIPMENT_CONTRACTS = {
  // Weapons
  '0x41bcc7bb71b4ad59128e7c05fdeaed8bf8a37a5e': { category: 'weapon', name: '2H Axe', typeId: 2 },
  '0x6d15efca1a0e42f07c70f974eb6b30c70e5ff71a': { category: 'weapon', name: 'Bow', typeId: 3 },
  '0xcecd8e83e5c0c0a4f52a33ca3e900c0c0b34e8ea': { category: 'weapon', name: 'Dagger', typeId: 4 },
  '0xab2d08e30cfe25a33f8c0c9f8f2f8c99d6b8f8e8': { category: 'weapon', name: 'Gloves', typeId: 5 },
  '0x78aed65a2cc40c7d8b0df1571d853ed7c0c1a8ae': { category: 'weapon', name: '1H Mace', typeId: 6 },
  '0x6c28e3eb18b3c1e4e8c0c0a9f8c99d6b8f8e8e8e': { category: 'weapon', name: '2H Mace', typeId: 7 },
  '0x70c9e2bdc7b0c1a8ae78aed65a2cc40c7d8b0df1': { category: 'weapon', name: '1H Spear', typeId: 8 },
  '0xc0c1a8ae78aed65a2cc40c7d8b0df1571d853ed7': { category: 'weapon', name: '2H Spear', typeId: 9 },
  '0x38ed44c3f3b1bde6b0c0c1a8ae78aed65a2cc40c': { category: 'weapon', name: 'Staff', typeId: 10 },
  '0x07c70f974eb6b30c70e5ff71a6d15efca1a0e42f': { category: 'weapon', name: '1H Sword', typeId: 11 },
  '0xe4f52a33ca3e900c0c0b34e8eacecd8e83e5c0c0': { category: 'weapon', name: '2H Sword', typeId: 12 },
  '0x97e5f8a0e8c0c1a8ae78aed65a2cc40c7d8b0df1': { category: 'weapon', name: 'Wand', typeId: 13 },
  // Armor
  '0x89ed44c3f3b1bde6b0c0c1a8ae78aed65a2cc40c': { category: 'armor', name: 'Light Armor', typeId: 1 },
  '0x99ed44c3f3b1bde6b0c0c1a8ae78aed65a2cc40c': { category: 'armor', name: 'Medium Armor', typeId: 2 },
  '0xa9ed44c3f3b1bde6b0c0c1a8ae78aed65a2cc40c': { category: 'armor', name: 'Heavy Armor', typeId: 3 },
  // Accessories
  '0xb9ed44c3f3b1bde6b0c0c1a8ae78aed65a2cc40c': { category: 'accessory', name: 'Accessory', typeId: 1 },
  '0xc9ed44c3f3b1bde6b0c0c1a8ae78aed65a2cc40c': { category: 'accessory', name: 'Offhand', typeId: 2 },
};

// Parse CSV content - handles quoted strings with commas and NULL values
function parseCSV(content) {
  // Normalize line endings (Windows \r\n to \n)
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '');
  const lines = normalized.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // Skip empty lines
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      let val = values[idx];
      // Handle NULL values
      if (val === 'NULL' || val === undefined || val === '') {
        val = null;
      }
      // Clean header name (remove quotes and any remaining whitespace)
      const cleanHeader = header.replace(/"/g, '').trim();
      row[cleanHeader] = val;
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.replace(/^"|"$/g, ''));
  return values;
}

// Chain IDs for equipment sources
const CHAIN_IDS = {
  DFK: 53935,    // DFK Chain (Crystalvale) - Hunts
  METIS: 1088,   // METIS - Patrols
  SHARED: 0,     // Items available on both chains (cosmetics, etc.)
};

async function createTables() {
  console.log('Creating equipment dimension tables with chain_id support...');
  
  // Drop existing tables and recreate with chain_id
  await rawPg`DROP TABLE IF EXISTS dim_weapon_details CASCADE`;
  await rawPg`DROP TABLE IF EXISTS dim_armor_details CASCADE`;
  await rawPg`DROP TABLE IF EXISTS dim_accessory_details CASCADE`;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS dim_weapon_details (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER NOT NULL DEFAULT 0,
      weapon_type_id INTEGER NOT NULL,
      display_id INTEGER NOT NULL,
      weapon_name TEXT NOT NULL,
      description TEXT,
      UNIQUE(chain_id, weapon_type_id, display_id)
    )
  `;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS dim_armor_details (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER NOT NULL DEFAULT 0,
      armor_type_id INTEGER NOT NULL,
      display_id INTEGER NOT NULL,
      armor_name TEXT NOT NULL,
      description TEXT,
      UNIQUE(chain_id, armor_type_id, display_id)
    )
  `;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS dim_accessory_details (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER NOT NULL DEFAULT 0,
      accessory_type_id INTEGER NOT NULL,
      display_id INTEGER NOT NULL,
      accessory_name TEXT NOT NULL,
      description TEXT,
      UNIQUE(chain_id, accessory_type_id, display_id)
    )
  `;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS equipment_categories (
      id SERIAL PRIMARY KEY,
      contract_address TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      category_name TEXT NOT NULL
    )
  `;
  
  console.log('Tables created with chain_id support.');
}

// Determine chain_id based on display_id and item characteristics
// Hunt items (DFK Chain): display_id 1-4 for core items
// Patrol items (METIS): display_id 5-6 for Submersia patrol items
// Cosmetic/promotional: display_id >= 50000 are shared
function getChainIdForEquipment(displayId, itemName) {
  const displayIdNum = parseInt(displayId);
  
  // Cosmetic/promotional items (display_id >= 50000) are shared
  if (displayIdNum >= 50000) {
    return CHAIN_IDS.SHARED;
  }
  
  // Hunt-specific items (based on known hunt equipment names)
  const huntItems = [
    'Feather Duster', 'Wishbone Breastplate', 'Boc-Knight Mail',
    'Gore Blade', 'Wishbone Shield', 'Rocboc Claw'
  ];
  if (huntItems.some(name => itemName?.includes(name) || itemName?.toLowerCase().includes('boc') || itemName?.toLowerCase().includes('rocboc'))) {
    return CHAIN_IDS.DFK;
  }
  
  // Patrol-specific items (Submersia themed)
  const patrolItems = [
    'Rags of the Nameless', 'Seawarden', 'Abyssal', 'Submersian', 'Coral',
    'Drowned', 'Nameless', 'Submersia'
  ];
  if (patrolItems.some(name => itemName?.includes(name))) {
    return CHAIN_IDS.METIS;
  }
  
  // For display_id 1-4, check if it's hunt or shared based on item name
  if (displayIdNum >= 1 && displayIdNum <= 4) {
    // Basic starter equipment appears on both chains
    if (itemName?.includes('Hempen') || itemName?.includes('Leather') || 
        itemName?.includes('Tin') || itemName?.includes('Bronze') ||
        itemName?.includes("Squire's")) {
      return CHAIN_IDS.SHARED;
    }
    // Hunt-specific for display_id 1
    if (displayIdNum === 1) {
      return CHAIN_IDS.DFK;
    }
  }
  
  // Display_id 5-6 are typically patrol items
  if (displayIdNum >= 5 && displayIdNum <= 6) {
    return CHAIN_IDS.METIS;
  }
  
  // Default to shared for unknown items
  return CHAIN_IDS.SHARED;
}

async function importWeapons() {
  const filePath = path.join(process.cwd(), 'attached_assets', 'dim_weapon_details_1768829024270.csv');
  if (!fs.existsSync(filePath)) {
    console.log('Weapon details CSV not found at:', filePath);
    return 0;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  
  console.log(`Importing ${rows.length} weapons with chain_id...`);
  
  let imported = 0;
  for (const row of rows) {
    try {
      const chainId = getChainIdForEquipment(row.display_id, row.weapon_name);
      await rawPg`
        INSERT INTO dim_weapon_details (chain_id, weapon_type_id, display_id, weapon_name, description)
        VALUES (${chainId}, ${parseInt(row.weapon_type_id)}, ${parseInt(row.display_id)}, ${row.weapon_name}, ${row.description})
        ON CONFLICT (chain_id, weapon_type_id, display_id) DO UPDATE SET
          weapon_name = EXCLUDED.weapon_name,
          description = EXCLUDED.description
      `;
      imported++;
    } catch (err) {
      console.error('Error importing weapon:', row, err.message);
    }
  }
  
  console.log(`Imported ${imported} weapons.`);
  return imported;
}

async function importArmor() {
  const filePath = path.join(process.cwd(), 'attached_assets', 'dim_armor_details_1768829024270.csv');
  if (!fs.existsSync(filePath)) {
    console.log('Armor details CSV not found at:', filePath);
    return 0;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  
  console.log(`Importing ${rows.length} armors with chain_id...`);
  
  let imported = 0;
  for (const row of rows) {
    try {
      const chainId = getChainIdForEquipment(row.display_id, row.armor_name);
      await rawPg`
        INSERT INTO dim_armor_details (chain_id, armor_type_id, display_id, armor_name, description)
        VALUES (${chainId}, ${parseInt(row.armor_type_id)}, ${parseInt(row.display_id)}, ${row.armor_name}, ${row.description})
        ON CONFLICT (chain_id, armor_type_id, display_id) DO UPDATE SET
          armor_name = EXCLUDED.armor_name,
          description = EXCLUDED.description
      `;
      imported++;
    } catch (err) {
      console.error('Error importing armor:', row, err.message);
    }
  }
  
  console.log(`Imported ${imported} armors.`);
  return imported;
}

async function importAccessories() {
  const filePath = path.join(process.cwd(), 'attached_assets', 'dim_accessory_details_1768829024269.csv');
  if (!fs.existsSync(filePath)) {
    console.log('Accessory details CSV not found at:', filePath);
    return 0;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  
  console.log(`Importing ${rows.length} accessories with chain_id...`);
  
  let imported = 0;
  for (const row of rows) {
    try {
      const chainId = getChainIdForEquipment(row.display_id, row.accessory_name);
      await rawPg`
        INSERT INTO dim_accessory_details (chain_id, accessory_type_id, display_id, accessory_name, description)
        VALUES (${chainId}, ${parseInt(row.accessory_type_id)}, ${parseInt(row.display_id)}, ${row.accessory_name}, ${row.description})
        ON CONFLICT (chain_id, accessory_type_id, display_id) DO UPDATE SET
          accessory_name = EXCLUDED.accessory_name,
          description = EXCLUDED.description
      `;
      imported++;
    } catch (err) {
      console.error('Error importing accessory:', row, err.message);
    }
  }
  
  console.log(`Imported ${imported} accessories.`);
  return imported;
}

async function main() {
  try {
    console.log('=== Equipment Dimension Import ===\n');
    
    await createTables();
    
    const weapons = await importWeapons();
    const armors = await importArmor();
    const accessories = await importAccessories();
    
    console.log('\n=== Import Complete ===');
    console.log(`Weapons: ${weapons}`);
    console.log(`Armors: ${armors}`);
    console.log(`Accessories: ${accessories}`);
    console.log(`Total: ${weapons + armors + accessories} items`);
    
    // Verify data
    const [weaponCount] = await rawPg`SELECT COUNT(*) as count FROM dim_weapon_details`;
    const [armorCount] = await rawPg`SELECT COUNT(*) as count FROM dim_armor_details`;
    const [accessoryCount] = await rawPg`SELECT COUNT(*) as count FROM dim_accessory_details`;
    
    console.log('\n=== Verification ===');
    console.log(`Weapons in DB: ${weaponCount.count}`);
    console.log(`Armors in DB: ${armorCount.count}`);
    console.log(`Accessories in DB: ${accessoryCount.count}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  }
}

main();
