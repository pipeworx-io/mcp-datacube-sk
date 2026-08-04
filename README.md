# mcp-datacube-sk

DATAcube — Statistical Office of the Slovak Republic (data.statistics.sk).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `list_datasets` | Browse / search the DATAcube collection of Slovak statistical cubes. Filter by case-insensitive substring of the English label. Returns each matching cube's code (use it as `cube` in the other tools), label, last update date, and its ordered list of dimension codes. |
| `dataset_dimensions` | List the dimensions of one cube, in path order, with each dimension's valid value codes and labels. Selections in get_data are positional and must follow this dimension order. Get the cube code from list_datasets. |
| `get_data` | Pull data for a cube as JSON-stat. Provide one selection per dimension, in the dimension order returned by dataset_dimensions. Each selection is either a single value code, a comma-separated list of codes (e.g. "SEX_M,SEX_F"), or the literal "all" for every value of that dimension. The number of selections must equal the cube's dimension count. Output is JSON-stat: `value` is the flat data array, `dimension`/`size`/`id` describe its shape. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "datacube-sk": {
      "url": "https://gateway.pipeworx.io/datacube-sk/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Datacube Sk data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
