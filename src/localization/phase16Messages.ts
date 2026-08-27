export const phase16EnglishMessages = {
  'home.cheatSheets': 'Poker cheat sheets',
  'home.cheatSheetsDescription': 'Hand rankings, positions, and betting reference',
  'sizing.enterAmount': 'Type an amount',
  'sizing.enterNumber': 'Type a whole number',
  'sizing.boundsHint': 'Minimum {{min}} · Maximum {{max}}',
  'sizing.editAmount': 'Edit bet size',
} as const;

export type Phase16MessageKey = keyof typeof phase16EnglishMessages;

export const phase16SimplifiedMessages: Record<Phase16MessageKey, string> = {
  'home.cheatSheets': '扑克助记卡',
  'home.cheatSheetsDescription': '手牌排名、座位位置和下注参考',
  'sizing.enterAmount': '输入数字',
  'sizing.enterNumber': '输入整数',
  'sizing.boundsHint': '最小 {{min}} · 最大 {{max}}',
  'sizing.editAmount': '修改下注金额',
};

export const phase16TraditionalMessages: Record<Phase16MessageKey, string> = {
  'home.cheatSheets': '撲克助記卡',
  'home.cheatSheetsDescription': '手牌排名、座位位置和下注參考',
  'sizing.enterAmount': '輸入數字',
  'sizing.enterNumber': '輸入整數',
  'sizing.boundsHint': '最小 {{min}} · 最大 {{max}}',
  'sizing.editAmount': '修改下注金額',
};
