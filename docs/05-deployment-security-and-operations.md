# Deployment, Security, and Operations

## Required Services

- Node.js 18+ for `backend/` and `frontend/`.
- Python 3.11+ for `rag-service/`.
- MongoDB.
- Durable storage for uploaded PDFs.
- Durable storage for ChromaDB persistence.
- OpenAI API key.
- Optional Meta WhatsApp Cloud API credentials.
- Optional Twilio credentials.

## Recommended Environments

Use separate environments for:

- Local development.
- Staging.
- Production.

Each environment should have separate:

- MongoDB database.
- ChromaDB persistence path.
- OpenAI key or restricted OpenAI project key.
- Widget API keys.
- WhatsApp/Twilio credentials.
- JWT and encryption secrets.

## Backend Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend API port |
| `MONGODB_URI` | MongoDB connection string |
| `RAG_SERVICE_URL` | Internal URL for Python RAG service |
| `UPLOAD_DIR` | PDF storage directory |
| `JWT_SECRET` | Admin JWT signing and session hashing secret |
| `SUPER_ADMIN_EMAIL` | Seeded superadmin email |
| `SUPER_ADMIN_PASSWORD` | Seeded superadmin password |
| `GOOGLE_CLIENT_IDS` | Allowed Google OAuth client IDs |
| `OPENAI_API_KEY` | Used for backend query rewrite/classification |
| `OPENAI_CHAT_MODEL` | Backend chat model for preprocessing |
| `GRAPH_API_VERSION` | Meta Graph API version |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification token |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | Encrypts WhatsApp tokens |
| `SMS_TOKEN_ENCRYPTION_KEY` | Encrypts Twilio auth tokens |
| `PUBLIC_BACKEND_URL` | Public API URL for callback setup |
| `TWILIO_VALIDATE_WEBHOOK_SIGNATURE` | Enables Twilio webhook signature validation |

## RAG Service Environment Variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for embeddings and answer generation |
| `OPENAI_EMBEDDING_MODEL` | Embedding model |
| `OPENAI_CHAT_MODEL` | Answer generation model |
| `CHROMA_PERSIST_DIR` | ChromaDB data directory |
| `CHUNK_SIZE` | Text chunk size |
| `CHUNK_OVERLAP` | Chunk overlap size |
| `TOP_K` | Number of chunks retrieved per query |

## Production Network Layout

Recommended:

```text
Internet
  |
  v
HTTPS reverse proxy / load balancer
  |
  +--> backend Node.js API
          |
          +--> MongoDB
          +--> private RAG service
                  |
                  +--> ChromaDB persistence
                  +--> OpenAI API
```

The RAG service should not be exposed directly to the public internet unless protected by network controls and authentication.

## Widget Hosting

Host:

```text
frontend/dist-widget/rag-chat-widget.iife.js
```

on HTTPS. Suitable hosting options:

- Same domain as the admin frontend.
- Static asset server.
- CDN.
- Object storage with CDN in front.

The company website embeds the hosted script and points `apiBaseUrl` to the public backend.

## Security Controls

### Widget API Key

Every widget request must include:

```text
X-Widget-API-Key
```

The backend stores only a hash of the key and uses timing-safe comparison.

Operational rules:

- Generate one key per company.
- Rotate keys when leaked or when a company changes ownership.
- Do not use widget API keys for admin APIs.
- Treat widget keys as public-ish browser credentials; they identify an allowed website integration but are not a substitute for user authentication.

### Admin Authentication

Admin APIs should require JWT-based admin authentication. Superadmin credentials must be changed from defaults before production use.

### External Website Login

Website-account login must use server-signed tokens.

Rules:

- Sign tokens on the company website backend.
- Use HS256 only if the shared secret is strong and kept server-side.
- Include an expiration timestamp.
- Validate issuer and audience when configured.
- Never expose the external auth secret to browser code.

Current implementation note: the verifier expects external auth settings on the company record. Add these fields to the `Company` schema and admin management UI/API before enabling this feature.

### Google Login

Configure only trusted Google Client IDs in:

```env
GOOGLE_CLIENT_IDS=...
```

The backend should reject ID tokens from unknown audiences.

### Webhooks

For WhatsApp:

- Use a strong `WHATSAPP_VERIFY_TOKEN`.
- Store company access tokens encrypted.
- Match inbound messages by `phone_number_id`.

For Twilio:

- Keep `TWILIO_VALIDATE_WEBHOOK_SIGNATURE=true` in production.
- Store Twilio auth tokens encrypted.
- Match inbound messages by destination phone number.

## CORS and Browser Access

The RAG service currently allows all origins. In production, keep the RAG service private and avoid browser access entirely.

For the backend, configure CORS according to deployment needs:

- Allow the admin frontend origin.
- Allow approved company website origins for widget calls.
- Avoid wildcard origins when credentials are used.

## Operational Checks

### Startup Order

1. Start MongoDB.
2. Start RAG service.
3. Start backend.
4. Start admin frontend or static frontend host.
5. Verify backend `/health`.
6. Upload a test PDF.
7. Ask a test question from admin chat.
8. Test widget chat on a real HTTP/HTTPS page.
9. Test webhooks if WhatsApp or SMS are enabled.

### Health Checks

Backend:

```text
GET /health
```

RAG service:

```text
GET /health
```

### Backups

Superadmins can open **Backup & Restore** in the admin console to download one
portable ZIP containing MongoDB collections and uploaded PDFs. On a new server,
upload that ZIP on the same page, type `RESTORE`, and confirm. The restore replaces
the current application records and PDFs, adjusts document paths for the new host,
The download first copies only live Chroma records and their stored embeddings into
a compact snapshot, excluding physical space retained after deletions. This does not
process PDFs or call the embeddings API. Restore uses that saved ChromaDB index directly. The RAG service
briefly restarts to reopen the restored index; PDFs are not reindexed.

Keep the ZIP encrypted and access-controlled because it contains admin accounts,
customer conversations, integration configuration, and source documents. Environment
variables are not included; configure the new server separately and reuse the same
integration encryption keys if encrypted provider tokens must remain readable.

For infrastructure-managed backups, back up:

- MongoDB database.
- Uploaded PDF storage.
- ChromaDB persistence directory.
- Environment secret records in a secure secret manager.

## Common Failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Widget says chat request failed | Wrong `apiBaseUrl`, company ID, or widget API key | Verify config and backend logs |
| `Invalid widget API key` | Key missing, rotated, or copied incorrectly | Generate a new key and update embed |
| RAG answer says no documents | Company has no indexed PDF vectors | Upload/reindex documents |
| RAG service 500 | Missing OpenAI key or Chroma/storage issue | Check `rag-service/.env` and logs |
| Google login fails | Client ID not in `GOOGLE_CLIENT_IDS` | Add correct client ID and restart backend |
| Website login fails | Missing external auth fields or bad signature | Configure external auth secret and token claims |
| Twilio webhook rejected | Signature validation mismatch | Check public URL and Twilio auth token |

## Release Checklist

- Build admin frontend.
- Build widget bundle.
- Run backend tests or at least smoke-test main endpoints.
- Run RAG service smoke tests.
- Verify all required environment variables are set.
- Confirm default admin password is changed.
- Confirm production webhook signature validation is enabled.
- Confirm OpenAI, WhatsApp, and Twilio keys are not committed.
- Confirm widget embed uses production URLs.
