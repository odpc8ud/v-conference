/**
 * Auth.gs - ล็อกอินเจ้าหน้าที่ (User/Password) + ข้อมูลตารางประชุมสำหรับผู้ใช้ทั่วไป
 *
 * วิธีตั้งรหัสผ่านแอดมิน (ทำครั้งแรก และทุกครั้งที่ต้องการเพิ่ม/เปลี่ยนรหัส):
 *   1) แก้ USERNAME / PASSWORD ในฟังก์ชัน setAdminUser ด้านล่าง
 *   2) เลือกฟังก์ชัน setAdminUser แล้วกด Run
 *   3) ลบรหัสผ่านออกจากโค้ดทันที (ระบบเก็บเฉพาะค่า hash ใน Script Properties ชื่อ ADMIN_USERS)
 */
const SESSION_TTL_SEC = 6 * 60 * 60; // CacheService เก็บได้สูงสุด 6 ชม.
const MAX_LOGIN_FAILS = 5;           // ใส่ผิดครบกี่ครั้งถึงล็อก
const LOGIN_LOCK_SEC = 10 * 60;      // ล็อกกี่วินาที

function hashPassword_(salt, password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ":" + password, Utilities.Charset.UTF_8);
  return bytes.map(b => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

function getAdminUsers_() {
  const raw = PropertiesService.getScriptProperties().getProperty("ADMIN_USERS");
  return raw ? JSON.parse(raw) : {};
}

function setAdminUser() {
  const USERNAME = "";
  const PASSWORD = ""; //ใส่รหัสผ่านใหม่ของคุณที่นี่
  if (!USERNAME || PASSWORD.length < 8) {
    throw new Error("กรุณาแก้ USERNAME และตั้ง PASSWORD (อย่างน้อย 8 ตัวอักษร) ก่อนรัน");
  }
  const users = getAdminUsers_();
  const salt = Utilities.getUuid();
  users[USERNAME.trim().toLowerCase()] = { salt: salt, hash: hashPassword_(salt, PASSWORD) };
  PropertiesService.getScriptProperties().setProperty("ADMIN_USERS", JSON.stringify(users));
  Logger.log("บันทึกผู้ใช้ \"" + USERNAME + "\" แล้ว — อย่าลืมลบรหัสผ่านออกจากโค้ด");
}

function adminLogin(username, password) {
  try {
    username = String(username || "").trim().toLowerCase().slice(0, 50);
    password = String(password || "");
    const cache = CacheService.getScriptCache();
    const failKey = "fail:" + username;
    const fails = Number(cache.get(failKey) || 0);
    if (fails >= MAX_LOGIN_FAILS) {
      return { success: false, message: "ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่" };
    }
    const user = getAdminUsers_()[username];
    if (!user || user.hash !== hashPassword_(user.salt, password)) {
      cache.put(failKey, String(fails + 1), LOGIN_LOCK_SEC);
      return { success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
    }
    cache.remove(failKey);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put("sess:" + token, username, SESSION_TTL_SEC);
    return { success: true, token: token, username: username };
  } catch (err) {
    Logger.log("adminLogin error: " + err);
    return { success: false, message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }
}

function adminLogout(token) {
  if (token) CacheService.getScriptCache().remove("sess:" + token);
}

// คืนชื่อผู้ใช้ถ้า token ถูกต้องและยังไม่หมดอายุ ไม่งั้นคืน null
function getSessionUser_(token) {
  if (!token) return null;
  return CacheService.getScriptCache().get("sess:" + String(token)) || null;
}

// ======= PUBLIC: ตารางประชุมสำหรับผู้ใช้ทั่วไป (ไม่ต้องล็อกอิน) =======
// ส่งเฉพาะข้อมูลที่ไม่ลับ: ไม่มีอีเมล / ชื่อผู้ขอ / HOST ID / Password / Link
function getPublicSchedule() {
  const sheet = getSheet_();
  const { map } = getHeaderMap_(sheet);
  const tz = Session.getScriptTimeZone();
  const rows = sheet.getDataRange().getValues().slice(1);
  const iso = (d) => Utilities.formatDate(d, tz, "yyyy-MM-dd");
  const out = [];

  rows.forEach((row) => {
    const get = (name) => (map[name] === undefined ? "" : row[map[name]]);
    const startRaw = get("วันที่ประชุม");
    if (!startRaw) return;
    const bookingStatus = get("สถานะการจอง") || "รอดำเนินการ";
    const activityStatus = get("สถานะกิจกรรม") || "รอประชุม";
    // ใช้ indexOf เพราะในชีตมีทั้งค่า "ยกเลิก" และ "ยกเลิกประชุม"
    if (bookingStatus === "ไม่อนุมัติ" || String(activityStatus).indexOf("ยกเลิก") !== -1) return;

    const start = new Date(startRaw);
    if (isNaN(start.getTime())) return;
    let end = get("วันสิ้นสุดประชุม") ? new Date(get("วันสิ้นสุดประชุม")) : start;
    if (isNaN(end.getTime())) end = start;

    out.push({
      startIso: iso(start),
      endIso: iso(end),
      meetingTime: String(get("เวลาการประชุม") || ""),
      title: String(get("ชื่อการประชุม") || ""),
      group: String(get("กลุ่มงาน") || ""),
      room: String(get("สถานที่จัดประชุม") || ""),
      meetingRoom: String(get(MEETING_ROOM_HEADER) || ""),
      bookingStatus: bookingStatus,
      activityStatus: activityStatus
    });
  });

  out.sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
  return out;
}
