/**
 * JSON-Schema-driven argv parser.
 *
 * Each tool already has a JSON Schema describing its input shape. We turn
 * those schemas into CLI flags so every tool gets a usable command without
 * hand-writing parsers per tool.
 *
 * Mapping:
 *   string/number/integer/boolean -> --flag value (boolean: --flag / --no-flag)
 *   array                         -> repeatable --flag, or --flag a,b,c, or JSON
 *   object                        -> --flag '<json>' (single JSON blob)
 *   union types (e.g. ['number','string']) -> string-first, coerce to number if numeric
 *
 * Special flags:
 *   --json '<obj>'   merge a JSON blob into the parsed args (overrides flags)
 *   --help / -h      short circuits in the dispatcher
 */

import type { ToolDefinition } from '../tools/shared.js';

type SchemaType = string | string[];

interface Property {
  type?: SchemaType;
  description?: string;
  items?: Property;
  enum?: unknown[];
  properties?: Record<string, Property>;
}

export interface ParseResult {
  args: Record<string, unknown>;
  help: boolean;
}

export class ArgParseError extends Error {}

export function parseToolArgs(definition: ToolDefinition, argv: string[]): ParseResult {
  const props = (definition.inputSchema.properties ?? {}) as Record<string, Property>;
  const required = definition.inputSchema.required ?? [];
  const out: Record<string, unknown> = {};
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }

    if (token === '--json') {
      const raw = argv[++i];
      if (!raw) throw new ArgParseError('--json requires a value');
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch (e) {
        throw new ArgParseError(`--json value is not valid JSON: ${(e as Error).message}`);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ArgParseError('--json value must be a JSON object');
      }
      Object.assign(out, parsed as Record<string, unknown>);
      continue;
    }

    if (!token.startsWith('--')) {
      throw new ArgParseError(`Unexpected positional argument: ${token}`);
    }

    let name = token.slice(2);
    let inlineValue: string | undefined;
    const eq = name.indexOf('=');
    if (eq !== -1) {
      inlineValue = name.slice(eq + 1);
      name = name.slice(0, eq);
    }

    // --no-foo => boolean false
    if (name.startsWith('no-')) {
      const positiveName = name.slice(3);
      if (props[positiveName] && schemaIncludes(props[positiveName].type, 'boolean')) {
        out[positiveName] = false;
        continue;
      }
    }

    const prop = props[name];
    if (!prop) {
      throw new ArgParseError(`Unknown flag: --${name} (run with --help for available flags)`);
    }

    if (schemaIncludes(prop.type, 'boolean') && inlineValue === undefined) {
      // Flag form: peek next arg; if it looks like a value, consume it
      const next = argv[i + 1];
      if (next === 'true' || next === 'false') {
        out[name] = next === 'true';
        i++;
      } else {
        out[name] = true;
      }
      continue;
    }

    let raw = inlineValue;
    if (raw === undefined) {
      raw = argv[++i];
      if (raw === undefined) {
        throw new ArgParseError(`--${name} requires a value`);
      }
    }
    out[name] = coerceValue(name, raw, prop, out[name]);
  }

  if (!help) {
    const missing = required.filter(r => out[r] === undefined);
    if (missing.length) {
      throw new ArgParseError(`Missing required flag(s): ${missing.map(m => `--${m}`).join(', ')}`);
    }
  }

  return { args: out, help };
}

function schemaIncludes(type: SchemaType | undefined, target: string): boolean {
  if (!type) return false;
  return Array.isArray(type) ? type.includes(target) : type === target;
}

function coerceValue(name: string, raw: string, prop: Property, existing: unknown): unknown {
  const types = Array.isArray(prop.type) ? prop.type : prop.type ? [prop.type] : [];

  if (types.includes('array')) {
    let next: unknown[];
    if (raw.startsWith('[')) {
      try { next = JSON.parse(raw); } catch (e) {
        throw new ArgParseError(`--${name} expected JSON array: ${(e as Error).message}`);
      }
      if (!Array.isArray(next)) throw new ArgParseError(`--${name} expected an array`);
    } else if (raw.includes(',')) {
      next = raw.split(',').map(v => coerceScalar(name, v, prop.items));
    } else {
      next = [coerceScalar(name, raw, prop.items)];
    }
    if (Array.isArray(existing)) return [...existing, ...next];
    return next;
  }

  if (types.includes('object')) {
    try { return JSON.parse(raw); } catch (e) {
      throw new ArgParseError(`--${name} expected JSON object: ${(e as Error).message}`);
    }
  }

  return coerceScalar(name, raw, prop);
}

function coerceScalar(name: string, raw: string, prop: Property | undefined): unknown {
  if (!prop) return raw;
  const types = Array.isArray(prop.type) ? prop.type : prop.type ? [prop.type] : ['string'];

  if (types.includes('number') || types.includes('integer')) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
    if (!types.includes('string')) {
      throw new ArgParseError(`--${name} expected a number, got "${raw}"`);
    }
  }
  if (types.includes('boolean')) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (!types.includes('string')) {
      throw new ArgParseError(`--${name} expected true/false, got "${raw}"`);
    }
  }
  return raw;
}

export function helpFor(definition: ToolDefinition): string {
  const props = (definition.inputSchema.properties ?? {}) as Record<string, Property>;
  const required = new Set(definition.inputSchema.required ?? []);
  const lines: string[] = [];
  lines.push(`${definition.name} — ${definition.description}`);
  lines.push('');
  lines.push('Flags:');
  for (const [key, prop] of Object.entries(props)) {
    const types = Array.isArray(prop.type) ? prop.type.join('|') : (prop.type || 'string');
    const req = required.has(key) ? ' (required)' : '';
    const desc = prop.description ? ` — ${prop.description}` : '';
    lines.push(`  --${key} <${types}>${req}${desc}`);
  }
  lines.push('');
  lines.push('Or pass the entire input as JSON: --json \'{"key":"value"}\'');
  return lines.join('\n');
}
