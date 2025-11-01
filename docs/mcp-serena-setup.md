# 🔧 MCP Serena Setup Guide

**Complete setup guide for Serena MCP Server integration**

## 📋 **Overview**

Serena là một powerful coding agent toolkit providing semantic retrieval and editing capabilities qua MCP (Model Context Protocol). Integration này cho phép AI assistants có IDE-like tools để work trực tiếp với codebase.

## 🏗️ **Installation Summary**

### **What We've Accomplished:**
1. ✅ **Cloned Serena**: từ `https://github.com/oraios/serena`
2. ✅ **Installed Dependencies**: sử dụng `uv sync --python 3.11`
3. ✅ **Created MCP Configurations**: cho different integration methods
4. ✅ **Tested Server**: verified Serena MCP server functionality

### **Project Structure:**
```
/Users/mac_1/Documents/GitHub/chainlens/
├── serena/                          # Serena toolkit clone
│   ├── .venv/                       # Python virtual environment
│   ├── src/serena/                  # Serena source code
│   └── pyproject.toml               # Dependencies & config
├── mcp-serena-config.json          # Direct Python MCP config
├── mcp-serena-simple-config.json   # uvx-based MCP config (recommended)
└── docs/mcp-serena-setup.md        # This guide
```

## 🚀 **MCP Client Configuration Options**

### **Option 1: uvx-based Configuration (Recommended)**

**File**: `mcp-serena-simple-config.json`
```json
{
  "serena": {
    "command": "uvx",
    "args": [
      "--from",
      "/Users/mac_1/Documents/GitHub/chainlens/serena",
      "serena",
      "start-mcp-server",
      "--project",
      "/Users/mac_1/Documents/GitHub/chainlens",
      "--transport",
      "stdio"
    ],
    "env": {},
    "working_directory": "/Users/mac_1/Documents/GitHub/chainlens"
  }
}
```

**Benefits:**
- ✅ Automatic dependency management via uvx
- ✅ Isolated environment creation
- ✅ Simpler path management
- ✅ Easier maintenance và updates

### **Option 2: Direct Python Configuration**

**File**: `mcp-serena-config.json`
```json
{
  "serena": {
    "command": "/Users/mac_1/Documents/GitHub/chainlens/serena/.venv/bin/python",
    "args": [
      "-m",
      "serena.cli",
      "start-mcp-server",
      "--project",
      "/Users/mac_1/Documents/GitHub/chainlens",
      "--transport",
      "stdio"
    ],
    "env": {},
    "working_directory": "/Users/mac_1/Documents/GitHub/chainlens/serena"
  }
}
```

**Benefits:**
- ✅ Direct control over Python environment
- ✅ Predictable execution path
- ✅ Better for debugging

## 🎯 **Integration with AI Clients**

### **Claude Desktop Integration**

1. **Open Claude Desktop configuration:**
   ```bash
   # macOS location
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. **Add Serena MCP server:**
   ```json
   {
     "mcpServers": {
       "serena": {
         "command": "uvx",
         "args": [
           "--from",
           "/Users/mac_1/Documents/GitHub/chainlens/serena",
           "serena",
           "start-mcp-server",
           "--project",
           "/Users/mac_1/Documents/GitHub/chainlens",
           "--transport",
           "stdio"
         ]
       }
     }
   }
   ```

3. **Restart Claude Desktop** để load MCP server

### **Other MCP Clients**

**Terminal-based clients (Codex, Gemini-CLI, etc.):**
- Use the JSON configuration trực tiếp
- Ensure MCP client supports stdio transport

**IDE Integration (VSCode, Cursor, IntelliJ):**
- Install MCP extension if available  
- Configure với provided JSON

## 🔧 **Serena Tools Available**

### **Core Semantic Tools**

1. **`find_symbol`** - Locate code entities at symbol level
2. **`find_referencing_symbols`** - Find where symbols are used
3. **`insert_after_symbol`** - Insert code after specific symbols
4. **`replace_symbol`** - Replace symbol definitions
5. **`get_symbol_definition`** - Get complete symbol definition

### **Project Management Tools**

1. **`activate_project`** - Switch to different project
2. **`list_files`** - Get project file structure
3. **`read_file`** - Read file contents
4. **`write_file`** - Write/modify files
5. **`search_project`** - Semantic search across project

### **Advanced Features**

1. **LSP Integration** - Language server protocol support
2. **Symbol Indexing** - Fast symbol lookup và navigation
3. **Semantic Analysis** - Understanding code structure và relationships
4. **Multi-language Support** - Works với various programming languages

## 🐛 **Troubleshooting**

### **Common Issues**

**1. Python Version Compatibility**
```bash
# Issue: Serena requires Python 3.11, but system has different version
# Solution: Use uvx (handles automatically) or uv with specific Python version

# Check Python versions available
uv python list

# Install with specific Python version
cd serena && uv sync --python 3.11
```

**2. Module Import Errors**
```bash
# Issue: ModuleNotFoundError for 'serena' or dependencies
# Solution: Ensure proper virtual environment activation

# Using uvx (automatic)
uvx --from /Users/mac_1/Documents/GitHub/chainlens/serena serena --help

# Using direct Python (manual)
cd serena && uv run serena --help
```

**3. MCP Server Connection Issues**
```bash
# Issue: Client cannot connect to MCP server
# Solution: Verify server starts correctly

# Test server startup
cd serena && uv run serena start-mcp-server --project /Users/mac_1/Documents/GitHub/chainlens
```

**4. Project Path Issues**
```bash
# Issue: Serena cannot find or index project files
# Solution: Ensure correct absolute paths in configuration

# Verify project path exists
ls -la /Users/mac_1/Documents/GitHub/chainlens

# Test project detection
cd serena && uv run serena project health-check /Users/mac_1/Documents/GitHub/chainlens
```

### **Debugging Steps**

1. **Verify Installation:**
   ```bash
   cd serena && uv run serena --help
   ```

2. **Test MCP Server:**
   ```bash
   cd serena && uv run serena start-mcp-server --project /Users/mac_1/Documents/GitHub/chainlens --log-level DEBUG
   ```

3. **Check Project Health:**
   ```bash
   cd serena && uv run serena project health-check /Users/mac_1/Documents/GitHub/chainlens
   ```

4. **Validate JSON Configuration:**
   ```bash
   cat mcp-serena-simple-config.json | python -m json.tool
   ```

## 🔄 **Maintenance & Updates**

### **Updating Serena**

```bash
# Navigate to serena directory
cd /Users/mac_1/Documents/GitHub/chainlens/serena

# Pull latest changes
git pull origin main

# Update dependencies
uv sync --python 3.11

# Test updated installation
uv run serena --help
```

### **Configuration Validation**

```bash
# Test uvx configuration
uvx --from /Users/mac_1/Documents/GitHub/chainlens/serena serena start-mcp-server --project /Users/mac_1/Documents/GitHub/chainlens --help

# Validate JSON syntax
python -c "import json; print('Valid JSON') if json.load(open('mcp-serena-simple-config.json')) else print('Invalid JSON')"
```

## 📚 **Usage Examples**

### **Basic Workflow**

1. **Start MCP Client** (Claude Desktop, terminal client, etc.)
2. **Verify Serena Tools** are loaded và available
3. **Use Semantic Tools** like:
   ```
   # Find a function definition
   find_symbol("functionName")
   
   # Find all references to a symbol
   find_referencing_symbols("className")
   
   # Insert code after a specific function
   insert_after_symbol("function_name", "new_code_here")
   ```

### **Advanced Usage**

```bash
# Custom project configuration
cd serena && uv run serena project generate-yml /Users/mac_1/Documents/GitHub/chainlens --language typescript

# Index project for faster symbol lookup
cd serena && uv run serena project index /Users/mac_1/Documents/GitHub/chainlens

# Health check with detailed information
cd serena && uv run serena project health-check /Users/mac_1/Documents/GitHub/chainlens --verbose
```

## 🎉 **Next Steps**

1. **Test Integration** với preferred AI client
2. **Explore Serena Tools** trong AI conversation
3. **Customize Project Settings** nếu cần
4. **Monitor Performance** và adjust configuration
5. **Update Documentation** based on usage experience

---

**📝 Configuration Files Ready:**
- ✅ `mcp-serena-simple-config.json` (recommended)  
- ✅ `mcp-serena-config.json` (alternative)

**🚀 Status**: Ready for MCP client integration!

**Last Updated**: September 9, 2025  
**Serena Version**: Latest from GitHub  
**Project**: chainlens AI Agent Platform
