import { describe, expect, it } from 'vitest';
import { toDexpiInspiredXml } from './dexpi-export';
import { K207_SCHEMATIC } from './k207.schematic';
import type { MachineSchematic } from './schematic.models';

describe('toDexpiInspiredXml', () => {
  const xml = toDexpiInspiredXml(K207_SCHEMATIC);

  it('opens with the XML declaration and the non-conformance disclaimer', () => {
    const [first, second] = xml.split('\n');
    expect(first).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    expect(second).toContain('inspired by DEXPI/Proteus, not conformant');
  });

  it('wraps everything in a PlantModel carrying the document header', () => {
    expect(xml).toContain(
      '<PlantModel ID="K-207" Name="Chiller K-207" Revision="B/rev.07" ProfileId="chiller" OriginatingSystem="chillscope">',
    );
    expect(xml.trimEnd().endsWith('</PlantModel>')).toBe(true);
  });

  it('exports one Equipment per node with its DEXPI-style component class', () => {
    expect(xml.match(/<Equipment /g)).toHaveLength(4);
    expect(xml).toContain('<Equipment ID="P1" ComponentClass="Pump" ComponentName="PUMP P-1">');
    expect(xml).toContain('ComponentClass="HeatExchanger"');
    expect(xml).toContain('ComponentClass="Tank"');
    expect(xml).toContain('ComponentClass="CustomEquipment"');
  });

  it('gives every equipment one nozzle per pipe connection', () => {
    for (const nodeId of ['P1', 'W1', 'Z1', 'M1']) {
      expect(xml).toContain(`<Nozzle ID="${nodeId}-N1"/>`);
      expect(xml).toContain(`<Nozzle ID="${nodeId}-N2"/>`);
      expect(xml).not.toContain(`<Nozzle ID="${nodeId}-N3"/>`);
    }
  });

  it('joins nozzles through PipingNetworkSegments in document pipe order', () => {
    expect(xml).toContain('<PipingNetworkSegment ID="PNS-1" Side="cold">');
    expect(xml).toContain('<Connection FromID="Z1-N1" ToID="P1-N1"/>');
    expect(xml).toContain('<PipingNetworkSegment ID="PNS-3" Side="hot">');
    expect(xml).toContain('<Connection FromID="M1-N2" ToID="W1-N1"/>');
    expect(xml.match(/<PipingNetworkSegment /g)).toHaveLength(4);
  });

  it('exports every instrument as a ProcessInstrumentationFunction', () => {
    expect(xml.match(/<ProcessInstrumentationFunction /g)).toHaveLength(4);
    expect(xml).toContain(
      '<ProcessInstrumentationFunction ID="TT-101" TagName="TT-101" Series="temperature" AttachedTo="M1"/>',
    );
  });

  it('serialises threshold overrides as a nested AlarmThresholds element', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      instruments: [
        {
          tag: 'TT-101',
          series: 'temperature',
          attachTo: 'M1',
          thresholds: { warningMin: 40, warningMax: 70, criticalMin: 35, criticalMax: 80 },
        },
      ],
    };
    const exported = toDexpiInspiredXml(doc);
    expect(exported).toContain(
      '<AlarmThresholds WarningMin="40" WarningMax="70" CriticalMin="35" CriticalMax="80"/>',
    );
    expect(exported).toContain('</ProcessInstrumentationFunction>');
  });

  it('escapes XML metacharacters in attribute values', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      name: 'A & B <"quoted"> \'x\'',
    };
    const exported = toDexpiInspiredXml(doc);
    expect(exported).toContain('Name="A &amp; B &lt;&quot;quoted&quot;&gt; &apos;x&apos;"');
    expect(exported).not.toContain('<"');
  });

  it('replaces code points forbidden by XML 1.0', () => {
    const doc: MachineSchematic = { ...K207_SCHEMATIC, name: 'Control\u0000character' };
    const exported = toDexpiInspiredXml(doc);

    expect(exported).toContain('Name="Control�character"');
    expect(exported).not.toContain('\u0000');
  });
});
