/**
 * Color name mappings for DeFi Kingdoms genetics
 * Converts hex color codes to human-readable color names
 */

// Hair/Appendage color names (matches HAIR_COLORS from visual-gene-decoder.js)
const HAIR_COLOR_NAMES = {
  '#C0C0C0': 'Silver',
  '#4B3621': 'Dark Brown',
  '#8B4513': 'Brown',
  '#D2691E': 'Light Brown',
  '#FFD700': 'Golden',
  '#FFFF00': 'Yellow',
  '#FF6347': 'Red',
  '#8B0000': 'Dark Red',
  '#000000': 'Black',
  '#FF69B4': 'Pink',
  '#9370DB': 'Purple',
  '#00CED1': 'Cyan',
  '#228B22': 'Green',
  '#FFFFFF': 'White',
  '#FF8C00': 'Orange',
  '#4169E1': 'Blue'
};

// Eye color names (matches EYE_COLORS from visual-gene-decoder.js)
const EYE_COLOR_NAMES = {
  '#8B4513': 'Brown',
  '#4169E1': 'Blue',
  '#228B22': 'Green',
  '#808080': 'Gray',
  '#9370DB': 'Purple',
  '#FF6347': 'Red',
  '#00CED1': 'Cyan',
  '#FFD700': 'Gold',
  '#000000': 'Black',
  '#FF69B4': 'Pink',
  '#FFFF00': 'Yellow',
  '#FFFFFF': 'White',
  '#FF8C00': 'Orange',
  '#00FF00': 'Lime',
  '#8B0000': 'Dark Red',
  '#C0C0C0': 'Silver'
};

// Skin color names (matches SKIN_COLORS from visual-gene-decoder.js)
const SKIN_COLOR_NAMES = {
  '#FFF5E1': 'Porcelain',
  '#FFE4C4': 'Cream',
  '#F5DEB3': 'Wheat',
  '#DEB887': 'Tan',
  '#D2B48C': 'Light Brown',
  '#BC8F8F': 'Rosy Brown',
  '#CD853F': 'Peru',
  '#8B4513': 'Brown',
  '#654321': 'Dark Brown',
  '#87CEEB': 'Sky Blue',
  '#00FF00': 'Green',
  '#9370DB': 'Purple',
  '#FFB6C1': 'Light Pink',
  '#808080': 'Gray',
  '#FFFFFF': 'White',
  '#FF6347': 'Red'
};

/**
 * Get readable color name from hex code
 * @param {string} hexCode - Hex color code (e.g., '#8B0000')
 * @param {string} colorType - Type of color: 'hair', 'eye', 'skin', 'appendage'
 * @returns {string} Color name or hex code if not found
 */
export function getColorName(hexCode, colorType = 'hair') {
  if (!hexCode) return 'Unknown';
  
  // Normalize hex code to uppercase
  const normalizedHex = hexCode.toUpperCase();
  
  // Select appropriate color map
  let colorMap;
  switch (colorType.toLowerCase()) {
    case 'hair':
    case 'appendage':
    case 'backappendage':
      colorMap = HAIR_COLOR_NAMES;
      break;
    case 'eye':
      colorMap = EYE_COLOR_NAMES;
      break;
    case 'skin':
      colorMap = SKIN_COLOR_NAMES;
      break;
    default:
      colorMap = HAIR_COLOR_NAMES;
  }
  
  // Look up color name
  const colorName = colorMap[normalizedHex];
  
  // Return name if found, otherwise return hex code
  return colorName || normalizedHex;
}

/**
 * Format color with both name and hex code for display
 * @param {string} hexCode - Hex color code
 * @param {string} colorType - Type of color
 * @param {boolean} showHex - Whether to include hex code in output
 * @returns {string} Formatted color string
 */
export function formatColor(hexCode, colorType = 'hair', showHex = false) {
  const colorName = getColorName(hexCode, colorType);
  
  if (showHex && colorName !== hexCode) {
    return `${colorName} (${hexCode})`;
  }
  
  return colorName;
}

/**
 * Get all possible color names for a color type
 * @param {string} colorType - 'hair', 'eye', or 'skin'
 * @returns {Object} Map of hex codes to color names
 */
export function getColorMap(colorType) {
  switch (colorType.toLowerCase()) {
    case 'hair':
    case 'appendage':
      return { ...HAIR_COLOR_NAMES };
    case 'eye':
      return { ...EYE_COLOR_NAMES };
    case 'skin':
      return { ...SKIN_COLOR_NAMES };
    default:
      return {};
  }
}

export default {
  getColorName,
  formatColor,
  getColorMap,
  HAIR_COLOR_NAMES,
  EYE_COLOR_NAMES,
  SKIN_COLOR_NAMES
};
