# Suna AI Agent Platform - Postman API Collection

## 📋 Overview

This is a comprehensive Postman collection for the **Suna AI Agent Platform** with **ChainLens** integration. The collection includes all API endpoints for testing and development.

## 🚀 Quick Start

### 1. Import Collection & Environment

1. **Import Collection**: Import `Suna_API_Collection.postman_collection.json`
2. **Import Environment**: Import `Suna_API_Environment.postman_environment.json`
3. **Select Environment**: Choose "Suna API - Local Development" environment

### 2. Setup Authentication

#### Option A: Login with Supabase Auth (Recommended)
1. Run **"Login with Supabase Auth"** request in Authentication folder
2. This will automatically login with `admin@example.com` and set JWT token
3. JWT token will be valid for 1 hour

#### Option B: Use Pre-configured JWT Token
- JWT token is already set in environment for user `admin@example.com`
- Valid for immediate testing
- User ID: `6cc2fbb4-0b8c-4fd1-a198-3d69a6ceb29e`

#### Option C: Admin API Key (Admin Operations Only)
- Already configured in environment
- Only works with `/admin/*` endpoints

### 3. Test the Setup

1. Run **Health Check** to verify backend is running
2. Run **Login with Supabase Auth** to get fresh JWT token (optional)
3. Try **List Threads** to test authentication

## 📚 Collection Structure

### 🏥 Health & System
- **Health Check**: Verify backend status

### 🔐 Authentication & API Keys
- **Create API Key**: Generate new API key
- **List API Keys**: View all API keys
- **Revoke API Key**: Disable API key

### 🤖 Agents
- **Create Agent**: Create new AI agent
- **List Agents**: Get all agents
- **Get Agent**: Get specific agent details
- **Update Agent**: Modify agent configuration
- **Delete Agent**: Remove agent
- **Export Agent**: Export agent configuration
- **Import Agent**: Import agent from export

### 🧵 Threads & Conversations
- **Create Thread**: Start new conversation thread
- **List Threads**: Get all threads
- **Get Thread**: Get thread details with messages
- **Add Message to Thread**: Add user message
- **Create Message**: Create structured message

### 🚀 Agent Runs & Execution
- **Initiate Agent (with Files)**: Start new agent session with file uploads
- **Start Agent for Thread**: Start agent for existing thread
- **Get Agent Runs**: Get execution history
- **Stream Agent Response**: Real-time agent responses
- **Stop Agent**: Terminate running agent

### 📊 Billing & Subscriptions
- **Get Available Models**: List AI models and pricing
- **Get Credit Balance**: Check account credits
- **Get Usage Statistics**: View usage analytics
- **Create Checkout Session**: Start subscription flow

### 📚 Knowledge Base
- **Create Folder**: Organize knowledge base
- **List Folders**: View all folders
- **Upload File to Folder**: Add documents
- **Get Folder Entries**: List folder contents
- **Get Agent Knowledge Context**: Get context for agent

### 🔧 Admin Operations
- **Install Chainlens Agent for User**: Setup default agent
- **List Users (Admin)**: View all users
- **Get User Details (Admin)**: User account details
- **Adjust User Credits (Admin)**: Modify user credits

### 🔗 Integrations
- **Pipedream**: Connection tokens and user connections
- **Composio**: Toolkits and tools management
- **MCP**: Server management

### 🎯 Triggers & Workflows
- **List Agent Triggers**: View automation triggers
- **Create Trigger**: Setup new trigger
- **List Agent Workflows**: View workflows
- **Execute Workflow**: Run workflow

### 📄 Templates & Documents
- **List Templates**: View document templates
- **Create Template**: Add new template
- **Get Template**: Retrieve template

### 🎤 Transcription & Media
- **Transcribe Audio**: Convert audio to text

### 📧 Email Services
- **Send Welcome Email (Admin)**: Send user welcome email

### 🔐 Alternative Authentication
- **Test with API Key Header**: Use x-api-key authentication
- **Test with Admin API Key**: Use admin authentication

### 🧪 Testing & Development
- **Generate Test JWT Token**: Create test authentication
- **Test E2E Flow**: End-to-end testing

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `base_url` | Backend server URL | `http://localhost:8000` |
| `api_prefix` | API path prefix | `/api` |
| `jwt_token` | JWT authentication token | Auto-generated |
| `api_key` | API key for authentication | `pk_xxx:sk_xxx` |
| `admin_api_key` | Admin API key | Pre-configured |
| `thread_id` | Current thread ID | Auto-set from responses |
| `agent_id` | Current agent ID | Auto-set from responses |
| `agent_run_id` | Current agent run ID | Auto-set from responses |

## 🚦 Common Workflows

### 1. Create and Test Agent
```
1. Generate Test JWT Token
2. Create Agent
3. Create Thread
4. Add Message to Thread
5. Start Agent for Thread
6. Stream Agent Response
```

### 2. E2E API Testing
```
1. Health Check
2. Generate Test JWT Token
3. Initiate Agent (with Files)
4. Get Agent Runs
5. Stream Agent Response
```

### 3. Knowledge Base Setup
```
1. Create Folder
2. Upload File to Folder
3. Get Folder Entries
4. Get Agent Knowledge Context
```

## ⚠️ Prerequisites

1. **Backend Running**: Ensure Suna backend is running on `http://localhost:8000`
2. **Database Setup**: Database schema must be migrated
3. **Services Running**: Redis, Supabase, and other services should be active

## 🐛 Troubleshooting

### Authentication Issues
- **"No valid authentication credentials found"**: Generate new JWT token
- **"Invalid API key format"**: Ensure API key format is `pk_xxx:sk_xxx`

### Database Issues
- **"Could not find table"**: Run database migrations
- **"Failed to create thread"**: Check database connection

### Server Issues
- **Connection refused**: Verify backend is running on port 8000
- **Internal Server Error**: Check backend logs

## 📝 Notes

- **JWT Tokens**: Expire after 1 hour, regenerate as needed
- **API Keys**: Persistent until revoked
- **Admin Operations**: Require special admin API key
- **File Uploads**: Use multipart/form-data for file endpoints
- **Streaming**: Use Server-Sent Events for real-time responses

## 🔗 Related Documentation

- [Suna Project Documentation](./docs/PROJECT_DOCUMENT.md)
- [API Architecture](./docs/architecture/)
- [Backend Setup](./backend/README.md)
