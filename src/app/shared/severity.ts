/**
 * One vocabulary for "how bad is this value". Every screen that badges a measurement, a tile or
 * an alarm renders it through the shared `.cs-tag` recipe in styles.css, so the treatment cannot
 * drift apart between the Dashboard, the Measurements table and the Alarms list.
 */
export type MeasurementStatus = 'ok' | 'warning' | 'critical';
