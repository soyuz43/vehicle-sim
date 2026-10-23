import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'

const CHASSIS_VISUAL_CASES = [
  {
    id: 'chassis-hatchback',
    visualKind: 'hatchback',
    bodyHeightMeters: 0.65,
    bodyLengthRatio01: 0.96,
    wheelbaseMeters: 2.9,
    frontTrackWidthMeters: 2.5,
  },
  {
    id: 'chassis-lightroadster',
    visualKind: 'roadster',
    bodyHeightMeters: 0.55,
    bodyLengthRatio01: 0.95,
    wheelbaseMeters: 2.6,
    frontTrackWidthMeters: 2.3,
  },
  {
    id: 'chassis-suv',
    visualKind: 'suv',
    bodyHeightMeters: 0.95,
    bodyLengthRatio01: 0.925,
    wheelbaseMeters: 3.0,
    frontTrackWidthMeters: 2.6,
  },
  {
    id: 'chassis-heavytruck',
    visualKind: 'truck',
    bodyHeightMeters: 0.95,
    bodyLengthRatio01: 0.975,
    wheelbaseMeters: 4.2,
    frontTrackWidthMeters: 2.7,
  },
]

for (const chassisCase of CHASSIS_VISUAL_CASES) {
  test('catalog chassis ' + chassisCase.id + ' builds its selected body visual', () => {
    const configuration = setVehicleConfigurationSlot(
      createDefaultVehicleConfiguration(),
      'chassis',
      chassisCase.id
    )
    const spec = applyVehicleConfiguration(configuration).spec
    const car = createCar(spec)
    const bodyShell = car.getObjectByName('raised-body-shell')
    const expectedLengthMeters = chassisCase.wheelbaseMeters + 1.1
    const expectedWidthMeters = chassisCase.frontTrackWidthMeters - 0.35

    assert.ok(bodyShell)
    assert.equal(spec.bodyVisualKind, chassisCase.visualKind)
    assert.equal(car.userData.vehicle.body.visualKind, chassisCase.visualKind)
    assert.ok(Math.abs(car.userData.vehicle.body.length - expectedLengthMeters) < 1e-9)
    assert.ok(Math.abs(car.userData.vehicle.body.width - expectedWidthMeters) < 1e-9)
    assert.equal(car.userData.vehicle.body.height, chassisCase.bodyHeightMeters)

    bodyShell.geometry.computeBoundingBox()
    const dimensionsMeters = bodyShell.geometry.boundingBox.getSize(new THREE.Vector3())
    assert.ok(Math.abs(dimensionsMeters.x - expectedWidthMeters) < 1e-6)
    assert.ok(Math.abs(dimensionsMeters.y - chassisCase.bodyHeightMeters) < 1e-6)
    assert.ok(
      Math.abs(
        dimensionsMeters.z - expectedLengthMeters * chassisCase.bodyLengthRatio01
      ) < 1e-5
    )
  })
}

test('live chassis apply swaps body visuals and disposes replaced geometries', () => {
  const car = createCar()
  const bodyNodeNames = [
    'raised-body-shell',
    'front-direction-nose',
    'greenhouse-visual',
    'brake-light-right',
    'brake-light-left',
  ]
  const previousNodes = bodyNodeNames.map((name) => car.getObjectByName(name))
  const disposedGeometryNames = []

  for (const node of previousNodes) {
    assert.ok(node)
    node.geometry.addEventListener('dispose', () => {
      disposedGeometryNames.push(node.name)
    })
  }

  const controller = createVehicleController({ vehicle: car })
  const truckConfiguration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'chassis',
    'chassis-heavytruck'
  )
  controller.setVehicleConfiguration(truckConfiguration)

  for (const previousNode of previousNodes) {
    assert.equal(previousNode.parent, null)
    assert.ok(disposedGeometryNames.includes(previousNode.name))
    assert.notEqual(car.getObjectByName(previousNode.name), previousNode)
  }

  const bodyShell = car.getObjectByName('raised-body-shell')
  assert.equal(disposedGeometryNames.length, previousNodes.length)
  assert.equal(car.userData.vehicle.body.visualKind, 'truck')
  assert.ok(Math.abs(car.userData.vehicle.body.length - 5.3) < 1e-9)
  assert.equal(car.userData.vehicle.body.width, 2.35)
  assert.equal(car.userData.vehicle.body.height, 0.95)
  assert.equal(
    controller.getSnapshot().chassisMassProperties.massKg,
    3200
  )
  assert.ok(bodyShell)
  assert.notEqual(bodyShell, previousNodes[0])
})
