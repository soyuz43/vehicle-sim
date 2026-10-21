// src/createSimulation.js

import * as THREE from 'three'
import { createTerrain } from './terrain/createTerrain.js'
import { createHeightfieldTerrainContactQuery } from './terrain/createHeightfieldTerrainContactQuery.js'
import { createTerrainSelection } from './terrain/createTerrainSelection.js'
import { createObstacleFieldVisuals } from './terrain/obstacles/createObstacleFieldVisuals.js'
import { createCar } from './car/createCar.js'
import { createVehicleController } from './vehicle/createVehicleController.js'
import { createControllerConfig } from './vehicle/config/applyVehicleConfiguration.js'
import { createDefaultVehicleConfiguration } from './vehicle/config/createVehicleConfiguration.js'
import { createTireSlipFeedback } from './effects/tireSlipFeedback/createTireSlipFeedback.js'
import { createFixedTimestepRunner } from './simulation/createFixedTimestepRunner.js'
import { createTerrainDeformation as createDefaultTerrainDeformation } from './terrain/deformation/createTerrainDeformation.js'
import { createDeformationVisuals } from './terrain/deformation/createDeformationVisuals.js'
import { createVehicleObstacleInteraction as createDefaultVehicleObstacleInteraction } from './terrain/obstacles/createVehicleObstacleInteraction.js'
import { createParticleSystem } from './effects/createParticleSystem.js'
import { stepSimulation } from './runSimulationFrame.js'

export function createSimulation(deps = {}) {
  const { scene } = deps
  const keyState = deps.keyState ?? {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
  }
  const createTerrainDeformation =
    deps.createTerrainDeformation ?? createDefaultTerrainDeformation
  const createVehicleObstacleInteraction =
    deps.createVehicleObstacleInteraction ??
    createDefaultVehicleObstacleInteraction

  const terrainDeformation = createTerrainDeformation()
  const terrainSelection = createTerrainSelection({ deformationField: terrainDeformation })
  const terrainSurfaceProfile = terrainSelection.surfaceProfile
  const terrain = createTerrain({ surfaceProfile: terrainSurfaceProfile })
  scene.add(terrain)

  let deformationVisuals = null
  if (terrainSelection.obstacleField) {
    deformationVisuals = createDeformationVisuals({
      terrainMesh: terrain,
      deformationField: terrainDeformation,
    })
  }

  const terrainContactQuery = createHeightfieldTerrainContactQuery({
    surfaceProfile: terrainSurfaceProfile,
  })

  let obstacleVisuals = null
  if (terrainSelection.obstacleField) {
    obstacleVisuals = createObstacleFieldVisuals(terrainSelection.obstacleField, {
      baseProfile: terrainSurfaceProfile,
    })
  }

  let waterVisuals = null
  if (terrainSelection.waterSurface) {
    waterVisuals = createWaterVisuals(terrainSelection.waterSurface)
    scene.add(waterVisuals.mesh)
  }

  const initialVehicleConfig = createDefaultVehicleConfiguration()
  const car = createCar()
  scene.add(car)

  const controllerConfig = createControllerConfig(initialVehicleConfig, {
    vehicle: car,
    terrainContactQuery,
    terrainSurfaceProfile,
  })
  const vehicleController = createVehicleController(controllerConfig)
  const tirePressureVisuals = car.userData.vehicle.tirePressureVisuals

  const particleSystem = createParticleSystem()
  scene.add(particleSystem.object3D)

  let vehicleObstacleInteraction = null
  if (terrainSelection.obstacleField) {
    vehicleObstacleInteraction = createVehicleObstacleInteraction({
      obstacleField: terrainSelection.obstacleField,
      terrainHeightFn: terrainSelection.baseProfile.getHeightAtWorldXZ,
      applyVehiclePlanarImpulse:
        vehicleController.applyExternalPlanarImpulseNewtonsSecond,
    })
  }

  const tireSlipFeedback = createTireSlipFeedback({
    vehicleController,
    car,
    particleSystem,
  })

  const simulation = {
    scene,
    keyState,
    terrain,
    terrainDeformation,
    terrainSelection,
    terrainSurfaceProfile,
    terrainContactQuery,
    deformationVisuals,
    obstacleVisuals,
    waterVisuals,
    car,
    initialVehicleConfig,
    controllerConfig,
    vehicleController,
    tirePressureVisuals,
    particleSystem,
    vehicleObstacleInteraction,
    tireSlipFeedback,
    input: {
      throttle: 0,
      brake: 0,
      left: false,
      right: false,
      handbrake: 0,
    },
    vehicleObstacleSnapshot: {
      position: null,
      worldVelocityMetersPerSecond: null,
      yawRateRadiansPerSecond: 0,
      chassisMassProperties: null,
      wheelStates: null,
    },
    fixedSimulationRunner: null,
  }

  simulation.fixedSimulationRunner = createFixedTimestepRunner({
    fixedTimeStepSeconds: 1 / 60,
    maxFrameDeltaSeconds: 0.1,
    maxStepsPerFrame: 6,
    step: (fixedDt, simTime) => stepSimulation(simulation, fixedDt, simTime),
  })

  return simulation
}

function createWaterVisuals(waterSurface) {
  const waterGeometry = new THREE.PlaneGeometry(200, 200, 1, 1)
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x0077be,
    transparent: true,
    opacity: 0.7,
    roughness: 0.1,
    metalness: 0.9,
  })

  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial)
  waterMesh.rotation.x = -Math.PI / 2
  waterMesh.position.y = waterSurface.waterLevelYMeters

  return {
    mesh: waterMesh,
    update: function(time) {
      // Could add wave animation here in the future
    }
  }
}
