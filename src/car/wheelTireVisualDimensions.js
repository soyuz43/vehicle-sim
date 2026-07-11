// src/car/wheelTireVisualDimensions.js

// Shared visual-only wheel/tire dimensions. Physics continues to own the
// authoritative effective rolling radius in the vehicle controller.
export const WHEEL_TIRE_VISUAL_DIMENSIONS = Object.freeze({
  tireOuterRadiusMeters: 0.48,
  tireSectionWidthMeters: 0.38,
  tireHalfWidthMeters: 0.19,
  tireBeadRadiusMeters: 0.3145,
  tireBeadAxialPositionMeters: 0.126,
  tireInnerLinerRadiusMeters: 0.307,

  hubDiscRadiusMeters: 0.202,
  hubDiscWidthMeters: 0.096,
  rimBarrelOuterRadiusMeters: 0.304,
  rimBarrelWidthMeters: 0.288,
  beadSeatRadiusMeters: 0.316,
  beadSeatWidthMeters: 0.036,
  beadSeatAxialPositionMeters: 0.126,
  rimFlangeRadiusMeters: 0.323,
  rimFlangeWidthMeters: 0.012,
  rimFlangeAxialPositionMeters: 0.15,

  beadInterfaceOverlapMeters: 0.0015,
  beadInterfaceToleranceMeters: 0.002,
  minimumCarcassSupportThicknessMeters: 0.052,
})

export function getWheelTireVisualDimensions() {
  return WHEEL_TIRE_VISUAL_DIMENSIONS
}
