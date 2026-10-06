# Embeddable Chat Widget

The embeddable widget lets a company add the AI chatbot to its own website. It supports three customer modes:

| Mode | History behavior |
|------|------------------|
| Website account login | Loads history using the company website user ID from a signed token |
| Google login | Loads history using a verified Google account |
| Guest mode | Loads history from the same browser using `localStorage` |

## Build the widget

```powershell
npm.cmd run build:widget
```

Output:

```text
frontend/dist-widget/rag-chat-widget.iife.js
```

Host `rag-chat-widget.iife.js` somewhere public, then paste the embed code into the company website before the closing `body` tag.

## Basic embed code

```html
<script>
  async function getChatbotExternalUserToken() {
    try {
      const response = await fetch("/api/chatbot-user-token", {
        method: "GET",
        credentials: "include"
      });

      if (!response.ok) {
        return "";
      }

      const data = await response.json();
      return data.token || "";
    } catch (error) {
      return "";
    }
  }

  window.RAG_CHAT_WIDGET = {
    apiBaseUrl: "http://localhost:3000",
    companyId: "PASTE_COMPANY_ID",
    apiKey: "PASTE_WIDGET_API_KEY",

    title: "Pentarix AI Assistant",
    subtitle: "Ask us anything",
    accentColor: "#111827",
    position: "right",

    showExternalLogin: true,
    externalLoginButtonText: "Login with Website Account",
    getExternalUserToken: getChatbotExternalUserToken,
    externalLoginUrl: "/login",

    showGoogleLogin: true,
    googleClientId: "PASTE_GOOGLE_CLIENT_ID",

    allowGuest: true,
    guestText: "Continue without Login",

    welcomeText: "Welcome to Pentarix AI Assistant",
    loginText: "Login to load your saved chat history, or continue without login.",
    greeting: "Hi, how can I help?"
  };
</script>

<script src="http://localhost:5173/dist-widget/rag-chat-widget.iife.js"></script>
```

For production, replace:

```text
http://localhost:3000
http://localhost:5173/dist-widget/rag-chat-widget.iife.js
```

with your deployed backend URL and hosted widget file URL.

## How the three login modes work

### 1. Website account login

Use this when the client company already has its own users. The company website backend should create a signed chatbot user token for the currently logged-in user.

Flow:

```text
Customer logs into company website
↓
Widget calls /api/chatbot-user-token
↓
Company website backend returns signed token
↓
Widget sends token to chatbot backend
↓
Chatbot backend verifies token
↓
Backend creates web_external_<hash> session ID
↓
Previous chat history loads
```

The widget calls this function from the embed code:

```js
async function getChatbotExternalUserToken() {
  try {
    const response = await fetch("/api/chatbot-user-token", {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    return data.token || "";
  } catch (error) {
    return "";
  }
}
```

The company website should return:

```json
{
  "token": "SIGNED_CHATBOT_USER_TOKEN"
}
```

If the visitor is not logged in, return:

```json
{
  "token": ""
}
```

or return `401 Unauthorized`. The widget will still allow Google login or guest mode.

### 2. Google login

Use this when the customer wants saved history without a company website account.

Flow:

```text
Customer clicks Google login
↓
Google returns ID token
↓
Widget sends token to chatbot backend
↓
Backend verifies token using GOOGLE_CLIENT_IDS
↓
Backend creates web_google_<hash> session ID
↓
Previous chat history loads
```

Required backend environment variable:

```env
GOOGLE_CLIENT_IDS=PASTE_GOOGLE_CLIENT_ID
```

The same Google Client ID must be used in the widget config:

```js
googleClientId: "PASTE_GOOGLE_CLIENT_ID"
```

### 3. Guest mode

Use this when the customer does not want to login.

Flow:

```text
Customer clicks Continue without Login
↓
Widget creates web_guest_<uuid>
↓
Session ID is saved in browser localStorage
↓
Previous chat history loads on the same browser
```

Guest history does not work across different browsers or devices.

## Backend endpoints used by the widget

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/widget/companies/:companyId/chat` | Send chat message |
| `GET` | `/widget/companies/:companyId/chat/history/:sessionId` | Load previous messages |
| `POST` | `/widget/companies/:companyId/chat/auth/google` | Verify Google login |
| `POST` | `/widget/companies/:companyId/chat/auth/external` | Verify website-account login |

Every widget request must include the widget API key in this header:

```text
X-Widget-API-Key: PASTE_WIDGET_API_KEY
```

The widget adds this header automatically.

## Company website token endpoint example

This endpoint belongs to the client company website backend, not the chatbot backend.

```js
app.get("/api/chatbot-user-token", requireLogin, (req, res) => {
  const token = createChatbotUserToken({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    phone: req.user.phone || ""
  });

  res.json({ token });
});
```

The token payload should include:

```json
{
  "sub": "company-user-id-123",
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "+14165550123",
  "iss": "company-website",
  "aud": "rag-chat-widget",
  "exp": 1893456000
}
```

The company website backend signs this token using the shared external auth secret configured for that company in the chatbot backend.

Do not put the external auth secret in frontend JavaScript.

## Disabling login options

Only guest mode:

```js
showExternalLogin: false,
showGoogleLogin: false,
allowGuest: true
```

Google + guest only:

```js
showExternalLogin: false,
showGoogleLogin: true,
allowGuest: true
```

Website account + guest only:

```js
showExternalLogin: true,
showGoogleLogin: false,
allowGuest: true
```

Login required:

```js
showExternalLogin: true,
showGoogleLogin: true,
allowGuest: false
```

## Testing checklist

1. Generate a widget API key from the admin dashboard.
2. Build the widget using `npm.cmd run build:widget`.
3. Paste the generated embed code into a test HTML page.
4. Open the page through a local server, not `file://`.
5. Test guest mode and refresh the page.
6. Test Google login and refresh the page.
7. Test website-account login after creating `/api/chatbot-user-token` on the company website.
8. Check the admin dashboard Chat History page.

## Production checklist

- Host the widget file on HTTPS.
- Use deployed backend URL in `apiBaseUrl`.
- Use real widget API key generated from dashboard.
- Configure `GOOGLE_CLIENT_IDS` in backend if Google login is enabled.
- Configure the company external auth secret if website-account login is enabled.
- Never expose backend secrets or external auth secrets in frontend code.
