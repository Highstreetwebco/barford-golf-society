export const MENU = Object.freeze([
  { id: 'cod', name: 'Freshly Beer Battered Cod', description: 'Rosemary salted chips, garden peas, tartare sauce and a lemon wedge.', side: 'Rosemary salted chips' },
  { id: 'halloumi', name: 'Beer Battered Halloumi (V)', description: 'Rosemary salted chips, garden peas, tartare sauce and a lemon wedge.', side: 'Rosemary salted chips' },
  { id: 'cottage_pie', name: 'Homemade Cottage Pie', description: 'Seasonal vegetables and a jug of rich gravy.', side: 'Seasonal vegetables' },
  { id: 'steak_pie', name: 'Steak Pie', description: 'Your choice of rosemary salted chips or creamy mash, seasonal vegetables and a jug of gravy.', sides: { chips: 'Rosemary salted chips', mash: 'Creamy mash' } },
  { id: 'steam_burger', name: '8oz Steam Burger', description: 'Smothered in cheese and topped with bacon. Rosemary salted fries, salad and burger relish.', side: 'Rosemary salted fries' },
  { id: 'vegan_burger', name: 'Vegan Burger', description: 'Vegan cheese, rosemary salted fries, salad and burger relish.', side: 'Rosemary salted fries' }
]);
export function mealDetails(meal, side) {
  const item = MENU.find(item => item.id === meal);
  if (!item || (item.sides ? !Object.hasOwn(item.sides, side) : side != null)) return null;
  return { meal: item.name, side: item.sides ? item.sides[side] : item.side };
}
