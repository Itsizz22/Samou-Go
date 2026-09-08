import type { ProductOptionGroup, SelectedOption } from './models';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Runtime API/cache boundary: typed DTOs may still contain missing arrays or stale entries. */
export function normalizeOptionGroups(value: unknown): ProductOptionGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(group => {
    if (!record(group) || !identifier(group.id)) return [];
    const groupId = group.id;
    const required = group.required === true;
    return [{
      id: groupId, productId: typeof group.productId === 'string' ? group.productId : '',
      name: typeof group.name === 'string' ? group.name : '', required,
      minSelect: finite(group.minSelect) ? Math.max(0, group.minSelect) : required ? 1 : 0,
      maxSelect: finite(group.maxSelect) ? Math.max(0, group.maxSelect) : 1,
      sortOrder: finite(group.sortOrder) ? group.sortOrder : 0,
      items: (Array.isArray(group.items) ? group.items : []).flatMap(item => {
        if (!record(item) || !identifier(item.id) || !finite(item.priceDelta)) return [];
        return [{ id: item.id, groupId, name: typeof item.name === 'string' ? item.name : '', priceDelta: item.priceDelta, sortOrder: finite(item.sortOrder) ? item.sortOrder : 0, isActive: item.isActive !== false }];
      }),
    }];
  });
}

export function normalizeSelectedOptions(value: unknown): SelectedOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(option => {
    if (!record(option) || !identifier(option.id) || !identifier(option.groupId) || !finite(option.priceDelta)) return [];
    return [{ id: option.id, groupId: option.groupId, name: typeof option.name === 'string' ? option.name : '', priceDelta: option.priceDelta }];
  });
}

/** Resolve only live selections; never invent a zero-priced addon for a missing item. */
export function resolveSelectedOptions(groups: unknown, selections: { groupId: string; optionId: string }[]): SelectedOption[] {
  const normalized = normalizeOptionGroups(groups);
  return selections.flatMap(selection => {
    const group = normalized.find(group => group.id === selection.groupId);
    const item = group?.items.find(item => item.id === selection.optionId && item.isActive);
    return item && group ? [{ id: item.id, groupId: group.id, name: item.name, priceDelta: item.priceDelta }] : [];
  });
}
