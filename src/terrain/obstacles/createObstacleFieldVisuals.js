// src/terrain/obstacles/createObstacleFieldVisuals.js

/**
 * Visual-only meshes for the static obstacle field.
 *
 * Each obstacle is rendered as a simple primitive (dome / box / cylinder) whose
 * local origin is its base, placed on the terrain surface at its center. The
 * physics height overlay (createObstacleAwareSurfaceProfile) and these meshes
 * share the same obstacle geometry, so contact and visuals agree. Contact
 * feedback is purely visual: a wheel contact point inside an obstacle footprint
 * raises that mesh's emissive. No simulation state is read or written here.
 */

import * as THREE from 'three'
import {
  DEFAULT_SURFACE_MATERIAL_CATALOG,
  getSurfaceMaterial,
} from '../createSurfaceMaterialCatalog.js'

const CONTACT_EMISSIVE_COLOR = new THREE.Color(0xffaa33)

export function createObstacleFieldVisuals(obstacleField, config = {}) {
  const group = new THREE.Group()
  group.name = 'obstacle-field-visuals-v1'

  const baseProfile = config.baseProfile ?? null
  const meshes = []

  for (const obstacle of obstacleField.getObstacles()) {
    const mesh = buildObstacleMesh(obstacle)
    const initialYMeters = Number.isFinite(obstacle.position?.y)
      ? obstacle.position.y
      : (baseProfile
          ? Number(baseProfile.getHeightAtWorldXZ(obstacle.position.x, obstacle.position.z))
          : 0)
    mesh.position.set(
      obstacle.position.x,
      Number.isFinite(initialYMeters) ? initialYMeters : 0,
      obstacle.position.z
    )
    group.add(mesh)
    meshes.push({ obstacle, mesh })
  }

  // Lightweight contact highlight. wheelContactPoints is an iterable of
  // objects/vectors exposing x and z (e.g. wheel contactPointWorldPosition).
  function updateContactVisuals(wheelContactPoints) {
    if (!Array.isArray(wheelContactPoints)) return
    for (const entry of meshes) {
      entry.mesh.material.emissiveIntensity = isContacted(entry.obstacle, wheelContactPoints) ? 0.7 : 0
    }
  }

  // Movable obstacles: track live center position and yaw orientation. Static
  // obstacles never move, so this is a no-op for them.
  function updateObstacleTransforms() {
    for (const entry of meshes) {
      const obstacle = entry.obstacle
      if (!obstacle.position) continue
      entry.mesh.position.set(
        obstacle.position.x,
        Number.isFinite(obstacle.position.y) ? obstacle.position.y : 0,
        obstacle.position.z
      )
      entry.mesh.rotation.y = Number.isFinite(obstacle.orientationYawRadians)
        ? obstacle.orientationYawRadians
        : 0
    }
  }

  return { group, meshes, updateContactVisuals, updateObstacleTransforms }
}

function isContacted(obstacle, wheelContactPoints) {
  for (const point of wheelContactPoints) {
    if (!point) continue
    const dx = point.x - obstacle.centerXMeters
    const dz = point.z - obstacle.centerZMeters
    if (obstacle.shape === 'dome' || obstacle.shape === 'cylinder') {
      if (Math.hypot(dx, dz) <= obstacle.radiusMeters) return true
    } else {
      if (
        Math.abs(dx) <= obstacle.halfExtentXMeters &&
        Math.abs(dz) <= obstacle.halfExtentZMeters
      ) {
        return true
      }
    }
  }
  return false
}

function buildObstacleMesh(obstacle) {
  const material = resolveMaterial(obstacle)
  let geometry

  if (obstacle.shape === 'dome') {
    // Upper hemisphere: local y spans 0 (equator) to +radius (pole), matching
    // the height overlay sqrt(R^2 - r^2).
    geometry = new THREE.SphereGeometry(
      obstacle.radiusMeters,
      24,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    )
  } else if (obstacle.shape === 'cylinder') {
    geometry = new THREE.CylinderGeometry(
      obstacle.radiusMeters,
      obstacle.radiusMeters,
      obstacle.heightMeters,
      24
    )
    geometry.translate(0, obstacle.heightMeters / 2, 0)
  } else {
    geometry = new THREE.BoxGeometry(
      obstacle.halfExtentXMeters * 2,
      obstacle.heightMeters,
      obstacle.halfExtentZMeters * 2
    )
    geometry.translate(0, obstacle.heightMeters / 2, 0)
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'obstacle-' + obstacle.id
  return mesh
}

function resolveMaterial(obstacle) {
  const catalogMaterial = getSurfaceMaterial(
    DEFAULT_SURFACE_MATERIAL_CATALOG,
    obstacle.surfaceKind
  )
  const color = Number.isFinite(obstacle.visualColor)
    ? obstacle.visualColor
    : catalogMaterial.visualColor
  return new THREE.MeshStandardMaterial({
    color: Number.isFinite(color) ? color : 0x666666,
    roughness: Number.isFinite(catalogMaterial.visualRoughness)
      ? catalogMaterial.visualRoughness
      : 0.85,
    metalness: Number.isFinite(catalogMaterial.visualMetalness)
      ? catalogMaterial.visualMetalness
      : 0.05,
    emissive: CONTACT_EMISSIVE_COLOR,
    emissiveIntensity: 0,
  })
}
