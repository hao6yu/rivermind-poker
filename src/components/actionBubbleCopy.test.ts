import { describe, expect, it } from 'vitest';

import { splitActionBubbleCopy } from './actionBubbleCopy';

describe('action bubble copy emphasis', () => {
  it('splits the authoritative action word without bolding the amount', () => {
    expect(splitActionBubbleCopy('I turn up the heat · Raise to 240', 'Raise')).toEqual({
      after: ' to 240',
      before: 'I turn up the heat · ',
      emphasis: 'Raise',
    });
  });

  it('uses the last matching verb when playful copy repeats it', () => {
    expect(splitActionBubbleCopy('Raise the temperature · Raise to 240', 'Raise')).toEqual({
      after: ' to 240',
      before: 'Raise the temperature · ',
      emphasis: 'Raise',
    });
  });

  it('does not mistake a related word for the canonical action', () => {
    expect(splitActionBubbleCopy('Bet 120 · Opens the betting', 'Bet')).toEqual({
      after: ' 120 · Opens the betting',
      before: '',
      emphasis: 'Bet',
    });
  });

  it('supports localized action words and safely falls back', () => {
    expect(splitActionBubbleCopy('我来升级火力 · 加注到 240', '加注')).toEqual({
      after: '到 240',
      before: '我来升级火力 · ',
      emphasis: '加注',
    });
    expect(splitActionBubbleCopy('Check 240', 'Call')).toEqual({
      after: '',
      before: 'Check 240',
      emphasis: '',
    });
  });
});
