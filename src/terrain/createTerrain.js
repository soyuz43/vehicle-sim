import * as THREE from 'three'

export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(200, 200)
  const material = new THREE.MeshStandardMaterial({
    color: 0x444444,
    metalness: 0.3,
    roughness: 0.6,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return mesh
}
