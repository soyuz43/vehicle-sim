import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

/* =========================================
   SCRATCH VARIABLES
   (Reused globally to avoid Garbage Collection stutters)
   ========================================= */
const _v3_1 = new THREE.Vector3()
const _v3_2 = new THREE.Vector3()
const _v3_3 = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _mat = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)

/**
 * ORBIT CAMERA
 * Interactive mouse control that loosely follows the car.
 */
export function createOrbitCameraControls(camera, renderer, targetObject, config = {}) {
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.minDistance = 5
  controls.maxDistance = 50

  // Config
  const distance = config.distance ?? 18
  const height = config.height ?? 8
  const lookHeight = config.lookHeight ?? 1.0
  const followLerp = config.followLerp ?? 0.12
  
  // Forward axis logic
  const forwardAxisLocal = config.forwardAxisLocal?.clone() ?? new THREE.Vector3(0, 0, 1)

  // State
  const desiredTarget = new THREE.Vector3()
  const desiredCamPos = new THREE.Vector3()

  function computeDesiredPose() {
    targetObject.getWorldPosition(_v3_1) // Car Pos
    targetObject.getWorldQuaternion(_quat)
    
    // Calculate Forward World Direction
    _v3_2.copy(forwardAxisLocal).applyQuaternion(_quat).normalize()
    
    // Desired Target (Look at car + offset)
    desiredTarget.copy(_v3_1).addScaledVector(_up, lookHeight)
    
    // Desired Camera Position (Behind car)
    desiredCamPos.copy(_v3_1)
      .addScaledVector(_up, height)
      .addScaledVector(_v3_2, -distance)
  }

  function enter() {
    computeDesiredPose()
    camera.position.copy(desiredCamPos)
    controls.target.copy(desiredTarget)
    controls.update()
    controls.enabled = true
  }

  function exit() {
    controls.enabled = false
  }

  function update(dt) {
    computeDesiredPose()
    // Smoothly move the orbit center to follow car
    controls.target.lerp(desiredTarget, followLerp)
    controls.update()
  }

  return { enter, exit, update, controls }
}

/**
 * CHASE CAMERA
 * Physics-based spring arm that reacts to speed and acceleration.
 */
export function createChaseCameraControls(camera, targetObject, config = {}) {
  // Tunables (Tuned for seconds-based dt)
  const params = {
    baseHeight: config.baseHeight ?? 5.5,
    baseDistance: config.baseDistance ?? 12.0,
    speedPullback: config.speedPullback ?? 0.05, 
    maxPullback: config.maxPullback ?? 10.0,
    accelLag: config.accelLag ?? 0.1, 
    brakeLurch: config.brakeLurch ?? 0.1, 
    maxAccelEffect: config.maxAccelEffect ?? 3.0,
    springStiffness: config.springStiffness ?? 15.0, 
    springDamping: config.springDamping ?? 2.5,
    lookHeight: config.lookHeight ?? 1.0,
    lookAhead: config.lookAhead ?? 0.1,
    rollSensitivity: config.rollSensitivity ?? 0.2,
    maxRoll: config.maxRoll ?? (Math.PI / 14),
    rollDamping: config.rollDamping ?? 5.0,
    forwardAxisLocal: (config.forwardAxisLocal ?? new THREE.Vector3(0, 0, 1)).clone(),
  }

  // State (History)
  let roll = 0
  const camVel = new THREE.Vector3()
  const lastCarPos = new THREE.Vector3()
  const lastVel = new THREE.Vector3()
  const lastForward = new THREE.Vector3(0, 0, 1)

  // Dedicated Scratch Vectors for Physics Loop
  // (We declare these here so they are persistent per-camera, but reused per-frame)
  const carPos = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const vel = new THREE.Vector3()
  const accel = new THREE.Vector3()
  const desiredPos = new THREE.Vector3()
  const desiredTarget = new THREE.Vector3()
  const accelDir = new THREE.Vector3()
  const springForce = new THREE.Vector3()
  const dampingForce = new THREE.Vector3()

  function enter() {
    // Initialize state to prevent jump on first frame
    targetObject.getWorldPosition(lastCarPos)
    targetObject.getWorldQuaternion(_quat)
    forward.copy(params.forwardAxisLocal).applyQuaternion(_quat).normalize()
    lastForward.copy(forward)

    const v = targetObject.userData?.velocity
    if (v && v.isVector3) lastVel.copy(v)
    else lastVel.set(0, 0, 0)

    roll = 0
    camVel.set(0, 0, 0)

    // Snap camera to start position
    computeDesired(desiredPos, desiredTarget, forward, lastVel, _v3_1.set(0,0,0))
    camera.position.copy(desiredPos)
    camera.lookAt(desiredTarget)
  }

  function exit() {}

  /**
   * Calculates where the camera *wants* to be based on car speed/accel.
   * Writes results into 'outPos' and 'outTarget' to avoid allocation.
   */
  function computeDesired(outPos, outTarget, fwdWorld, vWorld, aWorld) {
    const speed = vWorld.length()
    const pullback = Math.min(params.maxPullback, speed * params.speedPullback)

    // Calculate Accel effects
    const accelMag = aWorld.length()
    if (accelMag > 1e-6) {
        accelDir.copy(aWorld).normalize()
    } else {
        accelDir.set(0,0,0)
    }

    const accelEffect = Math.min(params.maxAccelEffect, accelMag) * params.accelLag
    
    // Braking lurch (dot product of accel and forward)
    const forwardAccel = aWorld.dot(fwdWorld)
    const brakeBoost = forwardAccel < 0 ? Math.min(params.maxAccelEffect, -forwardAccel) * params.brakeLurch : 0

    // 1. Position Calculation
    outPos.copy(carPos)
      .addScaledVector(_up, params.baseHeight)
      .addScaledVector(fwdWorld, -(params.baseDistance + pullback)) // Move behind
      .addScaledVector(fwdWorld, brakeBoost) // Lurch forward if braking
    
    // Lag behind acceleration
    if (accelMag > 1e-6) {
        outPos.addScaledVector(accelDir, -accelEffect)
    }

    // 2. Look Target Calculation
    outTarget.copy(carPos)
      .addScaledVector(_up, params.lookHeight)
      .addScaledVector(fwdWorld, speed * params.lookAhead)
  }

  function update(dt) {
    // Safety check for dt
    dt = Math.min(0.1, dt) 
    if (dt <= 0.0001) return

    // --- 1. Read Car State ---
    targetObject.getWorldPosition(carPos)
    targetObject.getWorldQuaternion(_quat)
    forward.copy(params.forwardAxisLocal).applyQuaternion(_quat).normalize()

    // --- 2. Determine Velocity ---
    // Prefer explicit velocity from physics engine/main logic
    const vUser = targetObject.userData?.velocity
    if (vUser && vUser.isVector3) {
      vel.copy(vUser)
    } else {
      // Fallback: Estimate from position change (can be jittery)
      vel.copy(carPos).sub(lastCarPos).multiplyScalar(1 / dt)
    }

    // --- 3. Determine Acceleration ---
    accel.copy(vel).sub(lastVel).multiplyScalar(1 / dt)

    // --- 4. Compute Ideal State ---
    computeDesired(desiredPos, desiredTarget, forward, vel, accel)

    // --- 5. Spring Physics Integration ---
    // F_spring = k * (target - current)
    springForce.copy(desiredPos).sub(camera.position).multiplyScalar(params.springStiffness)
    
    // F_damp = -c * velocity
    dampingForce.copy(camVel).multiplyScalar(-params.springDamping)
    
    // Acceleration = Force (assuming mass=1)
    // Reuse springForce vector to sum forces
    springForce.add(dampingForce)
    
    // Euler Integration
    // v += a * dt
    camVel.addScaledVector(springForce, dt)
    // x += v * dt
    camera.position.addScaledVector(camVel, dt)

    // --- 6. Banking (Roll) ---
    // Calculate turn rate from change in forward vector
    _v3_1.crossVectors(lastForward, forward) // _v3_1 is scratch
    const sign = Math.sign(_v3_1.dot(_up)) || 1
    const dot = THREE.MathUtils.clamp(lastForward.dot(forward), -1, 1)
    const angle = Math.acos(dot)
    const turnRate = (angle / dt) * sign

    const rollTarget = THREE.MathUtils.clamp(
      turnRate * params.rollSensitivity,
      -params.maxRoll,
      params.maxRoll
    )
    
    // Smooth roll
    const rollAlpha = 1 - Math.exp(-params.rollDamping * dt)
    roll = THREE.MathUtils.lerp(roll, rollTarget, rollAlpha)

    // --- 7. Apply Rotation ---
    _mat.lookAt(camera.position, desiredTarget, _up)
    camera.quaternion.setFromRotationMatrix(_mat)
    camera.rotateZ(roll)

    // --- 8. Save History ---
    lastCarPos.copy(carPos)
    lastVel.copy(vel)
    lastForward.copy(forward)
  }

  return { enter, exit, update }
}

/**
 * FIRST PERSON CAMERA
 * Locked offset relative to the car.
 */
export function createFirstPersonCameraControls(camera, targetObject, config = {}) {
  const localOffset = config.offset || new THREE.Vector3(0, 0.8, 1.0)
  const offset = new THREE.Vector3()

  function enter() {}
  function exit() {}
  
  function update(dt) {
    targetObject.getWorldPosition(_v3_1)
    targetObject.getWorldQuaternion(_quat)
    
    offset.copy(localOffset).applyQuaternion(_quat)
    
    camera.position.copy(_v3_1).add(offset)
    camera.quaternion.copy(_quat)
  }
  
  return { enter, exit, update }
}