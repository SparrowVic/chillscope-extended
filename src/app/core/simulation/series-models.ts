import type { SeriesId } from '../data/series.catalog';
import { hashToUnit, valueNoise } from './random';
import { clamp } from '../math';

/**
 * The pump is either doing work or waiting for the next batch. Standby is a normal operating state,
 * not a fault: it stays inside every alarm band, otherwise the alarm list fills up with "the machine
 * is not running right now" instead of things worth looking at.
 */
export type MachineState = 'running' | 'standby';

/** One strategy per series: adding a fifth signal means adding a model and a catalogue entry. */
export interface SeriesModel {
  readonly id: SeriesId;
  sampleAt(timestamp: number, seed: number): number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const TEMPERATURE_BASE = 62;
const PRESSURE_BASE = 4.2;
const NOMINAL_RPM = 2800;
const STANDBY_RPM = 1200;

const STANDBY_SLOT = 2 * HOUR;
const STANDBY_PROBABILITY = 0.18;
const STANDBY_TEMPERATURE_DROP = 3;
const STANDBY_PRESSURE_DROP = 0.35;

const TEMPERATURE_SALT = 0x9e3779b1;
const STANDBY_SALT = 0x27d4eb2d;
const RPM_STEP_SALT = 0x165667b1;
const RPM_JITTER_SALT = 0x5bf03635;
const PRESSURE_SALT = 0x1f83d9ab;
const FLOW_SALT = 0x2545f491;

/**
 * A deterministic bell-shaped event: at most one per window, placed by the seed, zero everywhere
 * else. Every anomaly in the plant is built from this, so the same seed always tells the same story
 * however the range is sliced.
 */
interface AnomalyShape {
  readonly windowMs: number;
  readonly probability: number;
  /** Half of the event width, as a fraction of the window. */
  readonly halfWidth: number;
  readonly salt: number;
  readonly offsetSalt: number;
}

/** Cooling falls behind and the coolant runs hot. */
const OVERHEAT: AnomalyShape = {
  windowMs: 4 * HOUR,
  probability: 0.2,
  halfWidth: 0.1,
  salt: 0x85ebca6b,
  offsetSalt: 0xc2b2ae35,
};

/** A clogging filter: head builds up in front of it while the pump pushes less through. */
const BLOCKAGE: AnomalyShape = {
  windowMs: 6 * HOUR,
  probability: 0.18,
  halfWidth: 0.09,
  salt: 0x7feb352d,
  offsetSalt: 0x846ca68b,
};

/** The speed controller overshoots and the pump runs above its nominal speed for a while. */
const OVERSPEED: AnomalyShape = {
  windowMs: 8 * HOUR,
  probability: 0.18,
  halfWidth: 0.06,
  salt: 0x9e3779b9,
  offsetSalt: 0x6a09e667,
};

/** The motor loses torque: speed, flow and head collapse together while the machine is running. */
const MOTOR_FAULT: AnomalyShape = {
  windowMs: 8 * HOUR,
  probability: 0.15,
  halfWidth: 0.05,
  salt: 0xbb67ae85,
  offsetSalt: 0x3c6ef372,
};

const OVERHEAT_PEAK = 22;
const BLOCKAGE_PRESSURE_RISE = 1.5;
const BLOCKAGE_FLOW_LOSS = 0.75;
const OVERSPEED_RPM_GAIN = 0.22;
const OVERSPEED_PRESSURE_RISE = 0.4;
const MOTOR_FAULT_RPM_LOSS = 0.72;
const MOTOR_FAULT_FLOW_LOSS = 0.35;
const MOTOR_FAULT_PRESSURE_DROP = 2;
const MOTOR_FAULT_TEMPERATURE_DROP = 10;


function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** The machine works in whole two-hour slots, which is what makes the load steps visible. */
export function machineStateAt(timestamp: number, seed: number): MachineState {
  const slot = Math.floor(timestamp / STANDBY_SLOT);
  return hashToUnit(seed ^ STANDBY_SALT, slot) < STANDBY_PROBABILITY ? 'standby' : 'running';
}

function intensity(timestamp: number, seed: number, shape: AnomalyShape): number {
  const window = Math.floor(timestamp / shape.windowMs);
  if (hashToUnit(seed ^ shape.salt, window) >= shape.probability) {
    return 0;
  }
  const centre = 0.15 + hashToUnit(seed ^ shape.offsetSalt, window) * 0.7;
  const phase = (timestamp % shape.windowMs) / shape.windowMs;
  const distance = (phase - centre) / shape.halfWidth;
  if (distance <= -1 || distance >= 1) {
    return 0;
  }
  return Math.cos((distance * Math.PI) / 2) ** 2;
}

/** A machine that is not turning cannot overheat, clog or overspeed. */
function anomalyAt(timestamp: number, seed: number, shape: AnomalyShape): number {
  return machineStateAt(timestamp, seed) === 'standby' ? 0 : intensity(timestamp, seed, shape);
}

function temperatureAt(timestamp: number, seed: number): number {
  const daily = Math.sin(((timestamp % DAY) / DAY) * Math.PI * 2) * 6;
  const drift = (valueNoise(seed, timestamp / (4 * HOUR)) - 0.5) * 5;
  const jitter = (hashToUnit(seed ^ TEMPERATURE_SALT, Math.floor(timestamp / MINUTE)) - 0.5) * 0.9;
  const standby = machineStateAt(timestamp, seed) === 'standby' ? -STANDBY_TEMPERATURE_DROP : 0;
  const overheat = anomalyAt(timestamp, seed, OVERHEAT) * OVERHEAT_PEAK;
  const cooling = anomalyAt(timestamp, seed, MOTOR_FAULT) * MOTOR_FAULT_TEMPERATURE_DROP;
  const raw = TEMPERATURE_BASE + daily + drift + jitter + standby + overheat - cooling;
  return clamp(roundTo(raw, 2), 20, 120);
}

function pressureAt(timestamp: number, seed: number): number {
  const deviation = temperatureAt(timestamp, seed) - TEMPERATURE_BASE;
  const jitter = (valueNoise(seed ^ PRESSURE_SALT, timestamp / HOUR) - 0.5) * 0.25;
  const standby = machineStateAt(timestamp, seed) === 'standby' ? -STANDBY_PRESSURE_DROP : 0;
  const blockage = anomalyAt(timestamp, seed, BLOCKAGE) * BLOCKAGE_PRESSURE_RISE;
  const overspeed = anomalyAt(timestamp, seed, OVERSPEED) * OVERSPEED_PRESSURE_RISE;
  const motorFault = anomalyAt(timestamp, seed, MOTOR_FAULT) * MOTOR_FAULT_PRESSURE_DROP;
  const raw =
    PRESSURE_BASE - deviation * 0.025 + jitter + standby + blockage + overspeed - motorFault;
  return clamp(roundTo(raw, 3), 0, 8);
}

function rpmAt(timestamp: number, seed: number): number {
  const jitter = (valueNoise(seed ^ RPM_JITTER_SALT, timestamp / (30 * MINUTE)) - 0.5) * 60;
  if (machineStateAt(timestamp, seed) === 'standby') {
    return clamp(Math.round(STANDBY_RPM + jitter), 0, 4000);
  }
  const step = hashToUnit(seed ^ RPM_STEP_SALT, Math.floor(timestamp / STANDBY_SLOT));
  const level = step > 0.66 ? NOMINAL_RPM : step > 0.33 ? 2200 : 1600;
  const gain =
    1 +
    anomalyAt(timestamp, seed, OVERSPEED) * OVERSPEED_RPM_GAIN -
    anomalyAt(timestamp, seed, MOTOR_FAULT) * MOTOR_FAULT_RPM_LOSS;
  return clamp(Math.round(level * gain + jitter), 0, 4000);
}

function flowAt(timestamp: number, seed: number): number {
  const pumpLoad = rpmAt(timestamp, seed) / NOMINAL_RPM;
  const head = clamp(pressureAt(timestamp, seed) / PRESSURE_BASE, 0, 1.4);
  const jitter = (valueNoise(seed ^ FLOW_SALT, timestamp / (20 * MINUTE)) - 0.5) * 3;
  const restriction =
    1 -
    anomalyAt(timestamp, seed, BLOCKAGE) * BLOCKAGE_FLOW_LOSS -
    anomalyAt(timestamp, seed, MOTOR_FAULT) * MOTOR_FAULT_FLOW_LOSS;
  return clamp(roundTo(pumpLoad * 95 * head * restriction + jitter, 1), 0, 200);
}

export const SERIES_MODELS: Readonly<Record<SeriesId, SeriesModel>> = {
  temperature: { id: 'temperature', sampleAt: temperatureAt },
  pressure: { id: 'pressure', sampleAt: pressureAt },
  flow: { id: 'flow', sampleAt: flowAt },
  rpm: { id: 'rpm', sampleAt: rpmAt },
};
