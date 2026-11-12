# Acroprint / FPC18 Timeclock WebSocket Protocol

Integration brief for Carbon ERP (and other apps). Source analysis: Acroprint ProPunch / AcroprintWeb under `C:\xampp\htdocs\AcroprintWeb`, gateway binary `gateway\WSS.exe` (decompiled), and `app\Authority\Terminals\TerminalCommunicationHandler.php`.

**Device family:** Acroprint FPC18 (OEM cloud WebSocket clock).  
**Primary transport:** outbound WebSocket from clock → server (not classic ZK TCP 4370 pull).

---

## 1. Architecture

```
Timeclock (LAN)
    │  WebSocket text frames (JSON)
    │  ws://<ServerIP>:7788/pub/chat
    ▼
Gateway (WSS.exe / compatible replacement)
    │  HTTP POST JSON (loopback or same host)
    ▼
Application (AcroprintWeb today → Carbon ERP target)
```

| Component (Acroprint) | Role |
|----------------------|------|
| Clock firmware | Client; connects to configured Server IP |
| `gateway\WSS.exe` | Listens on **7788**; WebSocket + HTTP bridge |
| `service\pp-service.exe` | Process manager (Apache/MySQL/gateway); not clock I/O |
| Laravel `TerminalCommunicationHandler` | Command vocabulary and punch/enroll business logic |

### Clock configuration (device menu)

Official help (`Configure Time Clock Settings`):

1. `MENU` → `Set COM` → `Ethernet` — typically **Port No = 5005** (device local port; Acroprint cloud path does not drive clocks via this).
2. `Set COM` → `Server Setting` = **Yes**
3. **Server IP** = IPv4 of the machine running the WebSocket gateway
4. **SerPortNo** = **7788**

---

## 2. Transports

### 2.1 Clock ↔ Gateway — WebSocket

| Item | Value |
|------|--------|
| URL | `ws://<ServerIP>:7788/pub/chat` |
| Framing | Text WebSocket messages |
| Payload | JSON object |
| TLS | Not used by stock Acroprint gateway (plain `ws://`) |
| Who dials | **Clock** connects out to server |

**Session binding:** On first `cmd: "reg"`, gateway associates `sn` (serial number) with that WebSocket. Later commands for that SN are sent on the same socket.

**Wire cleanup (Acroprint gateway behavior):** Before sending app→clock JSON on the socket, gateway removes properties whose names start with `sn` and (when present) `seq`. Reimplementations should either strip those or tolerate clocks that ignore extra fields.

### 2.2 Application ↔ Gateway — HTTP JSON

| Direction | Method / URL | Body |
|-----------|--------------|------|
| App → Gateway | `POST http://localhost:7788/push_to_terminal` | JSON command including `sn` |
| Gateway → App | `POST http://localhost:<http-port>/AcroprintWeb/public/push_to_server` | JSON event/reply including `sn` |

Headers: `Content-Type: application/json` (Accept also set by gateway client).

Stock Acroprint gateway listens for HTTP POST on the **same** port as WebSocket (7788) via websocket-sharp `HttpServer`.

### 2.3 Reachability check (gateway-local)

App may POST `{ "cmd": "reachable", "sn": "..." }` to `/push_to_terminal`. Gateway answers by POSTing back to the app:

```json
{ "ret": "reachable", "result": true|false, "sn": "..." }
```

`result` reflects whether the bound WebSocket exists and `IsAlive` — not a new network probe to the clock.

---

## 3. Security / addressing model

**Can the hardware respond to hosts other than the configured Server IP?**

- **On this cloud WebSocket path: no (normal operation).** The clock only exchanges commands on the outbound session to **Server IP:7788**.
- Another LAN host cannot inject WebSocket commands unless the clock is connected to that host (Server IP changed), or the network path is intercepted.
- Stock gateway accepts **any** client that connects to `/pub/chat` (no IP allowlist / no mutual auth observed). Identity is effectively the JSON `sn` field.
- Device **Port 5005** may imply a separate local protocol in firmware; Acroprint’s analyzed software path does **not** use it for punch/enroll. Treat as unknown unless tested.

---

## 4. Message conventions

### Common fields

| Field | Meaning |
|-------|---------|
| `sn` | Terminal serial number (required for routing) |
| `cmd` | Request command name (clock→server or server→clock) |
| `ret` | Reply command name (usually mirrors the request) |
| `result` | Boolean success on replies |
| `cloudtime` | Server time string, format `Y-m-d H:i:s` (terminal timezone) |
| `seq` | App→gateway only: if truthy, gateway waits for a reply before sending next priority message (~5s, or ~20s for `initsys` / `cleanuser`) |

Clock-initiated messages use `cmd`. Application-initiated replies from the clock use `ret`.

---

## 5. Clock → server commands (`cmd`)

### 5.1 `reg` — registration / heartbeat-style register

Clock sends device inventory; app must ACK.

**Inbound (illustrative):**

```json
{
  "cmd": "reg",
  "sn": "XXXXXXXX",
  "devinfo": {
    "usersize": 0,
    "fpsize": 0,
    "cardsize": 0,
    "pwdsize": 0,
    "logsize": 0,
    "useduser": 0,
    "usedfp": 0,
    "usedcard": 0,
    "usedpwd": 0,
    "usedlog": 0,
    "usednewlog": 0,
    "fpalgo": "...",
    "firmware": "...",
    "time": "2026-10-12 09:30:00",
    "modelname": "..."
  }
}
```

**ACK:**

```json
{
  "ret": "reg",
  "result": true,
  "cloudtime": "2026-10-12 09:30:00",
  "sn": "XXXXXXXX"
}
```

Acroprint hardcodes displayed model as `FPC18` on first register regardless of `devinfo.modelname`.

### 5.2 `sendlog` — push punch records

**Inbound shape:**

```json
{
  "cmd": "sendlog",
  "sn": "XXXXXXXX",
  "count": 1,
  "record": [
    {
      "enrollid": 123,
      "time": "2026-10-12 09:15:00",
      "inout": 0,
      "event": 0,
      "mode": 0
    }
  ]
}
```

| Record field | Notes |
|--------------|--------|
| `enrollid` | Badge / enroll ID (maps to employee badge in Acroprint) |
| `time` | Punch timestamp string |
| `inout` | In/out indicator |
| `event` | Attendance event 0–16 (app-defined meaning; F1–F4 style buttons) |
| `mode` | `0` fingerprint, `1` card, `2` password |

**ACK:** `{ "ret": "sendlog", "result": true, "cloudtime": "...", "sn": "..." }`

### 5.3 `senduser` — push enrolled credential from clock

Used when a user is enrolled on the device; payload includes `enrollid`, `backupnum`, `admin`, `record` (template/card/password payload).

**ACK:** `{ "ret": "senduser", "result": true, "cloudtime": "...", "sn": "..." }`

---

## 6. Server → clock commands (`cmd`)

Send via gateway POST `/push_to_terminal` with `sn` set. On the WebSocket wire, omit `sn`/`seq` if mirroring Acroprint.

| `cmd` | Purpose |
|-------|---------|
| `getuserlist` | List users/records on device (`stn` bool for start vs continue) |
| `getuserinfo` | Fetch one record: `enrollid`, `backupnum` |
| `setuserinfo` | Write name/admin/record: `enrollid`, `name`, `backupnum`, `admin`, `record` |
| `setusername` | Batch/name update: `count`, `record` |
| `deleteuser` | Delete; `backupnum` `13` = all records, `12` = all fingerprints |
| `cleanuser` | Wipe all users |
| `cleanlog` | Clear attendance log |
| `initsys` | Soft init (often part of reset sequence) |
| `getdevinfo` / `setdevinfo` | Device info / params (e.g. `reverifytime`) |
| `settime` | `{ "cloudtime": "Y-m-d H:i:s" }` |
| `disabledevice` / `enabledevice` | Lock out / re-enable terminal during bulk updates |
| `reboot` | Reboot device |
| `opendoor`, `setdevlock`, `getdevlock`, `getuserlock`, `setuserlock`, `deleteuserlock` | Access-control helpers (partially stubbed in Acroprint PHP) |
| `getnewlog` | Pull unread attendance logs since last collect (Carbon Collect Now). First request must include `"stn": true`; continue pages with `"stn": false`. |
| `getalllog` | Pull full attendance log on the device (Carbon Collect all punches). Same `stn` pagination; optional `"from"` / `"to"` date strings. |
| `cleanadmin` / `setdeviceinfo` | Declared; limited handling in analyzed PHP |

**Typical reply from clock:** `{ "ret": "<cmd>", "result": true|false, "sn": "...", ...payload }`

**Log pull reply shape:** `{ "ret": "getalllog"|"getnewlog", "result": true, "count": N, "from": 0, "to": 49, "record": [ … ] }`. When `to + 1 < count`, the server sends `{ "cmd": "<same>", "stn": false }` for the next page.

### `backupnum` conventions (Acroprint)

| Value | Meaning |
|-------|---------|
| `0` … `11` | Fingerprint slots |
| `12` | All fingerprints (delete) |
| `13` | All user records (delete) |
| Password / card | Dedicated nums via `TerminalUserRecord` constants (`PASSWORD_NUM`, `CARD_NUM`) |

Password/card `record` values are coerced to integer when sending `setuserinfo`.

---

## 7. Soft reset sequence (Acroprint)

On first registration of a new SN:

1. `initsys`
2. `cleanlog`
3. `cleanuser`

---

## 8. Integration options for Carbon ERP

### Option A — Replace gateway (recommended for a clean Carbon feature)

1. Run a small WebSocket+HTTP service on **7788** implementing `/pub/chat` and `/push_to_terminal` (or fold HTTP into Carbon directly and only expose WS).
2. Point clock **Server IP** at the Carbon host (or a sidecar on that host).
3. Persist punches into Carbon attendance/time entries; map `enrollid` → employee.
4. Optionally implement enroll sync (`setuserinfo` / `senduser`) later.

### Option B — Keep `WSS.exe`, replace only the app

1. Leave Acroprint gateway running.
2. Change gateway `pushToAppPath` (or equivalent) to a Carbon HTTP endpoint that accepts the same JSON as `push_to_server`.
3. Carbon POSTs commands to `http://localhost:7788/push_to_terminal`.

### Option C — Dual-run during migration

Keep Acroprint for payroll UI; run a second listener only after changing clock Server IP (clock talks to one server at a time on this protocol).

---

## 9. Minimal viable Carbon feature

1. Accept `reg` → ACK with `cloudtime`.
2. Accept `sendlog` → create time punches → ACK.
3. Admin UI: list online clocks by `sn` / last `reg` or `sendlog`.
4. Document that clocks must set Server IP + SerPortNo 7788.

Defer: biometric template sync, door/lock commands, full user wipe/reset.

---

## 10. Evidence & limits

| Claim | Evidence |
|-------|----------|
| WS path `/pub/chat`, port 7788 | Decompiled `WSS.exe` (`AddWebSocketService<AppPusher>("/pub/chat")`, `ListenPort`) |
| HTTP `/push_to_terminal` | `WSS.exe.config` + decompiled POST handler |
| Command vocabulary | `TerminalCommunicationHandler.php` (not ionCube) |
| Server IP / 7788 on device | Acroprint help `ConfigureTimeClockSettings.html` |
| Many other PHP controllers | ionCube-encrypted; not required for protocol |
| Firmware behavior on port 5005 | Not verified |

---

## 11. Handoff checklist for another workflow

- [ ] Copy this brief into the Carbon repo (`docs/`) if the project should own it.
- [ ] Load skill `carbon-timeclock-integration` (personal agent store or project `.cursor/skills`).
- [ ] Confirm clock Server IP points at the intended host before testing.
- [ ] Open firewall TCP **7788** from clocks to server.
- [ ] Map `enrollid` ↔ Carbon employee identifiers.
- [ ] Decide Option A vs B before coding the network service.
