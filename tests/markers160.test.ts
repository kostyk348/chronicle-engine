/** 1.6.0 — пометки Мастера на живой карте (вид marker). */
import { describe, it, expect } from 'vitest';
import { normalizeMarker } from '../src/utils/linkProtocol';

describe('normalizeMarker (marker)', () => {
  it('валидная постановка проходит: action add, клетка, пустая подпись', () => {
    expect(normalizeMarker({ action: 'add', marker_id: 'mk_1', pos: [4, 6], label: '' })).toEqual({
      action: 'add',
      markerId: 'mk_1',
      pos: [4, 6],
      label: '',
    });
  });

  it('подпись обрезается до 24 символов, а не отвергается', () => {
    const mk = normalizeMarker({ action: 'add', marker_id: 'mk_2', pos: [0, 0], label: 'x'.repeat(50) });
    expect(mk?.label).toHaveLength(24);
  });

  it('снятие без подписи валидно', () => {
    const mk = normalizeMarker({ action: 'remove', marker_id: 'mk_1', pos: [15, 11] });
    expect(mk).toEqual({ action: 'remove', markerId: 'mk_1', pos: [15, 11], label: '' });
  });

  it('мусор отбрасывается: не объект, неверный action, пустой id, не пара, дробные', () => {
    expect(normalizeMarker(null)).toBeNull();
    expect(normalizeMarker(42)).toBeNull();
    expect(normalizeMarker({ action: 'move', marker_id: 'a', pos: [1, 1] })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: '', pos: [1, 1] })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: 'a' })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: 'a', pos: [1.5, 2] })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: 'a', pos: ['3', 4] })).toBeNull();
  });

  it('клетки за границей поля не проходят, крайние — проходят', () => {
    expect(normalizeMarker({ action: 'add', marker_id: 'a', pos: [-1, 0] })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: 'a', pos: [16, 0] })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: 'a', pos: [0, 12] })).toBeNull();
    expect(normalizeMarker({ action: 'add', marker_id: 'a', pos: [15, 11] })).not.toBeNull();
  });
});
