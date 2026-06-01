interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * DATAcube — Statistical Office of the Slovak Republic (data.statistics.sk).
 *
 * Keyless JSON-stat API. Browse 600+ statistical cubes, inspect their
 * dimensions/valid codes, then pull data with one positional selection per
 * dimension. Topics: Slovak demographics, labour market, economy, prices,
 * households, regional statistics, etc.
 */


const BASE = 'https://data.statistics.sk/api/v2';
const UA = 'pipeworx-mcp-datacube-sk/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'list_datasets',
    description:
      'Browse / search the DATAcube collection of Slovak statistical cubes. ' +
      'Filter by case-insensitive substring of the English label. Returns each ' +
      "matching cube's code (use it as `cube` in the other tools), label, last " +
      'update date, and its ordered list of dimension codes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive substring to match against dataset labels (e.g. "population", "unemployment"). Omit to list everything.' },
        limit: { type: 'number', description: 'Max results to return (default 50, max 200).' },
        lang: { type: 'string', enum: ['en', 'sk'], description: 'Label language (default "en").' },
      },
    },
  },
  {
    name: 'dataset_dimensions',
    description:
      'List the dimensions of one cube, in path order, with each dimension\'s ' +
      'valid value codes and labels. Selections in get_data are positional and ' +
      'must follow this dimension order. Get the cube code from list_datasets.',
    inputSchema: {
      type: 'object',
      properties: {
        cube: { type: 'string', description: 'Cube code, e.g. "as1001rs" (from list_datasets).' },
        lang: { type: 'string', enum: ['en', 'sk'], description: 'Label language (default "en").' },
      },
      required: ['cube'],
    },
  },
  {
    name: 'get_data',
    description:
      'Pull data for a cube as JSON-stat. Provide one selection per dimension, ' +
      'in the dimension order returned by dataset_dimensions. Each selection is ' +
      'either a single value code, a comma-separated list of codes (e.g. ' +
      '"SEX_M,SEX_F"), or the literal "all" for every value of that dimension. ' +
      'The number of selections must equal the cube\'s dimension count. Output ' +
      'is JSON-stat: `value` is the flat data array, `dimension`/`size`/`id` ' +
      'describe its shape.',
    inputSchema: {
      type: 'object',
      properties: {
        cube: { type: 'string', description: 'Cube code, e.g. "as1001rs" (from list_datasets).' },
        selections: {
          type: 'array',
          items: { type: 'string' },
          description: 'One entry per dimension, in dataset_dimensions order. Each is a value code, a comma-separated list of codes, or "all". Example for as1001rs: ["2024", "UKAZ01", "all"].',
        },
        lang: { type: 'string', enum: ['en', 'sk'], description: 'Label language (default "en").' },
      },
      required: ['cube', 'selections'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_datasets':
      return listDatasets(args);
    case 'dataset_dimensions':
      return datasetDimensions(args);
    case 'get_data':
      return getData(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function listDatasets(args: Record<string, unknown>): Promise<unknown> {
  const lang = langOf(args);
  const query = (args.query as string | undefined)?.toLowerCase().trim() ?? '';
  const limit = clampLimit(args.limit, 50, 200);

  const coll = (await dcGet(`/collection?lang=${lang}`)) as {
    link?: { item?: Array<{ href?: string; label?: string; update?: string; dimension?: Record<string, unknown> }> };
  };
  const items = coll.link?.item ?? [];

  const results: Array<{ cube: string; label: string; updated?: string; dimensions: string[] }> = [];
  for (const it of items) {
    const label = it.label ?? '';
    if (query && !label.toLowerCase().includes(query)) continue;
    const cube = cubeFromHref(it.href);
    if (!cube) continue;
    results.push({
      cube,
      label,
      updated: it.update,
      dimensions: Object.keys(it.dimension ?? {}),
    });
    if (results.length >= limit) break;
  }

  return { total_matched: results.length, lang, results };
}

async function datasetDimensions(args: Record<string, unknown>): Promise<unknown> {
  const lang = langOf(args);
  const cube = reqStr(args, 'cube', '"as1001rs"');

  // Find the cube in the collection to learn its dimension order.
  const coll = (await dcGet(`/collection?lang=${lang}`)) as {
    link?: { item?: Array<{ href?: string; label?: string; dimension?: Record<string, unknown> }> };
  };
  const item = (coll.link?.item ?? []).find((it) => cubeFromHref(it.href) === cube);
  if (!item) throw new Error(`Unknown cube "${cube}". Use list_datasets to find valid cube codes.`);

  const dimCodes = Object.keys(item.dimension ?? {});
  const dimensions = await Promise.all(
    dimCodes.map(async (dim, position) => {
      const d = (await dcGet(`/dimension/${cube}/${dim}?lang=${lang}`)) as {
        note?: string;
        category?: { index?: Record<string, number>; label?: Record<string, string> };
      };
      const index = d.category?.index ?? {};
      const labels = d.category?.label ?? {};
      return {
        position,
        dimension: dim,
        note: d.note,
        values: Object.keys(index).map((code) => ({ code, label: labels[code] ?? code })),
      };
    }),
  );

  return { cube, label: item.label, lang, dimensions };
}

async function getData(args: Record<string, unknown>): Promise<unknown> {
  const lang = langOf(args);
  const cube = reqStr(args, 'cube', '"as1001rs"');
  const sel = args.selections;
  if (!Array.isArray(sel) || sel.length === 0 || !sel.every((s) => typeof s === 'string' && s.trim())) {
    throw new Error('selections must be a non-empty array of strings (one per dimension, in dataset_dimensions order). Use dataset_dimensions to find dimension order and valid codes.');
  }
  const path = (sel as string[]).map((s) => encodeURIComponent(s.trim())).join('/');
  return dcGet(`/dataset/${encodeURIComponent(cube)}/${path}?lang=${lang}`);
}

async function dcGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`DATAcube: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.json();
}

function cubeFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const m = href.match(/\/dataset\/([^/?]+)/);
  return m ? m[1] : undefined;
}

function langOf(args: Record<string, unknown>): 'en' | 'sk' {
  return args.lang === 'sk' ? 'sk' : 'en';
}

function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(Math.max(n, 1), max);
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing. Pass a string like ${example}.`);
  return v.trim();
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
