import * as THREE from 'three'

export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(100, 100)
  const material = new THREE.MeshStandardMaterial({
    color: 0x556b2f,
    roughness: 1
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true

  return mesh
}
