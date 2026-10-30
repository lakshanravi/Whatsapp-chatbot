# Meta Channel Onboarding

Pentarix uses one platform-owned Meta App. Every customer continues to own its Meta Business Portfolio, WhatsApp Business Account, phone number, and Facebook Page. The customer grants the Pentarix App permission to automate only the asset selected during Meta authorization.

## One-time Pentarix setup

1. Create a Meta Business app for Pentarix AI Assistant.
2. Add the WhatsApp and Messenger products.
3. Complete Meta business verification and request the production access required for customer-owned assets.
4. Configure these public HTTPS callbacks:

```text
https://api.yourdomain.com/api/whatsapp/webhook
https://api.yourdomain.com/api/messenger/webhook
```

5. Subscribe WhatsApp to the `messages` field and Messenger to `messages` and `messaging_postbacks`.
6. In the WhatsApp Embedded Signup builder, create a configuration and copy its configuration ID.
7. Configure Facebook Login allowed domains for the hosted Pentarix dashboard. A Facebook Login for Business configuration can be supplied for Messenger.
8. Add the production values to `backend/.env`:

```env
NODE_ENV=production
PUBLIC_BACKEND_URL=https://api.yourdomain.com
GRAPH_API_VERSION=v26.0

META_APP_ID=your_pentarix_meta_app_id
META_APP_SECRET=your_pentarix_meta_app_secret
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=your_whatsapp_configuration_id
MESSENGER_LOGIN_CONFIG_ID=your_optional_facebook_login_configuration_id

WHATSAPP_VERIFY_TOKEN=a_long_random_webhook_token
WHATSAPP_TOKEN_ENCRYPTION_KEY=a_long_random_encryption_secret
MESSENGER_VERIFY_TOKEN=a_different_random_webhook_token
MESSENGER_TOKEN_ENCRYPTION_KEY=a_different_random_encryption_secret
```

`META_APP_SECRET` is server-only. Never add it to the frontend environment or source bundle.

## Customer WhatsApp connection

1. The company administrator opens **WhatsApp** in Pentarix.
2. They click **Connect with Meta**.
3. Meta asks them to sign in, choose their business, choose or create a WABA, and verify their own number.
4. Meta returns a one-time code plus the WABA and phone-number IDs.
5. The Pentarix backend exchanges the code, verifies that the number belongs to the selected WABA, subscribes the WABA to the Pentarix webhook, encrypts the token, and stores the integration against the company.

## Customer Messenger connection

1. The company administrator opens **Messenger** in Pentarix.
2. They click **Connect with Facebook** and approve the requested Page permissions.
3. Pentarix displays only Pages returned by Meta for that administrator.
4. The administrator chooses a Page.
5. The backend fetches its Page token, subscribes the Page to Messenger webhooks, encrypts the token, and stores the integration against the company.

## Testing before live delivery

- Use Meta app-role/test accounts while the app is in development mode.
- Send a real inbound message to the connected WhatsApp number and Facebook Page.
- Confirm language buttons, PDF answers, PDF images, catalogue answers, multi-item ordering, order creation, and dashboard visibility.
- Test disconnect and reconnect for both channels.
- Switch the Meta App to Live only after the required permissions, privacy policy, data deletion instructions, business verification, and app review requirements are complete.

The advanced manual forms remain for controlled support and migration. Normal customers should use the Meta authorization buttons.
