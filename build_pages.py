#!/usr/bin/env python3
"""แปลงไฟล์เทมเพลต Google Apps Script (Form/Admin/Schedule.html) เป็นเว็บ static สำหรับ GitHub Pages
ผลลัพธ์อยู่ในโฟลเดอร์ dist/  (รันอัตโนมัติโดย GitHub Actions ทุกครั้งที่ push)"""
import datetime, json, pathlib, re, shutil

ROOT = pathlib.Path(__file__).resolve().parent
cfg = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
GAS_URL = cfg["gasUrl"]
ROOM_LINK = cfg.get("roomBookingLink", "")
assert GAS_URL.startswith("https://script.google.com/") and GAS_URL.endswith("/exec") and "ใส่" not in GAS_URL, \
    "แก้ gasUrl ใน site.config.json ให้เป็น URL /exec ของ Web App ก่อน"

STYLE = (ROOT / "Style.html").read_text(encoding="utf-8")

# ตัวแปลง: ทำให้ google.script.run.xxx() ทำงานผ่าน fetch ไปยัง doPost ของ Apps Script
SHIM = """<script>
(function () {
  var GAS_URL = %s;
  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === "withSuccessHandler") return function (fn) { return runner(fn, fail); };
        if (name === "withFailureHandler") return function (fn) { return runner(ok, fn); };
        if (typeof name !== "string") return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch(GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ fn: name, args: args })
          })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (j.ok) { if (ok) ok(j.result); }
              else if (fail) fail({ message: j.error });
              else console.error(j.error);
            }, function (e) {
              if (fail) fail({ message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (" + e.message + ")" });
            });
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };
})();
</script>""" % json.dumps(GAS_URL)

# ไอคอนเว็บ (favicon) — ไฟล์อยู่ที่ root ของ repo จะถูกคัดลอกไปไว้ใน dist/ ด้วย
FAVICON_FILES = ["favicon.ico", "favicon.png", "apple-touch-icon.png"]
FAVICON_TAGS = """<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">"""

# Service Worker: ถ้า GitHub Pages ล่ม ผู้ที่เคยเปิดเว็บมาก่อนจะยังเปิดหน้าจากแคชได้
# (ข้อมูลยังดึงจาก GAS ตามปกติ) และถ้าไม่มีแคชจะถูกพาไปลิงก์ GAS ที่ตรงกับหน้านั้นอัตโนมัติ
SW_REG = '<script>if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }</script>'
SW_TEMPLATE = r"""const CACHE = "odpc8-__BUILD__";
const GAS_URL = "__GAS_URL__";
const PRECACHE = ["./", "index.html", "admin.html", "schedule.html", "favicon.png"];
const TIMEOUT_MS = 6000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // ไม่ยุ่งกับการเรียก API ไป GAS
  e.respondWith(networkFirst(req));
});

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), TIMEOUT_MS);
    if (!res.ok) throw new Error("bad status " + res.status);
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === "navigate") return redirectToGas(req);
    return Response.error();
  }
}

function redirectToGas(req) {
  const path = new URL(req.url).pathname;
  const page = /admin\.html$/.test(path) ? "admin" : /schedule\.html$/.test(path) ? "schedule" : "form";
  const target = GAS_URL + "?page=" + page;
  const html = '<!doctype html><meta charset="utf-8"><title>ODPC8</title>' +
    '<meta http-equiv="refresh" content="0;url=' + target + '">' +
    '<p style="font-family:sans-serif">กำลังพาไปยังลิงก์สำรอง… <a href="' + target + '">คลิกที่นี่ถ้าหน้าไม่เปลี่ยน</a></p>';
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
"""

PAGES = {"Form": "index.html", "Admin": "admin.html", "Schedule": "schedule.html"}
LINKS = {"form": "./", "admin": "admin.html", "schedule": "schedule.html"}

dist = ROOT / "dist"
if dist.exists():
    shutil.rmtree(dist)
dist.mkdir()

for src, dst in PAGES.items():
    h = (ROOT / f"{src}.html").read_text(encoding="utf-8")
    h = re.sub(r"<\?!=\s*include\('Style'\);\s*\?>", lambda m: STYLE, h)
    h = re.sub(r"<\?=\s*baseUrl\s*\?>\?page=(\w+)", lambda m: LINKS[m.group(1)], h)
    h = re.sub(r"<\?=\s*roomBookingLink\s*\?>", lambda m: ROOM_LINK, h)
    h = h.replace("<head>", "<head>\n" + FAVICON_TAGS + "\n" + SW_REG + "\n" + SHIM, 1)
    assert "<?" not in h, f"{src}.html ยังมี scriptlet ของ Apps Script ที่แปลงไม่ครบ"
    (dist / dst).write_text(h, encoding="utf-8")

for name in FAVICON_FILES:
    assert (ROOT / name).exists(), f"ไม่พบไฟล์ {name} ใน repo (ต้องอัปโหลดไว้ที่ root)"
    shutil.copy(ROOT / name, dist / name)

stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
(dist / "sw.js").write_text(SW_TEMPLATE.replace("__BUILD__", stamp).replace("__GAS_URL__", GAS_URL), encoding="utf-8")
(dist / ".nojekyll").write_text("", encoding="utf-8")
print("สร้างเสร็จ:", ", ".join(PAGES.values()))
