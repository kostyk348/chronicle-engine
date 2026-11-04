/**
 * Канон боя между столами — тесты дифа и применения.
 */
import { describe, it, expect } from 'vitest';
import { diffCanon, applyCanon, CanonEntity } from '../src/utils/canonSync';
import { Entity } from '../src/types/chronicle';

function entity(id: string, over: Partial<Entity> = {}): Entity {
  return {
    id, name: id, role: 'enemy', hp: 10, maxHp: 10, ac: 12, speed: 30,
    initiative: 1, pos: [2, 2], status: 'Alive', avatarUrl: '', color: '#000',
    ...over,
  };
}

const canonOf = (id: string, hp: number, pos: [number, number], status: string): CanonEntity => ({
  id, hp, pos, status,
});

describe('diffCanon', () => {
  it('находит изменения hp, позиции и статуса', () => {
    const local = [
      entity('e1', { hp: 10, pos: [2, 2], status: 'Alive' }),
      entity('e2', { hp: 5, pos: [3, 3], status: 'Wounded' }),
    ];
    const canon = [
      canonOf('e1', 4, [4, 4], 'Wounded'),
      canonOf('e2', 5, [3, 3], 'Wounded'), // без изменений
    ];
    const d = diffCanon(local, canon);
    expect(d.hp).toEqual(['e1']);
    expect(d.pos).toEqual(['e1']);
    expect(d.status).toEqual(['e1']);
    expect(d.unknown).toEqual([]);
    expect(d.matched).toBe(2);
  });

  it('чужие сущности попадают в unknown, локальные не считаются', () => {
    const local = [entity('mine')];
    const canon = [canonOf('mine', 10, [2, 2], 'Alive'), canonOf('theirs', 7, [9, 9], 'Alive')];
    const d = diffCanon(local, canon);
    expect(d.matched).toBe(1);
    expect(d.unknown).toEqual(['theirs']);
  });
});

describe('applyCanon', () => {
  it('переносит hp/pos/status, hp зажимается в [0, maxHp]', () => {
    const local = [
      entity('e1', { hp: 10, maxHp: 10, pos: [2, 2], status: 'Alive' }),
      entity('e2', { hp: 1, maxHp: 6, pos: [5, 5], status: 'Wounded' }),
    ];
    const canon = [canonOf('e1', 99, [7, 8], 'Dead'), canonOf('e2', -5, [1, 1], 'Alive')];
    const { entities, changed } = applyCanon(local, canon);
    expect(changed).toBe(2);
    expect(entities[0].hp).toBe(10); // 99 зажат maxHp
    expect(entities[0].pos).toEqual([7, 8]);
    expect(entities[0].status).toBe('Dead');
    expect(entities[1].hp).toBe(0); // -5 зажат в 0
    expect(entities[1].pos).toEqual([1, 1]);
    expect(entities[1].status).toBe('Alive');
  });

  it('локально-уникальные сущности не трогаются, чужие не добавляются', () => {
    const local = [entity('mine', { hp: 3 }), entity('extra', { hp: 9 })];
    const canon = [canonOf('mine', 8, [0, 0], 'Alive'), canonOf('theirs', 5, [9, 9], 'Alive')];
    const { entities, changed } = applyCanon(local, canon);
    expect(changed).toBe(1);
    expect(entities).toHaveLength(2); // theirs не добавился
    expect(entities.find(e => e.id === 'extra')!.hp).toBe(9);
    expect(entities.find(e => e.id === 'mine')!.hp).toBe(8);
  });

  it('нулевой диф ничего не меняет и не считает изменениями', () => {
    const local = [entity('e1', { hp: 7, pos: [3, 4] })];
    const canon = [canonOf('e1', 7, [3, 4], 'Alive')];
    const { entities, changed } = applyCanon(local, canon);
    expect(changed).toBe(0);
    expect(entities[0]).toEqual(local[0]);
  });

  it('незнакомый статус не рушит тип — остаётся прежний', () => {
    const local = [entity('e1', { status: 'Alive' })];
    const { entities } = applyCanon(local, [canonOf('e1', 10, [2, 2], 'Зачарован')]);
    expect(entities[0].status).toBe('Alive');
  });
});
