const MAX_EASTING = 700000
const MAX_NORTHING = 1300000

export function isValidEastingNorthing({ easting, northing }) {
  return (
    Number.isFinite(easting) &&
    Number.isFinite(northing) &&
    easting >= 0 &&
    easting <= MAX_EASTING &&
    northing >= 0 &&
    northing <= MAX_NORTHING
  )
}
