import { describe, expect, it } from 'vitest';
import { normalizeOptionGroups, normalizeSelectedOptions, resolveSelectedOptions } from '../options';
const group = { id: 'g', name: 'Extras', required: false, minSelect: 0, maxSelect: 2, items: [{ id: 'a', name: 'Cheese', priceDelta: 2, isActive: true }, { id: 'b', name: 'Sauce', priceDelta: 3, isActive: true }] };
describe('runtime option normalization', () => {
  it('handles absent, non-array and undefined groups', () => {
    for (const input of [undefined, null, {}, 'invalid', [undefined, null]]) expect(normalizeOptionGroups(input)).toEqual([]);
  });
  it('normalizes missing and empty items without dropping required rules', () => {
    for (const items of [undefined, null, {}, []]) expect(normalizeOptionGroups([{ ...group, required: true, minSelect: 1, items }])[0]).toMatchObject({ required: true, minSelect: 1, items: [] });
  });
  it('resolves valid multi-choice selections and their prices', () => {
    const options = resolveSelectedOptions([group], [{ groupId: 'g', optionId: 'a' }, { groupId: 'g', optionId: 'b' }]);
    expect(options).toHaveLength(2);
    expect(options.reduce((sum, item) => sum + item.priceDelta, 0)).toBe(5);
  });
  it('ignores removed and inactive choices instead of inventing free options', () => {
    expect(resolveSelectedOptions([{ ...group, items: [{ ...group.items[0], isActive: false }] }], [{ groupId: 'gone', optionId: 'a' }, { groupId: 'g', optionId: 'a' }])).toEqual([]);
  });
  it('rejects invalid persisted selections and nonfinite prices', () => {
    expect(normalizeSelectedOptions([null, undefined, {}, { id: 'a', groupId: 'g', priceDelta: NaN }])).toEqual([]);
    expect(normalizeSelectedOptions({})).toEqual([]);
  });
});

it('records removed default ingredients explicitly without charging them', () => {
 const groups = [{...group,kind:'INGREDIENT',items:[{id:'a',name:'بصل',priceDelta:0,isActive:true,isDefault:true}]}];
 const result=resolveSelectedOptions(groups,[]);
 expect(result).toEqual([{id:'a',groupId:'g',name:'بدون بصل',priceDelta:0,excluded:true}]);
 expect(normalizeSelectedOptions(result)[0]?.excluded).toBe(true);
});

import { sizeOptionPriceDelta } from '../options';
it('prices full sizes with the same product discount and handles smaller sizes', () => {
 expect(sizeOptionPriceDelta(40,15,20)).toBe(15);
 expect(sizeOptionPriceDelta(10,15,20)).toBe(-7.5);
 expect(sizeOptionPriceDelta(40,20)).toBe(20);
});
