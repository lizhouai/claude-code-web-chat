# UVX Usage Guide

## Quick Reference

### Basic Installation and Running

```bash
# From GitHub (HTTPS)
uvx --python 3.11 --from git+https://github.com/lizhouai/claude-code-web-chat.git claude-code-web-chat

# From GitHub (SSH)
uvx --python 3.11 --from git+ssh://git@github.com/lizhouai/claude-code-web-chat.git claude-code-web-chat

# From local directory
cd /path/to/claude-code-web-chat
uvx --python 3.11 --from . claude-code-web-chat
```

### UVX Parameter Syntax

#### Running with additional dependencies

```bash
# Correct syntax
uvx --with package-name==version --from main-package command-name

# Example: mcp-atlassian with specific pydantic version
uvx --with pydantic==2.11.10 --from mcp-atlassian mcp-atlassian
```

#### Common mistakes

```bash
# ❌ WRONG - Old syntax (deprecated)
uvx --with pydantic==2.11.10 mcp-atlassian

# ✅ CORRECT - New syntax
uvx --with pydantic==2.11.10 --from mcp-atlassian mcp-atlassian
```

### MCP Server Configuration

The `conf/mcp_servers.json` file uses uvx to run MCP servers. Here's the correct format:

```json
{
  "mcpServers": {
    "confluence": {
      "command": "uvx",
      "args": [
        "--with", "pydantic==2.11.10",
        "--from", "mcp-atlassian",
        "mcp-atlassian"
      ],
      "env": {
        "CONFLUENCE_URL": "${MCP_CONFLUENCE_SERVER_URL}",
        "JIRA_URL": "${MCP_JIRA_SERVER_URL}"
      }
    }
  }
}
```

### UVX Options Reference

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--with` | `-w` | Install additional packages | `--with pydantic==2.11.10` |
| `--from` | | Specify package source | `--from git+https://...` |
| `--python` | | Python version to use | `--python 3.11` |
| `--with-requirements` | | Use requirements file | `--with-requirements requirements.txt` |
| `--with-editable` | | Install in editable mode | `--with-editable .` |

## Troubleshooting

### "Failed to resolve --with requirement"

This error usually means the syntax is incorrect. Make sure you're using:

```bash
uvx --with <package> --from <source> <command>
```

Not:
```bash
uvx --with <package> <source>  # ❌ WRONG
```

### Git operation failed

- Make sure the repository exists and is accessible
- Check if you're using the correct URL (HTTPS vs SSH)
- Verify your Git credentials are set up

### Python version issues

If you see Python version errors, specify the version explicitly:

```bash
uvx --python 3.11 --from ... claude-code-web-chat
```

## Best Practices

1. **Use HTTPS URLs for public access**:
   ```bash
   git+https://github.com/lizhouai/claude-code-web-chat.git
   ```

2. **Use SSH URLs if you have SSH keys configured**:
   ```bash
   git+ssh://git@github.com/lizhouai/claude-code-web-chat.git
   ```

3. **For local development, use local path**:
   ```bash
   uvx --from . claude-code-web-chat
   ```

4. **Pin Python version for consistency**:
   ```bash
   uvx --python 3.11 ...
   ```

## Related Commands

### Check uvx version
```bash
uvx --version
```

### View uvx help
```bash
uvx --help
```

### List installed packages
```bash
uv pip list
```

## See Also

- [UVX_DEPLOYMENT.md](./UVX_DEPLOYMENT.md) - Detailed deployment guide
- [README.md](../README.md) - Project overview
- [uv documentation](https://docs.astral.sh/uv/)
