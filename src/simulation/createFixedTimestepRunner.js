// src/simulation/createFixedTimestepRunner.js

export function createFixedTimestepRunner(config = {}) {
  const fixedTimeStepSeconds = config.fixedTimeStepSeconds
  const maxFrameDeltaSeconds = config.maxFrameDeltaSeconds
  const maxStepsPerFrame = config.maxStepsPerFrame
  const step = config.step

  if (!Number.isFinite(fixedTimeStepSeconds) || fixedTimeStepSeconds <= 0) {
    throw new Error('createFixedTimestepRunner requires a positive fixedTimeStepSeconds.')
  }

  if (!Number.isFinite(maxFrameDeltaSeconds) || maxFrameDeltaSeconds <= 0) {
    throw new Error('createFixedTimestepRunner requires a positive maxFrameDeltaSeconds.')
  }

  if (!Number.isInteger(maxStepsPerFrame) || maxStepsPerFrame <= 0) {
    throw new Error('createFixedTimestepRunner requires a positive integer maxStepsPerFrame.')
  }

  if (typeof step !== 'function') {
    throw new Error('createFixedTimestepRunner requires a step function.')
  }

  let physicsAccumulatorSeconds = 0

  const snapshot = {
    fixedTimeStepSeconds,
    maxFrameDeltaSeconds,
    maxStepsPerFrame,
    frameDeltaSeconds: 0,
    clampedFrameDeltaSeconds: 0,
    stepsRun: 0,
    accumulatorSeconds: 0,
    droppedTimeSeconds: 0,
    didDropTime: false,
  }

  function update(frameDeltaSeconds) {
    snapshot.frameDeltaSeconds = Number.isFinite(frameDeltaSeconds)
      ? frameDeltaSeconds
      : 0
    snapshot.clampedFrameDeltaSeconds = 0
    snapshot.stepsRun = 0
    snapshot.droppedTimeSeconds = 0
    snapshot.didDropTime = false

    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) {
      snapshot.accumulatorSeconds = physicsAccumulatorSeconds
      return snapshot
    }

    const clampedFrameDeltaSeconds = Math.min(
      frameDeltaSeconds,
      maxFrameDeltaSeconds
    )

    snapshot.clampedFrameDeltaSeconds = clampedFrameDeltaSeconds
    physicsAccumulatorSeconds += clampedFrameDeltaSeconds

    while (
      physicsAccumulatorSeconds >= fixedTimeStepSeconds &&
      snapshot.stepsRun < maxStepsPerFrame
    ) {
      step(fixedTimeStepSeconds)
      physicsAccumulatorSeconds -= fixedTimeStepSeconds
      snapshot.stepsRun += 1
    }

    if (physicsAccumulatorSeconds >= fixedTimeStepSeconds) {
      snapshot.droppedTimeSeconds = physicsAccumulatorSeconds
      snapshot.didDropTime = true

      // Discard leftover catch-up time so a slow frame cannot create a
      // persistent backlog that keeps future rendered frames overloaded.
      physicsAccumulatorSeconds = 0
    }

    snapshot.accumulatorSeconds = physicsAccumulatorSeconds
    return snapshot
  }

  function reset() {
    physicsAccumulatorSeconds = 0
    snapshot.frameDeltaSeconds = 0
    snapshot.clampedFrameDeltaSeconds = 0
    snapshot.stepsRun = 0
    snapshot.accumulatorSeconds = 0
    snapshot.droppedTimeSeconds = 0
    snapshot.didDropTime = false

    return snapshot
  }

  function getSnapshot() {
    return snapshot
  }

  return {
    update,
    reset,
    getSnapshot,
  }
}
