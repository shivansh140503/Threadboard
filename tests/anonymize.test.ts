import { describe, expect, it } from 'vitest';
import { createAnonymizer } from '../src/ai/anonymize';

const anon = createAnonymizer(['Meera Iyer', '+91 90000 12345']);

describe('anonymize phone numbers vs amounts', () => {
  it.each([
    ['Call me on 98765 43210', 'Call me on Phone 1'],
    ['Call +91 98765 43210 now', 'Call Phone 1 now'],
    ['9876543210', 'Phone 1'],
    ['+44 7700 900123', 'Phone 1'],
  ])('replaces phone %s', (input, expected) => {
    expect(createAnonymizer([]).forward(input)).toBe(expected);
  });

  it.each([
    'venue budget 50000 - 60000',
    'quotes were 15000 20000',
    'total ₹1500000000',
    'Rs. 25000 00000 is wrong but money',
    'date 2026-11-21 and time 10:30',
    'amount ₹50,000 approved',
  ])('keeps amounts and dates: %s', (input) => {
    expect(createAnonymizer([]).forward(input)).toBe(input);
  });

  it('replaces a participant phone sender with their Person token, not a Phone token', () => {
    expect(anon.forward('ask +91 90000 12345 and Meera')).toBe('ask Person B and Person A');
  });

  it('maps tokens back', () => {
    const a = createAnonymizer(['Meera Iyer']);
    const sent = a.forward('Meera: call 98765 43210');
    expect(sent).toBe('Person A: call Phone 1');
    expect(a.back('Person A will call Phone 1')).toBe('Meera Iyer will call 98765 43210');
  });
});
