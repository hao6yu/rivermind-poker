export interface TableMomentMenuLayout {
  /** One text column in portrait; up to two on short landscape surfaces. */
  columns: 1 | 2;
  /** Every row stays at least 44 points tall (scope 3.11E). */
  rowHeight: number;
  width: number;
}

/** Pure geometry for the eight-phrase text reaction menu. */
export function tableMomentMenuLayout(viewportWidth: number, viewportHeight: number): TableMomentMenuLayout {
  const shortLandscape = viewportWidth > viewportHeight && viewportHeight <= 480;
  return {
    columns: shortLandscape ? 2 : 1,
    rowHeight: 44,
    width: Math.min(260, Math.max(200, viewportWidth - 24)),
  };
}
