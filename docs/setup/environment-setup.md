# Environment Setup Guide

This guide covers everything needed to run Test Lens locally, including prerequisites, environment variables, third-party service configuration, and startup commands.

## Prerequisites

- **Node.js 18+** (20 recommended) -- [https://nodejs.org](https://nodejs.org)
- **npm** or **yarn**
- **Git**
- **Pinecone account** -- Free tier (Starter plan) works. [https://www.pinecone.io](https://www.pinecone.io)
- **OpenAI API key** -- For generating embeddings. [https://platform.openai.com](https://platform.openai.com)
- **Anthropic API key** -- For Claude-powered analysis. [https://console.anthropic.com](https://console.anthropic.com)
- **Optional:** Jira Cloud instance + API token (for Jira import)
- **Optional:** Xray Cloud subscription + client credentials (for Xray import)

## Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

| Variable | Required | Description | Example |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key | `sk-ant-xxx` |
| `OPENAI_API_KEY` | Yes | OpenAI embeddings API key | `sk-xxx` |
| `PINECONE_API_KEY` | Yes | Pinecone vector DB API key | `pcsk_xxx` |
| `PINECONE_INDEX_NAME` | Yes | Pinecone index name | `testlens` |
| `PORT` | No | Backend server port (default: 3000) | `3000` |
| `JIRA_BASE_URL` | No | Jira instance URL | `https://yoursite.atlassian.net` |
| `JIRA_EMAIL` | No | Jira account email | `you@example.com` |
| `JIRA_API_TOKEN` | No | Jira API token | `xxx` |
| `XRAY_CLIENT_ID` | No | Xray Cloud client ID | `xxx` |
| `XRAY_CLIENT_SECRET` | No | Xray Cloud client secret | `xxx` |

The three required API keys (Anthropic, OpenAI, Pinecone) plus the index name are needed for core functionality. The Jira and Xray variables are only needed if you want to import test cases from those systems.

## Pinecone Setup

See [../../backend/SETUP-PINECONE.md](../../backend/SETUP-PINECONE.md) for the detailed Pinecone configuration guide.

**Quick summary:**

1. Sign up at [pinecone.io](https://www.pinecone.io) and create a project.
2. Create a new index named `testlens`.
3. Set dimensions to `1536`.
4. Set the distance metric to `cosine`.
5. Copy your API key and set `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` in your `.env` file.

## Jira Setup

Jira import uses Basic Auth with an email and API token.

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token** and give it a descriptive label (e.g., "Test Lens").
3. Copy the generated token.
4. Set the following in your `.env` file:

```
JIRA_BASE_URL=https://yoursite.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-api-token-here
```

The Jira account must have read access to the project(s) containing test issues.

## Xray Cloud Setup

Xray import uses OAuth2 with client credentials.

1. Open Jira and navigate to **Apps > Xray > Settings > API Keys**.
2. Click **Create** to generate a new API key (client credentials).
3. Copy the **Client ID** and **Client Secret**.
4. Set the following in your `.env` file:

```
XRAY_CLIENT_ID=your-client-id-here
XRAY_CLIENT_SECRET=your-client-secret-here
```

The Xray credentials must have read access to the test repository.

## Running Locally

### Backend

```bash
cd backend
cp .env.example .env  # Fill in your keys
npm install
npm run dev  # http://localhost:3000
```

### Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev  # http://localhost:3001
```

The frontend expects the backend to be running at `http://localhost:3000`. Open `http://localhost:3001` in your browser to use the application.

## Running with Docker

```bash
# From the project root
docker-compose up --build
# Frontend: http://localhost:3001
# Backend:  http://localhost:3000
```

Docker Compose handles both services and networking. Make sure your `.env` file is in the `backend/` directory before building.

## CLI Tool

Test Lens includes an interactive CLI for quick operations without the web UI:

```bash
cd backend
npm run cli
# Interactive menu: upload, jira-import, xray-import, search, jira-search
```

The CLI reads the same `.env` file and provides a menu-driven interface for uploading test cases, importing from Jira/Xray, and running semantic searches.
