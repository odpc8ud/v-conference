/**
 * ODPC8 Conference Meeting - Web App
 * แทนที่ Google Form เดิมด้วย Web App ที่เขียนข้อมูลลง Sheet เดียวกัน
 * รวมทุกการแจ้งเตือน Telegram ไว้ในโปรเจกต์เดียวนี้ทั้งหมดแล้ว:
 *   1) แจ้งทันทีเมื่อมีคำขอใหม่               → submitRequest()
 *   2) แจ้งประชุมวันนี้ (ตั้ง trigger 06:00-07:00) → sendMeetingReminderToday()
 *   3) แจ้งล่วงหน้า 1 วัน (ตั้ง trigger 16:00-17:00) → sendMeetingReminder()
 * (ไม่ต้องใช้โปรเจกต์ "ODPC8 Meeting Notify" แยกต่างหากอีกต่อไป — ดูวิธีย้าย trigger ที่คอมเมนต์
 *  เหนือฟังก์ชัน sendMeetingReminder ด้านล่าง)
 *
 * โครงสร้างไฟล์:
 *   Code.gs   - โค้ดฝั่งเซิร์ฟเวอร์ (ไฟล์นี้)
 *   Style.html - CSS ที่ใช้ร่วมกันทั้งสองหน้า
 *   Form.html  - หน้าฟอร์มขอใช้ห้องประชุม (สำหรับผู้ขอใช้งานทั่วไป)
 *   Admin.html - หน้าแอดมินสำหรับกรอก HOST ID / Password / สถานะ
 *
 * !! ก่อนใช้งาน ต้องเพิ่มคอลัมน์ใหม่ในชีต Host_Request_Conference ด้วยตนเอง 3 คอลัมน์:
 *    1) "อีเมลผู้ขอใช้งาน" (ตรงกับค่า EMAIL_HEADER ด้านล่าง)
 *    2) "อีเมลแจ้งผลส่งแล้วเมื่อ" (ตรงกับค่า EMAIL_SENT_HEADER ด้านล่าง) — ใช้เก็บว่าเคยส่งอีเมลแจ้งผลไปแล้วหรือยัง/เมื่อไหร่
 *    3) "Meeting Room" (ตรงกับค่า MEETING_ROOM_HEADER ด้านล่าง) — ชื่อระบบ/ห้อง host ที่ใช้ เช่น V-Con 1, V-Con 2, Webex ODPC8
 *    เพิ่ม header ทั้งสามชื่อนี้ในแถวที่ 1 ของชีต ตำแหน่งคอลัมน์ไหนก็ได้ โค้ดจะหาเจอเองจากชื่อ header
 *
 * !! การส่งอีเมล (MailApp.sendEmail) ต้องขออนุญาต scope เพิ่มตอนรันครั้งแรก
 *    เมื่อกด "บันทึกข้อมูล" พร้อมติ๊กส่งอีเมลครั้งแรก Google จะขึ้นหน้าขออนุญาตให้กดอนุมัติ
 */

// ======= CONFIG =======
const SHEET_NAME = "Host_Request_Conference";

// การล็อกอินแอดมิน (User/Password) อยู่ในไฟล์ Auth.gs
const TITLES = {
  Admin: "ODPC8 - จัดการคำขอประชุม",
  Schedule: "ODPC8 - ตารางการประชุม",
  Form: "ODPC8 - แจ้งขอใช้ห้องประชุม"
};

// ตัวเลือกที่ใช้สร้างฟอร์ม — แก้ไขที่นี่จุดเดียว ไม่ต้องแตะไฟล์ HTML
const GROUPS = [
  "กลุ่มบริหารทั่วไป",
  "กลุ่มยุทธศาสตร์และแผนงาน",
  "กลุ่มพัฒนาองค์กรและสื่อสารความเสี่ยงโรคและภัยสุขภาพ",
  "กลุ่มห้องปฏิบัติการทางการแพทย์ด้านควบคุมโรค",
  "กลุ่มระบาดวิทยาและตอบโต้ภาวะฉุกเฉินทางสาธารณสุขและพัฒนานวัตกรรมและวิจัย",
  "กลุ่มโรคติดต่อและโรคติดต่อเรื้อรัง",
  "กลุ่มโรคไม่ติดต่อและโรคจากการประกอบอาชีพและสิ่งแวดล้อม",
  "กลุ่มโรคติดต่อนำโดยแมลง",
  "กลุ่มด่านควบคุมโรคติดต่อระหว่างประเทศ",
  "ศูนย์บริการเวชศาสตร์ป้องกัน"
];

const IT_SUPPORT_OPTIONS = [
  "ขอ ID Zoom & WebEx & IT Support",
  "ขอ IT Support (ประชุมแบบ Offline)",
  "Join Host Meeting (เข้าร่วมประชุมกับหน่วยงานอื่น ขอ IT Support)"
];

const ROOMS = [
  "ห้องประชุมศูนย์ EOC ชั้น 2  อาคารอำนวยการ ฯ",
  "ห้องประชุมเจ้าหน้าที่ ชั้น 3  อาคารอำนวยการ ฯ",
  "ห้องประชุมสำโขงนาคา ชั้น 4  อาคารอำนวยการ ฯ",
  "ห้องประชุมภูผานาคี ชั้น 4  อาคารอำนวยการ ฯ",
  "ห้องประชุมมงกุฎอีสาน ชั้น 4  อาคารอำนวยการ ฯ"
];

const CHANNELS = ["Phone", "Line", "Telegram"];

const BOOKING_STATUSES = ["รอดำเนินการ", "อนุมัติ", "ไม่อนุมัติ"];
const ACTIVITY_STATUSES = ["รอประชุม", "ประชุมเสร็จสิ้น", "ยกเลิก"];

const ROOM_BOOKING_LINK = "https://calendar.google.com/"; // TODO: ใส่ลิงก์ตรวจสอบการจองห้องประชุมจริง

// แจ้งเตือน Telegram ทันทีที่มีคนส่งคำขอใหม่ (แจ้งเตือนครั้งที่ 1 จาก 3 ครั้ง)
// อีก 2 ครั้ง (เตือนวันนี้ 06:00-07:00 และเตือนล่วงหน้า 1 วัน 16:00-17:00) อยู่ในโปรเจกต์ ODPC8 Meeting Notify แยกต่างหาก
// ตั้งค่าที่ Project Settings (ไอคอนเฟือง) > Script Properties > Add script property
//   Key: TELEGRAM_TOKEN   Value: <token บอทเดียวกับที่ใช้ในโปรเจกต์ Notify>
//   Key: TELEGRAM_CHAT_ID Value: <chat id เดียวกับที่ใช้ในโปรเจกต์ Notify>
// (ต้องตั้งแยกที่นี่อีกชุด เพราะเป็นคนละโปรเจกต์ Apps Script กัน Script Properties ไม่ได้ใช้ร่วมกันอัตโนมัติ)
const TELEGRAM_TOKEN = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
const TELEGRAM_CHAT_ID = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");

// ชื่อคอลัมน์อีเมลผู้ขอใช้งาน — ต้องไปเพิ่มคอลัมน์นี้ในชีต Host_Request_Conference ด้วยตนเอง
// (เพิ่ม header ชื่อนี้เป๊ะๆ ในแถวที่ 1 ของชีต ตำแหน่งคอลัมน์ไหนก็ได้ โค้ดจะหาเจอเองจากชื่อ)
const EMAIL_HEADER = "อีเมลผู้ขอใช้งาน";

// ชื่อคอลัมน์เก็บสถานะว่า "เคยส่งอีเมลแจ้งผล HOST ID/สถานะ ให้ผู้ขอแล้วหรือยัง" — เก็บเป็นวันเวลาที่ส่งล่าสุด (ว่าง = ยังไม่เคยส่ง)
// ต้องไปเพิ่มคอลัมน์นี้ในชีต Host_Request_Conference ด้วยตนเองเช่นเดียวกับ EMAIL_HEADER
const EMAIL_SENT_HEADER = "อีเมลแจ้งผลส่งแล้วเมื่อ";

// ชื่อระบบ/ห้อง host ที่แอดมินกรอกคู่กับ HOST ID เช่น "V-Con 1", "V-Con 2", "V-Con 3", "Webex ODPC8"
// (แยกจาก "สถานที่จัดประชุม" ซึ่งเป็นห้องประชุมจริงที่ผู้ขอใช้งานเลือกตอนส่งคำขอ)
// ต้องไปเพิ่มคอลัมน์นี้ในชีต Host_Request_Conference ด้วยตนเองเช่นเดียวกับ EMAIL_HEADER
const MEETING_ROOM_HEADER = "Meeting Room";

// ตัวเลือกแนะนำสำหรับช่อง Meeting Room ในหน้าแอดมิน (พิมพ์เองนอกเหนือจากนี้ได้ด้วย ไม่ได้บังคับ)
const MEETING_ROOM_SUGGESTIONS = ["V-Con 1", "V-Con 2", "V-Con 3", "Webex ODPC8", "Join Meeting"];

// ======= ROUTING =======
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || "form";
  const templateName = page === "admin" ? "Admin" : page === "schedule" ? "Schedule" : "Form";
  const template = HtmlService.createTemplateFromFile(templateName);
  // ต้องใช้ URL เต็มของ Web App เสมอเวลาลิงก์ข้ามหน้า (form <-> admin)
  // ลิงก์แบบ relative เช่น href="?page=admin" จะพังเป็นหน้าว่าง เพราะ Web App
  // ที่รันจริงถูก serve จากโดเมน script.googleusercontent.com (sandbox) ไม่ใช่โดเมนที่เห็นตอนกด exec
  template.baseUrl = ScriptApp.getService().getUrl();
  if (templateName === "Form") {
    template.roomBookingLink = ROOM_BOOKING_LINK;
  }
  return template.evaluate()
    .setTitle(TITLES[templateName])
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setFaviconUrl("https://www.gstatic.com/images/branding/product/1x/sheets_48dp.png");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ======= API สำหรับหน้าเว็บที่โฮสต์ภายนอก (เช่น GitHub Pages) =======
// หน้าเว็บบน GitHub เรียกด้วย fetch POST (Content-Type: text/plain) มาที่ URL /exec
// เปิดให้เรียกได้เฉพาะฟังก์ชันในลิสต์นี้เท่านั้น
// !! ห้ามเพิ่มฟังก์ชันตั้งค่า/ระบบ เช่น setAdminUser, sendMeetingReminder เข้ามาในลิสต์นี้ !!
function getApiFunctions_() {
  return {
    getFormMeta: getFormMeta,
    submitRequest: submitRequest,
    getAdminMeta: getAdminMeta,
    getRequests: getRequests,
    saveBookingInfo: saveBookingInfo,
    adminLogin: adminLogin,
    adminLogout: adminLogout,
    getPublicSchedule: getPublicSchedule
  };
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const map = getApiFunctions_();
    if (!Object.prototype.hasOwnProperty.call(map, req.fn)) {
      throw new Error("ไม่พบฟังก์ชัน: " + req.fn);
    }
    const result = map[req.fn].apply(null, Array.isArray(req.args) ? req.args : []);
    return jsonOut_({ ok: true, result: result });
  } catch (err) {
    Logger.log("doPost error: " + err);
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ======= SHARED HELPERS =======
function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`ไม่พบชีตชื่อ "${SHEET_NAME}"`);
  return sheet;
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if (h === null || h === undefined || h === "") return;
    map[String(h).trim()] = i; // 0-based column index, key = header ตัด whitespace หัวท้าย
  });
  return { headers, map };
}

function toBuddhistDateString_(dateValue) {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return "";
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatDateSafe_(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

// ใช้แสดงเวลาที่ส่งอีเมลแจ้งผลไปแล้ว (มีชั่วโมง:นาทีด้วย ต่างจาก formatDateSafe_ ที่โชว์แค่วันที่)
function formatEmailSentDisplay_(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  }
  return String(value);
}

// ======= TELEGRAM: แจ้งเตือนทันทีเมื่อมีคำขอใหม่ =======
function sendTelegramMessage_(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    Logger.log("ข้ามการแจ้งเตือน Telegram: ยังไม่ได้ตั้งค่า TELEGRAM_TOKEN/TELEGRAM_CHAT_ID ใน Script Properties");
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    Logger.log(`Telegram API error (${code}): ${response.getContentText()}`);
  }
}

function formatNewRequestTelegramMessage_(d) {
  return "🆕 <b>มีคำขอใช้ห้องประชุมใหม่</b>\n\n" +
    `👤 ผู้ขอใช้งาน: ${d.requester}\n` +
    `🏢 กลุ่มงาน: ${d.group}\n` +
    `📌 ชื่อการประชุม: ${d.title}\n` +
    `🏢 ห้องประชุม: ${d.room}\n` +
    `📅 วันที่ประชุม: ${d.meetingDateDisplay} - ${d.endDateDisplay}\n` +
    `⏰ เวลา: ${d.meetingTime}\n` +
    `👥 จำนวนผู้เข้าร่วม: ${d.attendees}\n` +
    `📧 อีเมล: ${d.email}\n` +
    `📞 ช่องทางติดต่อ: ${d.channelText}`;
}

// ======= ฟังก์ชันทดสอบ: รันมือจาก Apps Script editor เพื่อเช็คว่า Telegram เชื่อมต่อได้ไหม =======
// วิธีใช้: เปิด Apps Script > เลือกฟังก์ชัน "testTelegramConnection" จาก dropdown ด้านบน > กด Run
// แล้วดู Execution log (ไอคอนนาฬิกาทางซ้าย หรือ View > Logs) และเช็คว่ามีข้อความเข้า Telegram จริงไหม
function testTelegramConnection() {
  Logger.log(`TELEGRAM_TOKEN ตั้งค่าแล้วหรือยัง: ${!!TELEGRAM_TOKEN}`);
  Logger.log(`TELEGRAM_CHAT_ID ตั้งค่าแล้วหรือยัง: ${!!TELEGRAM_CHAT_ID}`);
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    Logger.log("❌ หยุดที่นี่: ยังไม่ได้ตั้งค่า Script Properties ของโปรเจกต์นี้ ไปที่ Project Settings (ไอคอนเฟือง) > Script Properties แล้วเพิ่ม TELEGRAM_TOKEN กับ TELEGRAM_CHAT_ID ก่อน");
    return;
  }
  sendTelegramMessage_("✅ ทดสอบการเชื่อมต่อ Telegram จากโปรเจกต์ Web App ODPC8 สำเร็จ ถ้าเห็นข้อความนี้ใน Telegram แปลว่า config ถูกต้องแล้ว");
  Logger.log("ส่งคำขอไป Telegram แล้ว ไปดูใน Telegram ว่าข้อความเข้าไหม ถ้าไม่เข้า ให้ดู error ใน log บรรทัดถัดจากนี้ (ถ้ามี)");
}

// ======= PUBLIC: FORM PAGE =======
function getFormMeta() {
  return {
    groups: GROUPS,
    itSupportOptions: IT_SUPPORT_OPTIONS,
    rooms: ROOMS,
    channels: CHANNELS,
    roomBookingLink: ROOM_BOOKING_LINK
  };
}

function submitRequest(payload) {
  try {
    const required = ["requester", "email", "group", "title", "itSupport", "room", "meetingDate", "endDate", "meetingTime", "attendees"];
    for (const key of required) {
      const v = payload[key];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
        return { success: false, message: "กรุณากรอกข้อมูลให้ครบทุกช่องที่มีเครื่องหมาย *" };
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return { success: false, message: "รูปแบบอีเมลไม่ถูกต้อง" };
    }

    const sheet = getSheet_();
    const { headers } = getHeaderMap_(sheet);

    let channelText = payload.channels.join(", ");
    if (payload.channelOther) channelText += (channelText ? ", " : "") + payload.channelOther;

    let roomText = payload.room;
    if (payload.room === "อื่นๆ" && payload.roomOther) roomText = payload.roomOther;

    const meetingDate = new Date(payload.meetingDate);
    const endDate = new Date(payload.endDate);
    if (isNaN(meetingDate.getTime()) || isNaN(endDate.getTime())) {
      return { success: false, message: "รูปแบบวันที่ไม่ถูกต้อง" };
    }

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const meetingDateMidnight = new Date(meetingDate);
    meetingDateMidnight.setHours(0, 0, 0, 0);
    const endDateMidnight = new Date(endDate);
    endDateMidnight.setHours(0, 0, 0, 0);

    if (meetingDateMidnight < todayMidnight) {
      return { success: false, message: "ไม่สามารถเลือกวันที่ประชุมย้อนหลังจากวันที่ขอได้" };
    }
    if (endDateMidnight < meetingDateMidnight) {
      return { success: false, message: "วันสิ้นสุดประชุมต้องไม่ก่อนวันที่ประชุม" };
    }

    // ค่าที่จะเขียนลงชีต อ้างอิงตาม "ชื่อ header" เพื่อความทนทาน แม้ลำดับคอลัมน์ในชีตจะถูกสลับ
    const rowByName = {
      "ผู้ขอใช้งาน": payload.requester,
      "ชื่อเล่น": payload.nickname || "",
      "ช่องทางตอบกลับ": channelText,
      "กลุ่มงาน": payload.group,
      "ชื่อการประชุม": payload.title,
      "รูปแบบการประชุม (IT Support)": payload.itSupport,
      "สถานที่จัดประชุม": roomText,
      "วันที่ประชุม": meetingDate,
      "วันสิ้นสุดประชุม": endDate,
      "เวลาการประชุม": payload.meetingTime,
      "จำนวนผู้เข้าร่วมประชุม": payload.attendees,
      "วันที่ประชุม (พ.ศ)": toBuddhistDateString_(meetingDate),
      "วันสิ้นสุดประชุม (พ.ศ)": toBuddhistDateString_(endDate),
      "สถานะการจอง": "รอดำเนินการ",
      "สถานะกิจกรรม": "รอประชุม"
    };

    const newRow = new Array(headers.length).fill("");
    newRow[0] = new Date(); // คอลัมน์แรก = เวลาที่ส่งคำขอ (Timestamp)
    rowByName[EMAIL_HEADER] = payload.email.trim();

    headers.forEach((h, i) => {
      const key = String(h).trim();
      if (Object.prototype.hasOwnProperty.call(rowByName, key)) {
        newRow[i] = rowByName[key];
      }
    });

    sheet.appendRow(newRow);

    try {
      sendTelegramMessage_(formatNewRequestTelegramMessage_({
        requester: payload.requester,
        group: payload.group,
        title: payload.title,
        room: roomText,
        meetingDateDisplay: formatDateSafe_(meetingDate),
        endDateDisplay: formatDateSafe_(endDate),
        meetingTime: payload.meetingTime,
        attendees: payload.attendees,
        email: payload.email,
        channelText: channelText
      }));
    } catch (notifyErr) {
      Logger.log(`sendTelegramMessage_ error: ${notifyErr}`); // แจ้งเตือนพลาดไม่ควรทำให้การส่งคำขอล้มเหลว
    }

    return { success: true, message: "ส่งคำขอใช้ห้องประชุมเรียบร้อยแล้ว ทีมงานจะดำเนินการตรวจสอบและแจ้งกลับ" };
  } catch (err) {
    Logger.log(`submitRequest error: ${err}`);
    return { success: false, message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง หรือแจ้งทีม IT" };
  }
}

// ======= PUBLIC: ADMIN PAGE =======
function getAdminMeta() {
  return {
    bookingStatuses: BOOKING_STATUSES,
    activityStatuses: ACTIVITY_STATUSES,
    meetingRoomSuggestions: MEETING_ROOM_SUGGESTIONS
  };
}

function getRequests(token, filter) {
  if (!getSessionUser_(token)) return { success: false, expired: true };
  filter = filter || {};
  const sheet = getSheet_();
  const { map } = getHeaderMap_(sheet);
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1);

  const results = [];
  rows.forEach((row, i) => {
    const get = (name) => {
      const idx = map[name];
      return idx === undefined ? "" : row[idx];
    };

    const bookingStatus = get("สถานะการจอง") || "รอดำเนินการ";
    if (filter.status && filter.status !== "all" && bookingStatus !== filter.status) return;

    const searchable = [get("ผู้ขอใช้งาน"), get("ชื่อการประชุม"), get("กลุ่มงาน")].join(" ").toLowerCase();
    if (filter.search && searchable.indexOf(String(filter.search).toLowerCase()) === -1) return;

    const ts = row[0]; // คอลัมน์ A เสมอ = timestamp ไม่ว่า header จะชื่ออะไร
    results.push({
      rowNumber: i + 2, // แถวจริงบนชีต (แถวที่ 1 คือ header)
      timestamp: ts instanceof Date ? ts.toISOString() : String(ts || ""),
      timestampDisplay: ts ? formatDateSafe_(ts) : "-",
      requester: get("ผู้ขอใช้งาน"),
      nickname: get("ชื่อเล่น"),
      email: get(EMAIL_HEADER),
      channel: get("ช่องทางตอบกลับ"),
      group: get("กลุ่มงาน"),
      title: get("ชื่อการประชุม"),
      itSupport: get("รูปแบบการประชุม (IT Support)"),
      room: get("สถานที่จัดประชุม"),
      meetingDate: formatDateSafe_(get("วันที่ประชุม")),
      endDate: formatDateSafe_(get("วันสิ้นสุดประชุม")),
      meetingTime: get("เวลาการประชุม"),
      attendees: get("จำนวนผู้เข้าร่วมประชุม"),
      hostId: get("HOST ID"),
      password: get("Password HOST ID"),
      webexLink: get("WebEx Link"),
      meetingRoom: get(MEETING_ROOM_HEADER),
      bookingStatus: bookingStatus,
      activityStatus: get("สถานะกิจกรรม") || "รอประชุม",
      note: get("หมายเหตุ"),
      emailSentAt: formatEmailSentDisplay_(get(EMAIL_SENT_HEADER)),
      emailSent: !!get(EMAIL_SENT_HEADER)
    });
  });

  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // ล่าสุดขึ้นก่อน
  return { success: true, rows: results };
}

function saveBookingInfo(token, rowNumber, timestampIso, fields) {
  if (!getSessionUser_(token)) {
    return { success: false, expired: true, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
  }
  try {
    const sheet = getSheet_();
    const { map } = getHeaderMap_(sheet);

    // ป้องกันการบันทึกทับผิดแถว หากมีคนแก้ไขชีตพร้อมกัน
    const currentTs = sheet.getRange(rowNumber, 1).getValue();
    const currentIso = currentTs instanceof Date ? currentTs.toISOString() : String(currentTs || "");
    if (currentIso !== timestampIso) {
      return { success: false, message: "ข้อมูลแถวนี้ถูกแก้ไขไปแล้ว กรุณากดรีเฟรชรายการแล้วลองใหม่" };
    }

    const updates = {
      "HOST ID": fields.hostId || "",
      "Password HOST ID": fields.password || "",
      "WebEx Link": fields.webexLink || "",
      [MEETING_ROOM_HEADER]: fields.meetingRoom || "",
      "สถานะการจอง": fields.bookingStatus || "รอดำเนินการ",
      "สถานะกิจกรรม": fields.activityStatus || "รอประชุม",
      "หมายเหตุ": fields.note || ""
    };

    Object.keys(updates).forEach((name) => {
      const idx = map[name];
      if (idx === undefined) return; // ชื่อ header นี้หาไม่เจอในชีต ข้ามไปเงียบๆ
      sheet.getRange(rowNumber, idx + 1).setValue(updates[name]);
    });

    let emailNote = "";
    if (fields.sendEmail) {
      const rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
      const get = (name) => {
        const idx = map[name];
        return idx === undefined ? "" : rowValues[idx];
      };
      const email = String(get(EMAIL_HEADER) || "").trim();
      if (!email) {
        emailNote = " (ไม่มีอีเมลผู้ขอในแถวนี้ จึงไม่ได้ส่งอีเมล)";
      } else {
        try {
          sendBookingEmail_(email, {
            requester: get("ผู้ขอใช้งาน"),
            title: get("ชื่อการประชุม"),
            meetingDate: formatDateSafe_(get("วันที่ประชุม")),
            endDate: formatDateSafe_(get("วันสิ้นสุดประชุม")),
            meetingTime: get("เวลาการประชุม"),
            room: get("สถานที่จัดประชุม"),
            hostId: updates["HOST ID"],
            password: updates["Password HOST ID"],
            webexLink: updates["WebEx Link"],
            meetingRoom: updates[MEETING_ROOM_HEADER],
            bookingStatus: updates["สถานะการจอง"],
            activityStatus: updates["สถานะกิจกรรม"],
            note: updates["หมายเหตุ"]
          });

          const sentIdx = map[EMAIL_SENT_HEADER];
          if (sentIdx !== undefined) {
            sheet.getRange(rowNumber, sentIdx + 1).setValue(new Date());
          } else {
            Logger.log(`ไม่พบคอลัมน์ "${EMAIL_SENT_HEADER}" ในชีต จึงไม่ได้บันทึกสถานะว่าส่งอีเมลแล้ว (แต่อีเมลถูกส่งไปเรียบร้อย)`);
          }

          emailNote = ` และส่งอีเมลแจ้งไปที่ ${email} เรียบร้อยแล้ว`;
        } catch (mailErr) {
          Logger.log(`sendBookingEmail_ error: ${mailErr}`);
          emailNote = ` แต่ส่งอีเมลไม่สำเร็จ: ${mailErr.message}`;
        }
      }
    }

    return { success: true, message: "บันทึกข้อมูลเรียบร้อยแล้ว" + emailNote };
  } catch (err) {
    Logger.log(`saveBookingInfo error: ${err}`);
    return { success: false, message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }
}

// ส่งอีเมลแจ้งผู้ขอใช้งานเมื่อแอดมินกรอก HOST ID/Password/Link เสร็จแล้ว
function sendBookingEmail_(toEmail, info) {
  const subject = `[ODPC8] ผลการขอใช้ห้องประชุม: ${info.title}`;

  const statusLine = info.bookingStatus === "ไม่อนุมัติ"
    ? `<p style="color:#c0433a;font-weight:600;">คำขอของท่านไม่ได้รับการอนุมัติ</p>`
    : `<p style="color:#2f7d5a;font-weight:600;">คำขอของท่านได้รับการอนุมัติเรียบร้อยแล้ว</p>`;

  const rows = [
    ["ชื่อการประชุม", info.title],
    ["วันที่ประชุม", `${info.meetingDate} - ${info.endDate}`],
    ["เวลา", info.meetingTime],
    ["ห้องประชุม", info.room],
    ["Meeting Room", info.meetingRoom || "-"],
    ["HOST ID", info.hostId || "-"],
    ["Password", info.password || "-"],
    ["WebEx / Zoom Link", info.webexLink || "-"],
    ["สถานะการจอง", info.bookingStatus],
    ["สถานะกิจกรรม", info.activityStatus],
    ["หมายเหตุ", info.note || "-"]
  ];

  const tableRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px;color:#5b6b68;border-bottom:1px solid #dde6e4;white-space:nowrap;">${label}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #dde6e4;">${value}</td>
    </tr>
  `).join("");

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#0b5d52;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;">
        <strong>ODPC8 - ผลการขอใช้ห้องประชุม</strong>
      </div>
      <div style="border:1px solid #dde6e4;border-top:none;padding:20px;border-radius:0 0 10px 10px;">
        <p>เรียนคุณ ${info.requester},</p>
        ${statusLine}
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">${tableRows}</table>
        <p style="color:#5b6b68;font-size:12.5px;margin-top:16px;">อีเมลนี้ส่งโดยระบบอัตโนมัติ หากมีข้อสงสัยกรุณาติดต่อทีม IT ของ ODPC8</p>
      </div>
    </div>
  `;

  const plainBody = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody
  });
}

// ======= REMINDER TRIGGERS: แจ้งเตือนวันนี้ (06:00-07:00) และล่วงหน้า 1 วัน (16:00-17:00) =======
// ย้ายมารวมจากโปรเจกต์ "ODPC8 Meeting Notify" เดิม ให้อยู่โปรเจกต์เดียวกับ Web App ทั้งหมด
//
// !! สิ่งที่ต้องทำหลังวางไฟล์นี้ !!
// 1) ไปที่ไอคอนนาฬิกา (Triggers) ทางซ้ายของ Apps Script โปรเจกต์นี้ (Web App) แล้วเพิ่ม Time-driven trigger 2 ตัว:
//      - ฟังก์ชัน sendMeetingReminderToday   → Day timer → ช่วงเวลา 6am to 7am
//      - ฟังก์ชัน sendMeetingReminder        → Day timer → ช่วงเวลา 4pm to 5pm
// 2) ไปที่โปรเจกต์ "ODPC8 Meeting Notify" เดิม แล้ว "ลบ" trigger 2 ตัวเดิมออกให้หมด
//    (ถ้าไม่ลบ จะมีการแจ้งเตือนซ้ำซ้อน 2 รอบ เพราะสองโปรเจกต์จะยิงพร้อมกัน)
// 3) จะเก็บโปรเจกต์ "ODPC8 Meeting Notify" ไว้เป็นสำรอง หรือลบทิ้งเลยก็ได้ หลังจากลบ trigger แล้ว

function sendMeetingReminder() {
  sendMeetingReminderCore_("dayBefore");
}

function sendMeetingReminderToday() {
  sendMeetingReminderCore_("today");
}

function sendMeetingReminderCore_(reminderMode) {
  try {
    const sheet = getSheet_();
    const data = sheet.getDataRange().getValues();
    const header = data[0];
    const rows = data.slice(1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let targetDate = new Date(today);
    if (reminderMode === "dayBefore") {
      targetDate.setDate(today.getDate() + 1); // พรุ่งนี้
    }

    let meetings = [];

    rows.forEach((row, i) => {
      try {
        const rowObj = mapRowToObject_(header, row);
        if (!rowObj["วันที่ประชุม"]) return;

        const meetingDate = normalizeDate_(rowObj["วันที่ประชุม"]);
        if (isNaN(meetingDate.getTime())) {
          Logger.log(`WARN: แถวที่ ${i + 2} วันที่ประชุมไม่ถูกต้อง: ${rowObj["วันที่ประชุม"]}`);
          return;
        }
        meetingDate.setHours(0, 0, 0, 0);

        if (meetingDate.getTime() === targetDate.getTime()) {
          meetings.push(rowObj);
        }
      } catch (rowErr) {
        // แถวเดียวมีปัญหา ไม่ให้ล้มทั้งชุด แค่ log แล้วข้ามไป
        Logger.log(`WARN: ข้ามแถวที่ ${i + 2} เนื่องจาก error: ${rowErr}`);
      }
    });

    // เรียงลำดับประชุมตามเวลา
    meetings.sort((a, b) => parseTime_(a["เวลาการประชุม"]) - parseTime_(b["เวลาการประชุม"]));

    if (meetings.length > 0) {
      sendTelegramMessage_(formatCombinedMessage_(meetings, reminderMode));
    } else {
      Logger.log(`ไม่มีการประชุมสำหรับโหมด "${reminderMode}" (targetDate: ${targetDate})`);
    }
  } catch (err) {
    Logger.log(`ERROR ใน sendMeetingReminderCore_: ${err}`);
    try {
      sendTelegramMessage_(`⚠️ สคริปต์แจ้งเตือนประชุม (${reminderMode}) เกิดข้อผิดพลาด:\n${err}`);
    } catch (notifyErr) {
      Logger.log(`ส่ง error alert ไม่สำเร็จ: ${notifyErr}`);
    }
  }
}

function mapRowToObject_(header, row) {
  let obj = {};
  header.forEach((key, i) => obj[key] = row[i]);
  return obj;
}

function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") return new Date(value);
  return new Date(value); // ถ้าเป็น string
}

// รองรับ "13:30", "13.30 น." และ number ที่ Sheets แปลงมาจากข้อความ เช่น 9.0 (=09:00) หรือ 13.3 (=13:30)
function parseTime_(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return Number.MAX_SAFE_INTEGER; // ไม่มีเวลา → ไปอยู่ท้ายสุด
  }
  if (typeof rawValue === "number") {
    const hour = Math.floor(rawValue);
    const decimalStr = rawValue.toFixed(2).split(".")[1] || "00";
    const minute = parseInt((decimalStr + "0").slice(0, 2), 10);
    return hour * 60 + minute;
  }
  const timeStr = String(rawValue).trim();
  if (!timeStr) return Number.MAX_SAFE_INTEGER;
  const match = timeStr.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function formatCombinedMessage_(meetings, reminderMode) {
  const title = reminderMode === "today"
    ? "📢 แจ้งเตือนการประชุม (วันนี้)"
    : "📢 แจ้งเตือนการประชุม (ล่วงหน้า 1 วัน)";

  let message = `${title}\n📅 วันนี้มีทั้งหมด ${meetings.length} ประชุม\n\n`;

  meetings.forEach((row, index) => {
    message += `🗓️ [ประชุมที่ ${index + 1}]\n` +
      `👤 ผู้ขอใช้งาน: ${row["ผู้ขอใช้งาน"] || "-"}\n` +
      `🏢 กลุ่มงาน: ${row["กลุ่มงาน"] || "-"}\n` +
      `📌 ชื่อการประชุม: ${row["ชื่อการประชุม"] || "-"}\n` +
      `🏢 ห้องประชุม: ${row["สถานที่จัดประชุม"] || "-"}\n` +
      `📅 วันที่ประชุม: ${formatDateSafe_(row["วันที่ประชุม"])}\n` +
      `📅 วันสิ้นสุดประชุม: ${formatDateSafe_(row["วันสิ้นสุดประชุม"])}\n` +
      `⏰ เวลาการประชุม: ${row["เวลาการประชุม"] || "-"}\n` +
      `☢️ <b>สถานะ</b>: ${row["สถานะกิจกรรม"] || "-"}\n` +
      `🏷️ Meeting Room: ${row[MEETING_ROOM_HEADER] || "-"}\n` +
      `🆔 HOST ID: ${row["HOST ID"] || "-"}\n` +
      `🔑 Password: ${row["Password HOST ID"] || "-"}\n` +
      `🔗 WebEx Link: ${row["WebEx Link"] || "-"}\n\n`;
  });

  return message;
}
