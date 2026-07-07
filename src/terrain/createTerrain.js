// src\terrain\createTerrain.js

import * as THREE from 'three'

const DEFAULT_TERRAIN_SIZE = 2000

export function createTerrain(config = {}) {
  const size = config.size ?? DEFAULT_TERRAIN_SIZE

  const geometry = new THREE.PlaneGeometry(size, size)
  const material = new THREE.MeshStandardMaterial({
    color: config.color ?? 0x444444,
    metalness: config.metalness ?? 0.15,
    roughness: config.roughness ?? 0.85,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true

  mesh.userData.terrain = {
    kind: 'flat-plane',
    size,
    halfSize: size / 2,
  }

  return mesh
}