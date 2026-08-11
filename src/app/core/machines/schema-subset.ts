/**
 * A deliberately tiny JSON Schema checker — honestly a SUBSET validator, not a conformant
 * draft 2020-12 implementation. It exists so the shipped `machine-schematic.schema.json` can be
 * exercised in tests without adding a validator dependency, and it supports exactly the keywords
 * that schema uses: `type`, `enum`, `const`, `pattern`, `minLength`, `maxLength`, `minimum`,
 * `required`, `properties`, `additionalProperties: false`, `items` (schema or `false`),
 * `maximum`, `prefixItems`, `minItems`, `maxItems`, `allOf`, `if`/`then` and `$ref` into
 * `#/$defs`.
 * Anything else in a schema is ignored, so a green result here is necessary, not sufficient.
 */
export function checkAgainstSchemaSubset(schema: unknown, value: unknown): readonly string[] {
  const errors: string[] = [];
  check(schema, asRecord(schema), value, '#', errors);
  return errors;
}

type SchemaRecord = Record<string, unknown>;

function check(
  schema: unknown,
  root: SchemaRecord | undefined,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (schema === false) {
    errors.push(`${path}: no value allowed here.`);
    return;
  }
  const node = asRecord(schema);
  if (!node) {
    return;
  }

  const ref = node['$ref'];
  if (typeof ref === 'string') {
    check(resolveRef(ref, root), root, value, path, errors);
    return;
  }

  const type = node['type'];
  if (typeof type === 'string' && !matchesType(type, value)) {
    errors.push(`${path}: expected ${type}, got ${describeValue(value)}.`);
    return;
  }

  const allowed = node['enum'];
  if (Array.isArray(allowed) && !allowed.some((candidate) => candidate === value)) {
    errors.push(`${path}: value ${describeValue(value)} is not one of the allowed values.`);
  }

  if (Object.prototype.hasOwnProperty.call(node, 'const') && node['const'] !== value) {
    errors.push(`${path}: value ${describeValue(value)} does not equal the required constant.`);
  }

  const allOf = node['allOf'];
  if (Array.isArray(allOf)) {
    for (const subschema of allOf) {
      check(subschema, root, value, path, errors);
    }
  }

  const condition = node['if'];
  if (condition !== undefined) {
    const branch = matches(condition, root, value, path) ? node['then'] : node['else'];
    if (branch !== undefined) {
      check(branch, root, value, path, errors);
    }
  }

  if (typeof value === 'string') {
    const pattern = node['pattern'];
    if (typeof pattern === 'string' && !new RegExp(pattern).test(value)) {
      errors.push(`${path}: "${value}" does not match pattern ${pattern}.`);
    }
    const minLength = node['minLength'];
    if (typeof minLength === 'number' && value.length < minLength) {
      errors.push(`${path}: string is shorter than minLength ${minLength}.`);
    }
    const maxLength = node['maxLength'];
    if (typeof maxLength === 'number' && [...value].length > maxLength) {
      errors.push(`${path}: string is longer than maxLength ${maxLength}.`);
    }
  }

  if (typeof value === 'number') {
    const minimum = node['minimum'];
    if (typeof minimum === 'number' && value < minimum) {
      errors.push(`${path}: ${value} is below minimum ${minimum}.`);
    }
    const maximum = node['maximum'];
    if (typeof maximum === 'number' && value > maximum) {
      errors.push(`${path}: ${value} is above maximum ${maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    checkArray(node, root, value, path, errors);
  } else if (asRecord(value)) {
    checkObject(node, root, value as SchemaRecord, path, errors);
  }
}

function checkArray(
  node: SchemaRecord,
  root: SchemaRecord | undefined,
  value: readonly unknown[],
  path: string,
  errors: string[],
): void {
  const minItems = node['minItems'];
  if (typeof minItems === 'number' && value.length < minItems) {
    errors.push(`${path}: array has fewer than minItems ${minItems} entries.`);
  }
  const maxItems = node['maxItems'];
  if (typeof maxItems === 'number' && value.length > maxItems) {
    errors.push(`${path}: array has more than maxItems ${maxItems} entries.`);
  }

  const prefixItems = Array.isArray(node['prefixItems']) ? node['prefixItems'] : [];
  for (const [index, entry] of value.entries()) {
    if (index < prefixItems.length) {
      check(prefixItems[index], root, entry, `${path}/${index}`, errors);
    } else if (node['items'] !== undefined) {
      check(node['items'], root, entry, `${path}/${index}`, errors);
    }
  }
}

function checkObject(
  node: SchemaRecord,
  root: SchemaRecord | undefined,
  value: SchemaRecord,
  path: string,
  errors: string[],
): void {
  const required = node['required'];
  if (Array.isArray(required)) {
    for (const field of required) {
      if (typeof field === 'string' && value[field] === undefined) {
        errors.push(`${path}: missing required property "${field}".`);
      }
    }
  }
  const properties = asRecord(node['properties']);
  if (properties) {
    for (const [field, subschema] of Object.entries(properties)) {
      if (value[field] !== undefined) {
        check(subschema, root, value[field], `${path}/${field}`, errors);
      }
    }
  }
  if (node['additionalProperties'] === false) {
    const knownFields = new Set(Object.keys(properties ?? {}));
    for (const field of Object.keys(value)) {
      if (!knownFields.has(field)) {
        errors.push(`${path}: unknown property "${field}".`);
      }
    }
  }
}

function matches(
  schema: unknown,
  root: SchemaRecord | undefined,
  value: unknown,
  path: string,
): boolean {
  const errors: string[] = [];
  check(schema, root, value, path, errors);
  return errors.length === 0;
}

function resolveRef(ref: string, root: SchemaRecord | undefined): unknown {
  const prefix = '#/$defs/';
  if (!ref.startsWith(prefix) || !root) {
    throw new Error(`Subset checker only resolves ${prefix}* references, got "${ref}".`);
  }
  const defs = asRecord(root['$defs']);
  const resolved = defs?.[ref.slice(prefix.length)];
  if (resolved === undefined) {
    throw new Error(`Unresolved schema reference "${ref}".`);
  }
  return resolved;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return asRecord(value) !== undefined;
    case 'null':
      return value === null;
    default:
      throw new Error(`Subset checker does not support type "${type}".`);
  }
}

function describeValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function asRecord(value: unknown): SchemaRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SchemaRecord)
    : undefined;
}
