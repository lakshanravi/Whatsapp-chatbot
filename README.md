# Pentarix AI Assistant

A multi-company RAG (Retrieval-Augmented Generation) customer support system. Each company uploads PDF knowledge-base documents, and customers can ask questions through web chat, WhatsApp, or SMS. Answers are grounded only in the selected company's documents.

## Current features

- Multi-company admin dashboard
- Company admin and superadmin access
- PDF upload and per-company vector indexing
- Web chat widget with guest mode, Google login, website-account login, and conversational ordering
- Persistent chat history for web, WhatsApp, and SMS users
- WhatsApp Cloud API integration per company
- Facebook Messenger Page integration per company
- SMS chatbot integration through Twilio per company
- Sinhala, English, and Tamil customer language preferences
- Structured product catalogues and guided conversational ordering
- Seller order dashboard with order status management
- Small-talk handling and query rewriting before RAG search
- Conversation storage in MongoDB
- ChromaDB vector collections isolated per company

## Architecture

```text
┌─────────────────────┐
│ Admin Dashboard      │
│ Company Website      │
│ Web Chat Widget      │
│ WhatsApp Customer    │
│ SMS Customer         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Node.js API          │
│ Express Backend      │
│ Auth + Integrations  │
│ Chat + Webhooks      │
└──────────┬──────────┘
           │
           ├──────────────► MongoDB
           │                 Companies, documents,
           │                 integrations, conversations,
           │                 SMS logs
           │
           └──────────────► Python RAG Service
                             FastAPI + ChromaDB + OpenAI
```

| Component | Role |
|-----------|------|
| `frontend/` | React admin dashboard and widget embed generator |
| `backend/` | Express API, authentication, company management, integrations, chat, webhooks |
| `rag-service/` | PDF parsing, chunking, embeddings, vector search, LLM answers |
| MongoDB | Stores users, companies, documents, integrations, conversations, SMS logs |
| ChromaDB | Stores vector indexes per company |
| Meta WhatsApp Cloud API | WhatsApp customer messages |
| Twilio Programmable Messaging | SMS customer messages |

## Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB running locally or MongoDB Atlas URI
- OpenAI API key
- Meta WhatsApp Cloud API account for WhatsApp integration
- Twilio account for SMS integration

## Setup

### 1. Python RAG service

```bash
cd rag-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Install the free Tesseract OCR executable separately. On Windows, install
Tesseract and either add its installation directory to `PATH` or set:

```env
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

On Ubuntu/Debian:

```bash
sudo apt-get install tesseract-ocr
```

Set your OpenAI key in `rag-service/.env`.

Start the RAG service:

```bash
uvicorn app.main:app --reload --port 8000
```

RAG service: `http://localhost:8000`  
RAG API docs: `http://localhost:8000/docs`

### 2. Node.js backend

```bash
cd backend
npm install
npm install google-auth-library twilio
copy .env.example .env
```

Start the backend:

```bash
npm run dev
```

Backend: `http://localhost:3000`

### 3. Frontend admin dashboard

```bash
cd frontend
npm install
npm run dev
```

### 4. Build web chat widget

```powershell
cd frontend
npm.cmd run build:widget
```

Output:

```text
frontend/dist-widget/rag-chat-widget.iife.js
```

## Backend environment variables

Add these values to `backend/.env`.

| Variable | Example / Default | Description |
|----------|-------------------|-------------|
| `PORT` | `3000` | Backend API port |
| `MONGODB_URI` | `mongodb://localhost:27017/rag_chatbot` | MongoDB connection string |
| `RAG_SERVICE_URL` | `http://localhost:8000` | Python RAG service URL |
| `RAG_SERVICE_API_KEY` | long random shared secret | Authenticates backend requests to the RAG service; use the same value in both services |
| `UPLOAD_DIR` | `./uploads` | Uploaded PDF storage folder |
| `JWT_SECRET` | long random secret | Admin JWT signing secret and hashing salt |
| `SUPER_ADMIN_EMAIL` | `admin@example.com` | Seeded superadmin email |
| `SUPER_ADMIN_PASSWORD` | `admin123` | Seeded superadmin password |
| `GOOGLE_CLIENT_IDS` | Google OAuth client ID | Comma-separated Google Client IDs for widget Google login |
| `OPENAI_API_KEY` | OpenAI key | Used by message preprocessing / query rewriting |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Model used for query rewrite / intent classification |
| `GRAPH_API_VERSION` | `v20.0` | Meta Graph API version |
| `WHATSAPP_VERIFY_TOKEN` | custom verify token | Used for Meta WhatsApp webhook verification |
| `WHATSAPP_APP_SECRET` | Meta App Secret | Validates incoming WhatsApp webhook signatures |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | long random secret | Encrypts company WhatsApp access tokens |
| `MESSENGER_VERIFY_TOKEN` | custom verify token | Used for Facebook Messenger webhook verification |
| `MESSENGER_APP_SECRET` | Meta App Secret | Validates Messenger webhook signatures |
| `MESSENGER_TOKEN_ENCRYPTION_KEY` | long random secret | Encrypts seller Page access tokens |
| `SMS_TOKEN_ENCRYPTION_KEY` | long random secret | Encrypts company Twilio Auth Tokens |
| `PUBLIC_BACKEND_URL` | `https://api.yourdomain.com` | Public backend URL shown in integration pages and used for callbacks |
| `TWILIO_VALIDATE_WEBHOOK_SIGNATURE` | `true` | Enables Twilio webhook signature validation |

For local SMS webhook testing with ngrok, you can temporarily use:

```env
TWILIO_VALIDATE_WEBHOOK_SIGNATURE=false
PUBLIC_BACKEND_URL=https://your-ngrok-url.ngrok-free.app
```

Use `TWILIO_VALIDATE_WEBHOOK_SIGNATURE=true` in production.

## RAG service environment variables

Add these values to `rag-service/.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | Required OpenAI key |
| `RAG_SERVICE_API_KEY` | - | Required shared secret matching the backend value |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embeddings model |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Chat model |
| `CHROMA_PERSIST_DIR` | `./chroma_data` | Vector DB path |
| `CHUNK_SIZE` | `600` | Characters per chunk |
| `CHUNK_OVERLAP` | `150` | Overlap between chunks |
| `TOP_K` | `6` | Final chunks supplied to the answer model |
| `RETRIEVAL_CANDIDATES` | `40` | Hybrid-search candidates considered before reranking |
| `MINIMUM_RELEVANCE_SCORE` | `0.25` | Rejects weak retrieval results |
| `ENABLE_RERANKING` | `true` | Reranks retrieved chunks before answering |
| `ENABLE_ANSWER_VERIFICATION` | `true` | Removes answer claims unsupported by retrieved PDF text |
| `ENABLE_NUMERIC_VERIFICATION` | `true` | Rejects technical values not present in their cited source |
| `CONVERSATION_HISTORY_MESSAGES` | `16` | Recent messages considered before product-topic isolation |
| `NEIGHBOR_CHUNKS` | `1` | Adjacent chunks attached around every retrieved match |
| `ENABLE_MULTILINGUAL_SEARCH` | `true` | Searches both the original question and English translation |
| `ENABLE_LOCAL_CROSS_ENCODER` | `false` | Uses the optional dedicated local reranker |
| `CROSS_ENCODER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Local reranking model |
| `ENABLE_LOCAL_OCR` | `true` | Uses free local Tesseract OCR on low-text pages |
| `OCR_MIN_PAGE_CHARACTERS` | `80` | Runs OCR when extracted page text is shorter than this |
| `OCR_IMAGE_RICH_PAGES` | `true` | Also OCRs image-rich pages with limited extracted text |
| `OCR_IMAGE_PAGE_CHARACTER_LIMIT` | `1200` | Maximum extracted characters for image-rich OCR |
| `OCR_DPI` | `300` | Resolution used to render pages for OCR |
| `OCR_LANGUAGE` | `eng` | Installed Tesseract language code or codes, such as `eng+sin` |
| `TESSERACT_CMD` | empty | Optional full path to the Tesseract executable |
| `DESCRIBE_PDF_IMAGES` | `true` | Enables model-based extraction for images, diagrams, and visual tables |
| `DESCRIBE_FULL_VISUAL_PAGES` | `true` | Renders visually complex/vector PDF pages for complete diagram extraction |
| `VISION_PAGE_DPI` | `300` | Render resolution sent to the vision model |
| `VISION_MAX_TOKENS` | `1400` | Maximum technical extraction length per visual page or image |
| `VISION_PAGE_CHARACTER_LIMIT` | `1600` | Treats image-bearing pages below this text length as visual pages |
| `MIN_VECTOR_DRAWINGS_FOR_VISUAL_PAGE` | `8` | Detects vector technical drawings that contain no embedded raster image |
| `MAX_DESCRIBED_IMAGES_PER_PAGE` | `3` | Caps paid image descriptions per PDF page |

Install the optional local cross-encoder with:

```bash
pip install -r requirements-reranker.txt
```

Then set `ENABLE_LOCAL_CROSS_ENCODER=true`. The first start downloads the
configured model and requires additional memory.

Run the accuracy evaluation after replacing the example cases:

```bash
python evaluation/run_evaluation.py evaluation/questions.example.jsonl
```

## Web chat widget identity and history

The web widget supports three customer modes.

| Mode | How identity is created | History behavior |
|------|--------------------------|------------------|
| Website account login | Company website backend returns a signed external user token | Loads previous history for the same website user ID |
| Google login | Widget sends Google ID token to backend and backend verifies it | Loads previous history for the same Google account |
| Guest mode | Widget creates `web_guest_<uuid>` and stores it in browser `localStorage` | Loads previous history only in the same browser |

The backend converts identities into stable session IDs:

```text
Website account: web_external_<hash>
Google account:  web_google_<hash>
Guest browser:   web_guest_<uuid>
```

The public widget routes are protected with the widget API key.

### Widget public routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/widget/companies/:companyId/chat` | Send web widget message |
| `GET` | `/widget/companies/:companyId/chat/history/:sessionId` | Load web widget chat history |
| `POST` | `/widget/companies/:companyId/chat/auth/google` | Verify Google login and return chatbot session |
| `POST` | `/widget/companies/:companyId/chat/auth/external` | Verify company website user token and return chatbot session |

## API usage

### Health check

```bash
curl http://localhost:3000/health
```

### Create company

```bash
curl -X POST http://localhost:3000/api/companies \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Acme Support\", \"description\": \"Acme customer help\"}"
```

Save the returned `_id` as `COMPANY_ID`.

### Upload PDF

```bash
curl -X POST http://localhost:3000/api/companies/COMPANY_ID/documents \
  -F "file=@path/to/your-faq.pdf"
```

### List documents

```bash
curl http://localhost:3000/api/companies/COMPANY_ID/documents
```

### Chat from admin/API

```bash
curl -X POST http://localhost:3000/api/companies/COMPANY_ID/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"How do I reset my password?\"}"
```

Response includes `answer`, `sources`, and `sessionId`.

Follow-up message:

```bash
curl -X POST http://localhost:3000/api/companies/COMPANY_ID/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"What are your support hours?\", \"sessionId\": \"SESSION_ID_FROM_PREVIOUS\"}"
```

### View chat history as admin

```bash
curl http://localhost:3000/api/companies/COMPANY_ID/chat/conversations
curl http://localhost:3000/api/companies/COMPANY_ID/chat/history/SESSION_ID
```

### Delete document

```bash
curl -X DELETE http://localhost:3000/api/companies/COMPANY_ID/documents/DOCUMENT_ID
```

## WhatsApp integration

Each company can save its own Meta WhatsApp Cloud API credentials. The access token is encrypted before it is stored in MongoDB.

### Save WhatsApp integration

```bash
curl -X POST http://localhost:3000/api/companies/COMPANY_ID/whatsapp-integration \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumberId\": \"1175322778994139\", \"accessToken\": \"META_ACCESS_TOKEN\", \"isActive\": true}"
```

### Manage WhatsApp integration

```bash
curl http://localhost:3000/api/companies/COMPANY_ID/whatsapp-integration

curl -X PUT http://localhost:3000/api/companies/COMPANY_ID/whatsapp-integration \
  -H "Content-Type: application/json" \
  -d "{\"isActive\": true}"

curl -X POST http://localhost:3000/api/companies/COMPANY_ID/whatsapp-integration/validate

curl -X DELETE http://localhost:3000/api/companies/COMPANY_ID/whatsapp-integration
```

### WhatsApp manual send

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d "{\"companyId\": \"COMPANY_ID\", \"to\": \"94771234567\", \"text\": \"Hello from the support chatbot\"}"
```

### WhatsApp webhook setup

Use these endpoints in Meta webhook configuration:

```text
GET  /api/whatsapp/webhook
POST /api/whatsapp/webhook
```

Incoming WhatsApp messages are matched to a company by the Meta `phone_number_id`. The conversation session ID uses:

```text
whatsapp:<customerWaId>
```

## SMS integration

Each company can save its own Twilio Programmable Messaging credentials. The Twilio Auth Token is encrypted before it is stored in MongoDB.

### Save SMS integration

```bash
curl -X POST http://localhost:3000/api/companies/COMPANY_ID/sms-integration \
  -H "Content-Type: application/json" \
  -d "{\"accountSid\": \"ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\", \"authToken\": \"TWILIO_AUTH_TOKEN\", \"phoneNumber\": \"+14165550100\", \"isActive\": true}"
```

### Manage SMS integration

```bash
curl http://localhost:3000/api/companies/COMPANY_ID/sms-integration

curl -X PUT http://localhost:3000/api/companies/COMPANY_ID/sms-integration \
  -H "Content-Type: application/json" \
  -d "{\"isActive\": true}"

curl -X POST http://localhost:3000/api/companies/COMPANY_ID/sms-integration/validate

curl -X DELETE http://localhost:3000/api/companies/COMPANY_ID/sms-integration
```

### SMS manual send

```bash
curl -X POST http://localhost:3000/api/sms/send \
  -H "Content-Type: application/json" \
  -d "{\"companyId\": \"COMPANY_ID\", \"to\": \"+14165550123\", \"text\": \"Hello from the SMS chatbot\"}"
```

### Twilio webhook setup

Configure these URLs in the Twilio phone number messaging settings:

```text
Incoming SMS Webhook:
POST https://your-backend-domain.com/api/sms/webhook

Status Callback:
POST https://your-backend-domain.com/api/sms/status
```

For local testing with ngrok:

```text
POST https://your-ngrok-url.ngrok-free.app/api/sms/webhook
POST https://your-ngrok-url.ngrok-free.app/api/sms/status
```

Incoming SMS messages are matched to a company by the Twilio `To` number. The conversation session ID uses:

```text
sms:<customerPhoneNumber>
```

## Messenger and conversational ordering

Each seller can connect one Facebook Page from the **Messenger Integration** screen. Configure the Meta callback URL as:

```text
GET/POST https://your-backend-domain.com/api/messenger/webhook
```

Subscribe the Page to `messages` and `messaging_postbacks`. Incoming web, WhatsApp, and Messenger customers are first asked to choose Sinhala, English, or Tamil. Their preference is stored with the conversation and is passed to the RAG answer service.

Sellers manage structured, orderable products from the **Products** screen. When a customer asks to order, the bot collects the product, variant, quantity, customer details, delivery address, payment method, and confirmation. Confirmed orders appear in the **Orders** screen with this workflow:

```text
new -> confirmed -> processing -> shipped -> delivered
                                  \-> cancelled
```

## API endpoints summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Backend + RAG health |
| `POST` | `/api/auth/login` | Admin login |
| `GET` | `/api/auth/me` | Current admin user |
| `POST` | `/api/companies` | Create company |
| `GET` | `/api/companies` | List companies |
| `GET/PUT/DELETE` | `/api/companies/:id` | Get, update, delete company |
| `POST` | `/api/companies/:id/widget-api-key` | Generate/rotate widget API key |
| `POST` | `/api/companies/:id/documents` | Upload PDF |
| `GET` | `/api/companies/:id/documents` | List documents |
| `DELETE` | `/api/companies/:id/documents/:docId` | Delete PDF and vectors |
| `POST` | `/api/companies/:id/documents/:docId/reindex` | Re-index PDF |
| `GET` | `/api/backups/download` | Download a portable full-system backup ZIP (superadmin) |
| `POST` | `/api/backups/restore` | Restore a backup ZIP and rebuild indexes (superadmin) |
| `POST` | `/api/companies/:id/chat` | Ask question from admin/API |
| `GET` | `/api/companies/:id/chat/conversations` | List conversations |
| `GET` | `/api/companies/:id/chat/history/:sessionId` | Full conversation |
| `POST` | `/widget/companies/:companyId/chat` | Public web widget chat |
| `GET` | `/widget/companies/:companyId/chat/history/:sessionId` | Public widget history |
| `POST` | `/widget/companies/:companyId/chat/auth/google` | Widget Google login |
| `POST` | `/widget/companies/:companyId/chat/auth/external` | Widget website-account login |
| `POST` | `/api/companies/:id/whatsapp-integration` | Create WhatsApp integration |
| `GET/PUT/DELETE` | `/api/companies/:id/whatsapp-integration` | Manage WhatsApp integration |
| `POST` | `/api/companies/:id/whatsapp-integration/validate` | Validate WhatsApp integration |
| `GET` | `/api/whatsapp/webhook` | Verify Meta WhatsApp webhook |
| `POST` | `/api/whatsapp/webhook` | Receive WhatsApp webhook messages |
| `POST` | `/api/whatsapp/send` | Send WhatsApp text message |
| `POST` | `/api/companies/:id/sms-integration` | Create SMS integration |
| `GET/PUT/DELETE` | `/api/companies/:id/sms-integration` | Manage SMS integration |
| `POST` | `/api/companies/:id/sms-integration/validate` | Validate SMS integration |
| `POST` | `/api/sms/webhook` | Receive Twilio inbound SMS |
| `POST` | `/api/sms/status` | Receive Twilio message status callback |
| `POST` | `/api/sms/send` | Send SMS text message |
| `GET/POST/PUT/DELETE` | `/api/companies/:id/messenger-integration` | Manage seller Messenger connection |
| `POST` | `/api/companies/:id/messenger-integration/validate` | Validate the connected Facebook Page |
| `GET/POST/PUT/DELETE` | `/api/companies/:id/products` | Manage the seller product catalogue |
| `GET` | `/api/companies/:id/orders` | List and filter seller orders |
| `GET` | `/api/companies/:id/orders/summary` | Order dashboard counts and value |
| `PATCH` | `/api/companies/:id/orders/:orderId/status` | Update an order status |
| `GET/POST` | `/api/messenger/webhook` | Verify and receive Messenger events |

## Python RAG service endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health |
| `POST` | `/ingest` | Index a PDF |
| `DELETE` | `/documents` | Remove document vectors |
| `POST` | `/query` | RAG Q&A |

## Multi-tenancy

- Each company gets an isolated ChromaDB collection named `company_{id}`.
- All RAG queries include `company_id`.
- Company A cannot access Company B documents or conversations.
- Uploaded PDFs are stored under `backend/uploads/{companyId}/`.
- Duplicate detection uses the PDF content hash. Different PDFs remain active even when their filenames are the same or similar; activation never deactivates a filename match automatically.
- WhatsApp integrations are matched by Meta `phone_number_id`.
- SMS integrations are matched by Twilio `To` phone number.
- Web widget history is matched by `companyId + sessionId`.

## Conversation session IDs

| Channel | Session ID pattern |
|---------|--------------------|
| Web guest | `web_guest_<uuid>` |
| Web Google | `web_google_<hash>` |
| Web website-account | `web_external_<hash>` |
| WhatsApp | `whatsapp:<waId>` |
| SMS | `sms:<phoneNumber>` |
| Admin chat test | custom session ID or generated session ID |

## Testing order

1. Start MongoDB.
2. Start the RAG service.
3. Start the backend.
4. Start the admin frontend.
5. Create a company.
6. Upload at least one PDF.
7. Test normal admin chat.
8. Generate widget API key and test guest web history.
9. Test Google login and website-account login if configured.
10. Save and validate WhatsApp integration.
11. Save and validate SMS integration.
12. Configure public webhook URLs in Meta and Twilio.

For repeatable PDF-answer checks, edit `rag-service/evals/qa_regression.json` and run:

```powershell
cd rag-service
$env:QA_COMPANY_ID="your-company-id"
$env:RAG_SERVICE_URL="http://localhost:8000"
python evals/run_regression.py
```

Each regression question is sent with empty history so results cannot leak between products.

### Fast lexical + intelligent retrieval

The RAG service keeps the existing Chroma embeddings and automatically builds a
SQLite FTS5 sidecar from the chunks already stored in Chroma. This does not
reprocess PDFs, call the embeddings API, or replace the Chroma index. The default
file is `rag-service/chroma_data/lexical_index.sqlite3`; set
`FTS_PERSIST_PATH` to place it elsewhere.

On the first query after enabling this version, the service copies existing chunk
text and metadata into FTS5 once. Later queries use model-aware full-text search
first and invoke semantic retrieval only as a bounded fallback. Simple factual
questions skip LLM query planning, while comparisons, compatibility questions,
recommendations, and troubleshooting can run up to four focused searches.

If the Chroma collection changes through document upload, deletion, or active-state
updates, the service invalidates the sidecar state and rebuilds it automatically
from the current chunks on the next query. No embeddings are regenerated.

## Future phases

- Voice call integration
- AWS S3 file storage
- Advanced analytics dashboard
- Delivery status dashboard for SMS/WhatsApp
- Human handoff / live agent escalation
