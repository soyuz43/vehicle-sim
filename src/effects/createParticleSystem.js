// src/effects/createParticleSystem.js

/**
 * Visual-only particle system (Phase 3).
 *
 * A fixed-capacity pool of points rendered with a small custom shader so each
 * particle can fade and size independently. Particles are emitted from physics
 * events (water spray, dust/mud, snow, collision debris) but never influence
 * simulation state or determinism: emission is driven by deterministic physics
 * queries, and stepping uses a fixed timestep plus a seeded PRNG, so repeated
 * runs with identical inputs reproduce identical particle motion.
 *
 * The hot paths (emit, step) only write into preallocated typed arrays; no
 * objects are allocated per particle or per frame.
 */

import * as THREE from 'three'

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const DEFAULT_MAX_PARTICLES = 2000

// Per-kind presets. Colors are linear-ish sRGB floats; sizes are world meters
// before perspective attenuation.
const PARTICLE_PRESETS = Object.freeze({
  'water-spray': Object.freeze({
    color: [0.55, 0.78, 0.95],
    sizeMeters: 0.16,
    speedMetersPerSecond: 3.2,
    spread: 0.9,
    lifeSeconds: 0.9,
    gravityScale: 1.0,
    dragPerSecond: 1.2,
  }),
  'mud': Object.freeze({
    color: [0.29, 0.21, 0.15],
    sizeMeters: 0.18,
    speedMetersPerSecond: 1.6,
    spread: 0.7,
    lifeSeconds: 1.1,
    gravityScale: 1.1,
    dragPerSecond: 1.6,
  }),
  'dust': Object.freeze({
    color: [0.62, 0.52, 0.4],
    sizeMeters: 0.26,
    speedMetersPerSecond: 1.1,
    spread: 0.6,
    lifeSeconds: 1.4,
    gravityScale: 0.25,
    dragPerSecond: 1.0,
  }),
  'snow': Object.freeze({
    color: [0.95, 0.97, 1.0],
    sizeMeters: 0.22,
    speedMetersPerSecond: 0.9,
    spread: 0.7,
    lifeSeconds: 1.6,
    gravityScale: 0.3,
    dragPerSecond: 0.9,
  }),
  'debris': Object.freeze({
    color: [0.45, 0.4, 0.36],
    sizeMeters: 0.14,
    speedMetersPerSecond: 3.0,
    spread: 1.0,
    lifeSeconds: 1.0,
    gravityScale: 1.0,
    dragPerSecond: 0.8,
  }),
})

const VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (320.0 / max(0.001, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    vec2 offset = gl_PointCoord - vec2(0.5);
    if (dot(offset, offset) > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`

export function createParticleSystem(config = {}) {
  const maxParticles = Math.max(1, Math.floor(sanitizeNumber(config.maxParticles, DEFAULT_MAX_PARTICLES)))
  const gravityScaleGlobal = sanitizeNumber(config.gravityMetersPerSecondSquared, GRAVITY_METERS_PER_SECOND_SQUARED)
  const seed = sanitizeNumber(config.seed, 0x9e3779b9)

  const positions = new Float32Array(maxParticles * 3)
  const colors = new Float32Array(maxParticles * 3)
  const alphas = new Float32Array(maxParticles)
  const sizes = new Float32Array(maxParticles)
  const velocities = new Float32Array(maxParticles * 3)
  const lifeSeconds = new Float32Array(maxParticles)
  const maxLifeSeconds = new Float32Array(maxParticles)
  const gravityScale = new Float32Array(maxParticles)
  const dragPerSecond = new Float32Array(maxParticles)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setDrawRange(0, maxParticles)

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })

  const points = new THREE.Points(geometry, material)
  points.name = config.name ?? 'phase3-particle-system'
  points.frustumCulled = false

  let cursor = 0
  let emittedCount = 0
  let activeCount = 0
  let rngState = seed >>> 0

  function nextRandom() {
    // mulberry32 deterministic PRNG.
    rngState = (rngState + 0x6d2b79f5) >>> 0
    let t = rngState
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function emit(kind, x, y, z, count = 1) {
    const preset = PARTICLE_PRESETS[kind]
    if (!preset) return
    const n = Math.max(1, Math.floor(count))
    for (let k = 0; k < n; k += 1) {
      const index = cursor
      cursor = (cursor + 1) % maxParticles

      const angle = nextRandom() * Math.PI * 2
      const speed = preset.speedMetersPerSecond * (0.5 + 0.5 * nextRandom())
      const horizontal = speed * preset.spread
      const vx = Math.cos(angle) * horizontal
      const vz = Math.sin(angle) * horizontal
      const vy = speed * (0.6 + 0.6 * nextRandom())

      positions[index * 3] = sanitizeNumber(x)
      positions[index * 3 + 1] = sanitizeNumber(y)
      positions[index * 3 + 2] = sanitizeNumber(z)

      velocities[index * 3] = vx
      velocities[index * 3 + 1] = vy
      velocities[index * 3 + 2] = vz

      colors[index * 3] = preset.color[0]
      colors[index * 3 + 1] = preset.color[1]
      colors[index * 3 + 2] = preset.color[2]

      const life = preset.lifeSeconds * (0.7 + 0.3 * nextRandom())
      lifeSeconds[index] = life
      maxLifeSeconds[index] = life
      alphas[index] = 1
      sizes[index] = preset.sizeMeters * (0.8 + 0.4 * nextRandom())
      gravityScale[index] = preset.gravityScale
      dragPerSecond[index] = preset.dragPerSecond

      emittedCount += 1
    }
  }

  function step(deltaTimeSeconds) {
    const dt = sanitizeNonNegativeNumber(deltaTimeSeconds, 0)
    let alive = 0
    for (let index = 0; index < maxParticles; index += 1) {
      const life = lifeSeconds[index]
      if (life <= 0) {
        if (alphas[index] !== 0) alphas[index] = 0
        continue
      }

      const newLife = life - dt
      if (newLife <= 0) {
        lifeSeconds[index] = 0
        alphas[index] = 0
        sizes[index] = 0
        continue
      }
      lifeSeconds[index] = newLife

      const drag = Math.max(0, 1 - dragPerSecond[index] * dt)
      velocities[index * 3] *= drag
      velocities[index * 3 + 1] *= drag
      velocities[index * 3 + 2] *= drag
      velocities[index * 3 + 1] -= gravityScaleGlobal * gravityScale[index] * dt

      positions[index * 3] += velocities[index * 3] * dt
      positions[index * 3 + 1] += velocities[index * 3 + 1] * dt
      positions[index * 3 + 2] += velocities[index * 3 + 2] * dt

      alphas[index] = Math.min(1, newLife / maxLifeSeconds[index])
      alive += 1
    }
    activeCount = alive
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aColor.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
    geometry.attributes.aSize.needsUpdate = true
    return getSnapshot()
  }

  function reset() {
    lifeSeconds.fill(0)
    alphas.fill(0)
    sizes.fill(0)
    velocities.fill(0)
    emittedCount = 0
    activeCount = 0
    cursor = 0
    geometry.attributes.aAlpha.needsUpdate = true
    geometry.attributes.aSize.needsUpdate = true
    geometry.attributes.position.needsUpdate = true
  }

  function getSnapshot() {
    let alive = 0
    for (let index = 0; index < maxParticles; index += 1) {
      if (lifeSeconds[index] > 0) alive += 1
    }
    activeCount = alive
    return {
      maxParticles,
      activeCount,
      emittedCount,
    }
  }

  return {
    kind: 'particle-system-v1',
    object3D: points,
    emit,
    step,
    reset,
    getSnapshot,
  }
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizeNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}