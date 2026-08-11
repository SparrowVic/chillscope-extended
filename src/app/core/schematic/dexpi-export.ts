import type { MachineSchematic, SchematicNodeType } from './schematic.models';

/**
 * XML export in a structure modelled on the DEXPI/Proteus PlantModel (configurator spec §5):
 * `Equipment` with `Nozzle`s per pipe connection, `PipingNetworkSegment`s joining nozzles, and
 * `ProcessInstrumentationFunction`s for the sensors. Deliberately and explicitly *inspired by
 * DEXPI/Proteus, not conformant* — the header comment of every exported file says so.
 */
const COMPONENT_CLASS: Readonly<Record<SchematicNodeType, string>> = {
  pump: 'Pump',
  heatExchanger: 'HeatExchanger',
  reservoir: 'Tank',
  machine: 'CustomEquipment',
  valve: 'Valve',
  heater: 'Heater',
  compressor: 'Compressor',
  condenser: 'Condenser',
  expansionValve: 'ExpansionValve',
  evaporator: 'Evaporator',
  filterDrier: 'FilterDrier',
  sightGlass: 'SightGlass',
  strainer: 'Strainer',
  safetyValve: 'SafetyValve',
};

export function toDexpiInspiredXml(doc: MachineSchematic): string {
  const nozzleCounters = new Map<string, number>();
  const nextNozzle = (nodeId: string): string => {
    const n = (nozzleCounters.get(nodeId) ?? 0) + 1;
    nozzleCounters.set(nodeId, n);
    return `${nodeId}-N${n}`;
  };

  const segments = doc.pipes.map((pipe, index) => ({
    id: `PNS-${index + 1}`,
    side: pipe.side,
    fromNozzle: nextNozzle(pipe.from),
    toNozzle: nextNozzle(pipe.to),
  }));

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Machine schematic export: inspired by DEXPI/Proteus, not conformant. -->',
    `<PlantModel ID=${attr(doc.id)} Name=${attr(doc.name)} Revision=${attr(doc.revision)} ProfileId=${attr(doc.profileId)} OriginatingSystem="chillscope">`,
  ];

  for (const node of doc.nodes) {
    const head = `  <Equipment ID=${attr(node.id)} ComponentClass=${attr(COMPONENT_CLASS[node.type])} ComponentName=${attr(node.label)}`;
    const count = nozzleCounters.get(node.id) ?? 0;
    if (count === 0) {
      lines.push(`${head}/>`);
      continue;
    }
    lines.push(`${head}>`);
    for (let n = 1; n <= count; n += 1) {
      lines.push(`    <Nozzle ID=${attr(`${node.id}-N${n}`)}/>`);
    }
    lines.push('  </Equipment>');
  }

  for (const segment of segments) {
    lines.push(`  <PipingNetworkSegment ID=${attr(segment.id)} Side=${attr(segment.side)}>`);
    lines.push(
      `    <Connection FromID=${attr(segment.fromNozzle)} ToID=${attr(segment.toNozzle)}/>`,
    );
    lines.push('  </PipingNetworkSegment>');
  }

  for (const instrument of doc.instruments) {
    const open = `  <ProcessInstrumentationFunction ID=${attr(instrument.tag)} TagName=${attr(instrument.tag)} Series=${attr(instrument.series)} AttachedTo=${attr(instrument.attachTo)}`;
    if (instrument.thresholds) {
      const t = instrument.thresholds;
      lines.push(`${open}>`);
      lines.push(
        `    <AlarmThresholds WarningMin=${attr(t.warningMin)} WarningMax=${attr(t.warningMax)} CriticalMin=${attr(t.criticalMin)} CriticalMax=${attr(t.criticalMax)}/>`,
      );
      lines.push('  </ProcessInstrumentationFunction>');
    } else {
      lines.push(`${open}/>`);
    }
  }

  lines.push('</PlantModel>');
  return `${lines.join('\n')}\n`;
}

/** A quoted, escaped XML attribute value. */
function attr(value: string | number): string {
  return `"${escapeXml(String(value))}"`;
}

function escapeXml(value: string): string {
  return [...value]
    .map((character) => (isXmlCodePoint(character.codePointAt(0) ?? 0) ? character : '�'))
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isXmlCodePoint(value: number): boolean {
  return (
    value === 0x09 ||
    value === 0x0a ||
    value === 0x0d ||
    (value >= 0x20 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff)
  );
}
