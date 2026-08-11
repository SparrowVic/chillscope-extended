interface ValidationMessageRule {
  readonly key: string;
  readonly pattern: RegExp;
}

const VALIDATION_COPY_RULES = [
  {
    key: 'machines.validation.documentObject',
    pattern: /^Schematic document must be a JSON object\.$/,
  },
  {
    key: 'machines.validation.profileIdAllowed',
    pattern: /^"profileId" (?<value>.+) must be one of (?<allowed>.+)\.$/,
  },
  {
    key: 'machines.validation.nodeInstrumentUnknown',
    pattern: /^Node "(?<nodeId>.*?)" references unknown instrument tag "(?<tag>.*)"\.$/,
  },
  {
    key: 'machines.validation.nodeInstrumentAttachment',
    pattern:
      /^Node "(?<nodeId>.*?)" uses instrument tag "(?<tag>.*?)", but that instrument is attached to "(?<attachedTo>.*)"\.$/,
  },
  {
    key: 'machines.validation.collectionArray',
    pattern: /^"(?<collection>nodes|pipes|instruments)" must be an array\.$/,
  },
  {
    key: 'machines.validation.collectionLimit',
    pattern:
      /^"(?<collection>nodes|pipes|instruments)" must contain at most (?<limit>\d+) entries\.$/,
  },
  {
    key: 'machines.validation.duplicateNodeId',
    pattern: /^Duplicate node id "(?<nodeId>.*)" — node ids must be unique\.$/,
  },
  {
    key: 'machines.validation.nodeCollision',
    pattern:
      /^Nodes "(?<firstId>.*?)" and "(?<secondId>.*?)" collide at grid \[(?<column>-?\d+), (?<row>-?\d+)\]\.$/,
  },
  {
    key: 'machines.validation.nodeOverlap',
    pattern:
      /^Nodes "(?<firstId>.*?)" at grid \[(?<firstColumn>-?\d+), (?<firstRow>-?\d+)\] and "(?<secondId>.*?)" at grid \[(?<secondColumn>-?\d+), (?<secondRow>-?\d+)\] have overlapping symbol boxes\.$/,
  },
  {
    key: 'machines.validation.pathObject',
    pattern: /^(?<path>(?:nodes|pipes|instruments)\[\d+\]) must be an object\.$/,
  },
  {
    key: 'machines.validation.unknownNodeType',
    pattern:
      /^(?<path>nodes\[\d+\]): unknown node type (?<value>.+) — expected one of (?<allowed>.+)\.$/,
  },
  {
    key: 'machines.validation.gridIntegerPair',
    pattern: /^(?<path>nodes\[\d+\]): "grid" must be a \[column, row\] pair of integers\.$/,
  },
  {
    key: 'machines.validation.gridNonNegative',
    pattern:
      /^(?<path>nodes\[\d+\]): grid position \[(?<column>-?\d+), (?<row>-?\d+)\] must be non-negative\.$/,
  },
  {
    key: 'machines.validation.gridSafeInteger',
    pattern:
      /^(?<path>nodes\[\d+\]): grid position \[(?<column>[^,\]]+), (?<row>[^\]]+)\] must use safe integers\.$/,
  },
  {
    key: 'machines.validation.gridMaximum',
    pattern:
      /^(?<path>nodes\[\d+\]): grid position \[(?<column>[^,\]]+), (?<row>[^\]]+)\] must not exceed (?<maximum>\d+) on either axis\.$/,
  },
  {
    key: 'machines.validation.optionalBoolean',
    pattern:
      /^(?<path>nodes\[\d+\]): "(?<field>level|heatSource)" must be a boolean when present\.$/,
  },
  {
    key: 'machines.validation.nodeTagFormat',
    pattern:
      /^(?<path>nodes\[\d+\]): node tag (?<value>.+) must match the ISA format LL-NNN \(e\.g\. "ST-104"\)\.$/,
  },
  {
    key: 'machines.validation.nodePrimaryInstrument',
    pattern:
      /^(?<path>nodes\[\d+\]): node type "(?<nodeType>.*?)" does not accept primary instrument tag "(?<tag>.*)"\.$/,
  },
  {
    key: 'machines.validation.reservoirLevel',
    pattern: /^(?<path>nodes\[\d+\]): "level" is only valid for reservoir nodes\.$/,
  },
  {
    key: 'machines.validation.machineHeatSource',
    pattern: /^(?<path>nodes\[\d+\]): "heatSource" is only valid for machine nodes\.$/,
  },
  {
    key: 'machines.validation.pipeSide',
    pattern: /^(?<path>pipes\[\d+\]): side (?<value>.+) must be "cold" or "hot"\.$/,
  },
  {
    key: 'machines.validation.nodeReference',
    pattern:
      /^(?<path>(?:pipes|instruments)\[\d+\]): "(?<field>from|to|attachTo)" references unknown node "(?<nodeId>.*)"\.$/,
  },
  {
    key: 'machines.validation.pipeSelf',
    pattern: /^(?<path>pipes\[\d+\]): a pipe cannot connect node "(?<nodeId>.*)" to itself\.$/,
  },
  {
    key: 'machines.validation.pipeDuplicate',
    pattern: /^(?<path>pipes\[\d+\]): duplicate pipe connection "(?<from>.*?)" → "(?<to>.*)"\.$/,
  },
  {
    key: 'machines.validation.instrumentTagFormat',
    pattern:
      /^(?<path>instruments\[\d+\]): tag (?<value>.+) must match the ISA format LL-NNN \(e\.g\. "TT-101"\)\.$/,
  },
  {
    key: 'machines.validation.duplicateInstrumentTag',
    pattern: /^Duplicate instrument tag "(?<tag>.*)" — instrument tags must be unique\.$/,
  },
  {
    key: 'machines.validation.seriesId',
    pattern:
      /^(?<path>instruments\[\d+\]): series (?<value>.+) is not a known series id \(valid: (?<allowed>.+)\)\.$/,
  },
  {
    key: 'machines.validation.thresholdOrder',
    pattern:
      /^(?<path>instruments\[\d+\]): "thresholds" must provide finite numbers ordered as criticalMin < warningMin < warningMax < criticalMax\.$/,
  },
  {
    key: 'machines.validation.fieldRequiredAtPath',
    pattern:
      /^(?<path>(?:nodes|pipes|instruments)\[\d+\]): "(?<field>[^"]+)" must be a non-empty string\.$/,
  },
  {
    key: 'machines.validation.fieldRequired',
    pattern: /^"(?<field>[^"]+)" must be a non-empty string\.$/,
  },
  {
    key: 'machines.validation.fieldLengthAtPath',
    pattern:
      /^(?<path>(?:nodes|pipes|instruments)\[\d+\]): "(?<field>[^"]+)" must contain at most (?<limit>\d+) characters\.$/,
  },
  {
    key: 'machines.validation.fieldLength',
    pattern: /^"(?<field>[^"]+)" must contain at most (?<limit>\d+) characters\.$/,
  },
  {
    key: 'machines.validation.fieldControlAtPath',
    pattern:
      /^(?<path>(?:nodes|pipes|instruments)\[\d+\]): "(?<field>[^"]+)" must not contain control characters\.$/,
  },
  {
    key: 'machines.validation.fieldControl',
    pattern: /^"(?<field>[^"]+)" must not contain control characters\.$/,
  },
  {
    key: 'machines.validation.unknownPropertyAtPath',
    pattern: /^(?<path>(?:nodes|pipes|instruments)\[\d+\]): unknown property (?<property>.+)\.$/,
  },
  {
    key: 'machines.validation.unknownProperty',
    pattern: /^unknown property (?<property>.+)\.$/,
  },
  {
    key: 'machines.validation.profileMismatch',
    pattern:
      /^Document profile "(?<documentProfile>.*?)" does not match the validated profile "(?<profileId>.*)"\.$/,
  },
  {
    key: 'machines.validation.nodeCountMin',
    pattern:
      /^Profile "(?<profileId>.*?)" requires at least (?<minimum>\d+) node\(s\) of type (?<nodeType>[^;]+); found (?<count>\d+)\.$/,
  },
  {
    key: 'machines.validation.nodeCountMax',
    pattern:
      /^Profile "(?<profileId>.*?)" allows at most (?<maximum>\d+) node\(s\) of type (?<nodeType>[^;]+); found (?<count>\d+)\.$/,
  },
  {
    key: 'machines.validation.nodeOutsideGrid',
    pattern:
      /^Node "(?<nodeId>.*?)" at grid \[(?<column>-?\d+), (?<row>-?\d+)\] is outside the profile grid of (?<columns>\d+)x(?<rows>\d+) cells\.$/,
  },
  {
    key: 'machines.validation.loopNoPipes',
    pattern: /^The profile requires a closed piping loop, but the document has no pipes\.$/,
  },
  {
    key: 'machines.validation.loopOnlyTerminalBranches',
    pattern:
      /^The profile requires a closed piping loop, but only terminal branches were found\.$/,
  },
  {
    key: 'machines.validation.terminalSafetyValveIncoming',
    pattern:
      /^Terminal safety valve "(?<nodeId>.*?)" must have exactly one incoming pressure branch; found (?<count>\d+)\.$/,
  },
  {
    key: 'machines.validation.loopNodeDisconnected',
    pattern: /^Node "(?<nodeId>.*)" is not connected to the piping loop\.$/,
  },
  {
    key: 'machines.validation.loopNoOutgoing',
    pattern: /^The piping loop does not close: node "(?<nodeId>.*)" has no outgoing pipe\.$/,
  },
  {
    key: 'machines.validation.loopNoIncoming',
    pattern: /^The piping loop does not close: node "(?<nodeId>.*)" has no incoming pipe\.$/,
  },
  {
    key: 'machines.validation.loopGroups',
    pattern:
      /^The piping does not form a single connected circuit: found (?<count>\d+) disconnected groups\.$/,
  },
  {
    key: 'machines.validation.loopNotClosed',
    pattern: /^The piping is connected but does not form one closed directed circuit\.$/,
  },
  {
    key: 'machines.validation.sensorSlotAbsent',
    pattern:
      /^Instrument "(?<tag>.*?)": profile "(?<profileId>.*?)" has no sensor slot for series (?<series>[^.]+)\.$/,
  },
  {
    key: 'machines.validation.sensorPrefix',
    pattern:
      /^Instrument "(?<tag>.*?)": the tag prefix for series (?<series>.+) must be "(?<prefix>.*)"\.$/,
  },
  {
    key: 'machines.validation.sensorAttachment',
    pattern:
      /^Instrument "(?<tag>.*?)" attaches to node "(?<nodeId>.*?)" of type (?<nodeType>[^;]+); allowed types: (?<allowed>.+)\.$/,
  },
  {
    key: 'machines.validation.sensorSlotCount',
    pattern:
      /^Profile "(?<profileId>.*?)" allows one (?<series>.+) instrument slot; found (?<count>\d+)\.$/,
  },
  {
    key: 'machines.validation.sensorRequired',
    pattern:
      /^Profile "(?<profileId>.*?)" requires a (?<series>.+) sensor \(tag prefix "(?<prefix>.*)"\); none found\.$/,
  },
  {
    key: 'machines.validation.builtInEdit',
    pattern: /^Built-in machines cannot be edited; duplicate them instead\.$/,
  },
  {
    key: 'machines.validation.machineMissing',
    pattern: /^No machine with id "(?<machineId>.*)" exists\.$/,
  },
  {
    key: 'machines.validation.machineExists',
    pattern: /^A machine with id "(?<machineId>.*)" already exists\.$/,
  },
  {
    key: 'machines.validation.builtInRemove',
    pattern: /^Built-in machines cannot be removed\.$/,
  },
  {
    key: 'machines.validation.layoutUnknownNode',
    pattern:
      /^Cannot lay out schematic "(?<documentId>.*?)": unknown node "(?<nodeId>.*)"\. Validate first\.$/,
  },
  {
    key: 'machines.validation.layoutPipeBlocked',
    pattern:
      /^Cannot lay out schematic pipe "(?<from>.*?)" → "(?<to>.*)" without crossing a node\.$/,
  },
] as const satisfies readonly ValidationMessageRule[];

const UNKNOWN_VALIDATION_KEY = 'machines.validation.unknown' as const;

type ValidationRuleKey = (typeof VALIDATION_COPY_RULES)[number]['key'];

export interface MachineValidationCopy {
  readonly key: ValidationRuleKey | typeof UNKNOWN_VALIDATION_KEY;
  readonly params?: Readonly<Record<string, string>>;
}

/**
 * Converts stable technical validator output at the UI boundary. Validators keep their pure,
 * English diagnostics for tests and logs; the interface receives only localisable copy keys.
 */
export function machineValidationCopy(error: string): MachineValidationCopy {
  for (const rule of VALIDATION_COPY_RULES) {
    const match = rule.pattern.exec(error);
    if (match === null) {
      continue;
    }
    return match.groups === undefined ? { key: rule.key } : { key: rule.key, params: match.groups };
  }
  return { key: UNKNOWN_VALIDATION_KEY };
}

export function machineValidationCopies(
  errors: readonly string[],
): readonly MachineValidationCopy[] {
  return errors.map((error) => machineValidationCopy(error));
}
