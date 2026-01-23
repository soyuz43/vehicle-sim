// src/car/createCar.js
import * as THREE from 'three'

export function createCar() {
  const car = new THREE.Group()

  // --- Chassis (slightly longer than tall) ---
  const bodyGeometry = new THREE.BoxGeometry(2, 1, 4)
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    metalness: 0.6,
    roughness: 0.3,
  })

  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.castShadow = true
  body.position.y = 0.5
  car.add(body)

  // --- Triangular "nose" to show the front (+Z) ---
  // Cone with 3 radial segments gives a triangular wedge look.
  const noseGeometry = new THREE.ConeGeometry(0.9, 1.5, 3)
  const noseMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5555,
    metalness: 0.6,
    roughness: 0.35,
  })

  const nose = new THREE.Mesh(noseGeometry, noseMaterial)
  nose.castShadow = true

  // Point the cone forward (+Z): cones point +Y by default, so rotate to +Z
  nose.rotation.x = Math.PI / 2

  // Place it at the front end of the chassis
  // Body length is 4, so front face is around z = +2. Put nose slightly beyond.
  nose.position.set(0, 0.6, 2.6)

  car.add(nose)

  return car
}
