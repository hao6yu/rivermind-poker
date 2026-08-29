export const TABLE_ACTIVITY_MIN_FELT_WIDTH = 420;
export const TABLE_ACTIVITY_RAIL_MIN_WIDTH = 190;
export const TABLE_ACTIVITY_RAIL_MAX_WIDTH = 360;

export interface TableActivityLayout {
  landscape: boolean;
  mode: 'disclosure' | 'rail';
  railWidth: number;
}

/** Pure shell breakpoint shared by local and private live tables. */
export function tableActivityLayout(width: number, height: number): TableActivityLayout {
  const landscape = width > height;
  if (!landscape) return { landscape: false, mode: 'disclosure', railWidth: 0 };
  const usableWidth = Math.max(0, width - 24);
  const railWidth = Math.min(
    TABLE_ACTIVITY_RAIL_MAX_WIDTH,
    Math.max(TABLE_ACTIVITY_RAIL_MIN_WIDTH, Math.round(usableWidth * 0.3)),
  );
  const keepsPlayableFelt = usableWidth - railWidth - 10 >= TABLE_ACTIVITY_MIN_FELT_WIDTH;
  return {
    landscape: true,
    mode: keepsPlayableFelt ? 'rail' : 'disclosure',
    railWidth: keepsPlayableFelt ? railWidth : 0,
  };
}
