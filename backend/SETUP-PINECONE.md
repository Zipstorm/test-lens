# Pinecone Setup Guide for Test Lens

Hey Neeraj! Follow these steps to get Pinecone running locally for the Test Lens project.

---

## 1. Create a Pinecone Account

- Go to [https://www.pinecone.io](https://www.pinecone.io)
- Sign up for a **free account** (no credit card needed)
- Free tier gives you 1 index with 100K vectors — more than enough

## 2. Create an Index

Once logged in:

1. Click **"Indexes"** in the left sidebar
2. Click **"Create Index"**
3. Use these exact settings:

| Setting       | Value      |
|---------------|------------|
| **Name**      | `testlens` |
| **Dimensions**| `1536`     |
| **Metric**    | `cosine`   |
| **Cloud**     | Any (e.g., AWS us-east-1) |

4. Click **Create Index**
5. Wait a few seconds until status shows **Ready**

> **Why 1536?** That's the vector size output by OpenAI's `text-embedding-3-small` model. The index dimensions must match the embedding dimensions.

> **Why cosine?** Cosine similarity measures the angle between vectors — it works best for comparing text meaning regardless of length.

## 3. Get Your API Key

1. Click **"API Keys"** in the left sidebar
2. Copy the **default API key** (or create a new one)

## 4. Configure Your `.env`

```bash
cd backend
cp .env.example .env
```

Fill in the values:

```env
PINECONE_API_KEY=pcsk_xxxxxxx        # Your Pinecone key from step 3
PINECONE_INDEX_NAME=testlens          # Must match the index name from step 2
OPENAI_API_KEY=sk-xxxxxxx            # Get from https://platform.openai.com/api-keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxx     # Get from https://console.anthropic.com
PORT=3000
```

## 5. Verify It Works

```bash
npm install
npm run cli
```

You should see:

```
Connecting to Pinecone...
[VectorStore] Connected to Pinecone index: testlens
✓ Connected
```

If you see that, you're all set!

## Troubleshooting

| Error | Fix |
|-------|-----|
| `PINECONE_API_KEY is not set` | Check your `.env` file exists and has the key |
| `Index not found` | Make sure the index name in `.env` matches exactly (`testlens`) |
| `Dimension mismatch` | Ensure the index was created with **1536** dimensions |
| `401 Unauthorized` | Your API key is invalid — regenerate it in the Pinecone console |
| `Connection timeout` | Check your internet connection; Pinecone is a cloud service |

## Quick Reference

- **Pinecone Console**: [https://app.pinecone.io](https://app.pinecone.io)
- **OpenAI API Keys**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic Console**: [https://console.anthropic.com](https://console.anthropic.com)
