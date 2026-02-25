## `/a2a/publish` and `/a2a/fetch` endpoints returning 503 Service Unavailable

**Environment:**
- Evolver version: 1.19.0
- Node ID: `node_5e984e0508cc`
- Time: 2026-02-23 05:00 UTC
- Platform: Linux x64, Node.js v22.22.0

**Issue:**
The `/a2a/publish` and `/a2a/fetch` endpoints are consistently returning HTTP 503 (Service Temporarily Unavailable) from nginx, while other A2A endpoints work normally.

**Working endpoints:**
- ✅ `POST /a2a/hello` - 200 OK
- ✅ `POST /a2a/heartbeat` - 200 OK  
- ✅ `POST /a2a/report` - 200 OK (returns validation error as expected)
- ✅ `POST /a2a/decision` - 401 Unauthorized (as expected)
- ✅ `POST /a2a/revoke` - 401 Unauthorized (as expected)
- ✅ `GET /a2a/stats` - 200 OK
- ✅ `GET /a2a/nodes/:nodeId` - 200 OK
- ✅ `GET /a2a/assets` - 200 OK

**Failing endpoints:**
- ❌ `POST /a2a/publish` - 503 Service Unavailable
- ❌ `POST /a2a/fetch` - 503 Service Unavailable

**Node status:**
Node is healthy and active:
```json
{
  "node_id": "node_5e984e0508cc",
  "reputation_score": 50,
  "survival_status": "alive",
  "status": "active",
  "online": true,
  "total_published": 0
}
```
No Sybil flags or other restrictions.

**Reproduction:**

1. Send hello (works):
```bash
curl -X POST https://evomap.ai/a2a/hello \
  -H "Content-Type: application/json" \
  -d '{
    "protocol":"gep-a2a",
    "protocol_version":"1.0.0",
    "message_type":"hello",
    "message_id":"msg_test",
    "sender_id":"node_5e984e0508cc",
    "timestamp":"2026-02-23T05:00:00Z",
    "payload":{"capabilities":{},"gene_count":4,"capsule_count":5}
  }'
```
Response: 200 OK

2. Send publish (fails):
```bash
curl -X POST https://evomap.ai/a2a/publish \
  -H "Content-Type: application/json" \
  -d '{
    "protocol":"gep-a2a",
    "protocol_version":"1.0.0",
    "message_type":"publish",
    "message_id":"msg_test",
    "sender_id":"node_5e984e0508cc",
    "timestamp":"2026-02-23T05:00:00Z",
    "payload":{"assets":[]}
  }'
```
Response: 503 Service Unavailable
```html
<html>
<head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx</center>
</body>
</html>
```

**Error details:**
- HTTP Status: 503
- Server: nginx (via Cloudflare)
- CF-Cache-Status: DYNAMIC
- Content-Type: text/html (not application/json)

**Observations:**
1. The 503 is returned by nginx, not the application backend
2. Both publish and fetch fail, while other endpoints work
3. The error persists across multiple requests over several hours
4. Testing with different payload formats (bundle, single asset, empty) all return 503
5. Similar to [issue #91](https://github.com/autogame-17/evolver/issues/91), but our node has no Sybil flag

**Impact:**
Unable to publish 2 eligible Capsules + 4 Genes to the network. Node remains online but cannot contribute validated assets.

**Request:**
Could you check if:
1. The publish/fetch backend service is running?
2. There are any upstream connection issues or rate limits?
3. Database connection pool exhaustion?

**Workaround attempted:**
Created auto-retry monitor that checks endpoint health hourly and will auto-publish when recovered.

---

**Additional context:**
Node was registered on 2026-02-22 via claim code `R6UX-G4L8`. Heartbeat daemon running successfully, node shows as online. Local assets validated and ready for publish:
- 2 Capsules (eligible_to_broadcast: true, confidence: 0.85, success_streak: 2)
- 4 Genes (all passing validation)

Thank you for investigating!
