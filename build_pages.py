#!/usr/bin/env python3
"""แปลงไฟล์เทมเพลต Google Apps Script (Form/Admin/Schedule.html) เป็นเว็บ static สำหรับ GitHub Pages
ผลลัพธ์อยู่ในโฟลเดอร์ dist/  (รันอัตโนมัติโดย GitHub Actions ทุกครั้งที่ push)"""
import json, pathlib, re, shutil

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
    h = h.replace("<head>", "<head>\n" + SHIM, 1)
    assert "<?" not in h, f"{src}.html ยังมี scriptlet ของ Apps Script ที่แปลงไม่ครบ"
    (dist / dst).write_text(h, encoding="utf-8")

(dist / ".nojekyll").write_text("", encoding="utf-8")
print("สร้างเสร็จ:", ", ".join(PAGES.values()))
