import { describe, expect, it } from 'vitest';
import { chatNameFromFile, initials } from '../src/lib/people';

describe('initials', () => {
  it('handles common names, single names, phone numbers and Devanagari', () => {
    expect(initials('Priya Sharma')).toBe('PS');
    expect(initials('Ananya')).toBe('AN');
    expect(initials('+91 90000 12345')).toBe('#45');
    expect(initials('सुनीता')).toHaveLength(2);
    expect(initials('')).toBe('?');
  });
});

describe('chatNameFromFile', () => {
  it('extracts the group name', () => {
    expect(chatNameFromFile('WhatsApp Chat with Fest Team.txt')).toBe('Fest Team');
    expect(chatNameFromFile('WhatsApp Chat - Robotics.zip')).toBe('Robotics');
    expect(chatNameFromFile('_chat.txt')).toBe('My group chat');
  });
});
