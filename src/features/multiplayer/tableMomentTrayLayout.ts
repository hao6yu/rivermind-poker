export interface TableMomentTrayLayout {
  buttonSize: number;
  stickerSize: number;
  width: number;
}

/** Pure compact geometry for two rows of six reactions. */
export function tableMomentTrayLayout(viewportWidth: number, viewportHeight: number): TableMomentTrayLayout {
  const short = Math.min(viewportWidth, viewportHeight) <= 320;
  return {
    buttonSize: short ? 30 : 32,
    stickerSize: short ? 25 : 27,
    width: Math.min(240, Math.max(216, viewportWidth - 24)),
  };
}
