// src/car/createCar.js
import * as THREE from 'three'

export function createCar() {
  const car = new THREE.Group()

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

  // optional: add wheels or details later
  return car
}
