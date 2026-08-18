export const DEFAULT_SUBCATEGORY = 'Others';
export const SUBCATEGORY_MAX_LENGTH = 60;

export const normalizeSubCategory = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized || DEFAULT_SUBCATEGORY;
};

const RULES = [
  ['Ice Cream', /ice\s*cream|strawberry\/butterscotch\/chocolate/i],
  ['Chips & Crisps', /\b(chips?|crisps?|lays?|kurkure|kurkue|bingo|nachos?|doritos)\b/i],
  ['Biscuits & Cookies', /\b(biscuits?|cookies?|oreo|parle|bourbon|cracker|hide\s*&?\s*seek|choco\s*pie|dark\s*fantasy|jim\s*jam|marie\s*gold)\b/i],
  ['Noodles & Instant Food', /\b(noodles?|maggi|ramen|pasta|cup\s*noodles?)\b/i],
  ['Drinks', /\b(juice|drink|cola|soda|water|milk|milkshake|shake|lassi|sprite|fanta|limca|frooti|mogu\s*mogu|thums\s*up)\b/i],
  ['Chocolate & Candy', /\b(chocolates?|candy|candies|toffee|gums?|lollipop|munch|kitkat|dairy\s*milk|snickers)\b/i],
  ['Bakery', /\b(cake|bread|bun|muffin|pastry|roll|rusk)\b/i],
  ['Savoury Snacks', /\b(namkeen|mixture|bhujia|peanuts?|popcorn|samosa|kachori)\b/i],
  ['Nutrition Bars', /\b(energy|protein)\s*bar\b/i],
  ['Personal Care', /\b(soap|shampoo|toothpaste|toothbrush|deodorant|sanitary|sanitiser|sanitizer|lotion|comb|hair\s*oil|lip\s*balm|dove|clinic\s*plus|h&s)\b/i],
  ['Stationery', /\b(pen|pencil|eraser|notebook|ruler|sharpener|marker|paper|glue|fevistick|file|folder|geometry\s*box)\b/i],
  ['Hostel Essentials', /\b(batter(?:y|ies)|locks?|padlock|combination\s*lock)\b/i],
];

export const inferSubCategory = (productName) => {
  const name = String(productName ?? '');
  return RULES.find(([, pattern]) => pattern.test(name))?.[0] || DEFAULT_SUBCATEGORY;
};
