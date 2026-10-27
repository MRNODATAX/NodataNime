import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

/**
 * NodataNime — Anti-Quishing & Anti-QR-Swapping Cryptographic Pinning Module
 *
 * Seluruh identitas merchant QRIS dikunci secara kriptografis (SHA-256 + EMVCo TLV + CRC-16)
 * pada sisi server sehingga parameter pengguna TIDAK PERNAH dapat menyuntikkan URL phishing
 * (quishing) maupun mengganti rekening penerima (QR swapping).
 */
export const PINNED_QRIS_CONFIG = Object.freeze({
  staticPayload:
    "00020101021126570011ID.DANA.WWW011893600915300492713802090049271380303UMI51440014ID.CO.QRIS.WWW0215ID10254515093150303UMI5204737253033605802ID5910NODATASHOP60040395610513960630415B1",
  staticPayloadSha256:
    "f6d4fff24c1bb7213791c970034700687428360d4e7e421f248ea9105e6631d2",
  posterAssetPath: "/assets/qris-nodatashop.jpg",
  posterFileSha256:
    "8d15a9a4e70d095a4c189b1b210549c1e706430c0811a6407caa2eaa6ef503d0",
  merchantName: "NODATASHOP",
  nmid: "ID1025451509315",
  terminalId: "A01",
  acquirerDomain: "ID.DANA.WWW",
  merchantPan: "936009153004927138",
  printedBy: "93600915",
  currency: "360",
  country: "ID",
  minAmount: 1_000,
  maxAmount: 10_000_000,
  presets: Object.freeze([
    Object.freeze({ amount: 0, label: "Nominal Bebas", subtitle: "Poster QRIS Resmi" }),
    Object.freeze({ amount: 5_000, label: "Rp5.000", subtitle: "Kopi Malam" }),
    Object.freeze({ amount: 10_000, label: "Rp10.000", subtitle: "Es Kopi Susu" }),
    Object.freeze({ amount: 25_000, label: "Rp25.000", subtitle: "Booster Server" }),
    Object.freeze({ amount: 50_000, label: "Rp50.000", subtitle: "Sultan Nakama" }),
  ]),
});

export function computeCrc16CcittFalse(input = "") {
  const str = String(input);
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= (str.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function sha256Hex(bufferOrString) {
  return crypto.createHash("sha256").update(bufferOrString).digest("hex");
}

function timingSafeHexEqual(hexA, hexB) {
  if (typeof hexA !== "string" || typeof hexB !== "string" || hexA.length !== hexB.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(hexA, "hex"), Buffer.from(hexB, "hex"));
  } catch {
    return false;
  }
}

export function parseEmvcoTlv(raw = "") {
  const str = String(raw || "");
  if (
    !str ||
    str.length < 20 ||
    str.length > 1024 ||
    /[\u0000-\u001F\u007F]/.test(str) ||
    /(?:https?|javascript|data|vbscript|file|mailto|tel):/i.test(str) ||
    str.includes("://")
  ) {
    const err = new Error("Payload QR ditolak: terdeteksi skema URL/karakter non-EMVCo (proteksi Anti-Quishing).");
    err.statusCode = 400;
    err.code = "QUISHING_OR_INVALID_FORMAT";
    throw err;
  }

  const tags = new Map();
  const ordered = [];
  let cursor = 0;

  while (cursor < str.length) {
    if (cursor + 4 > str.length) {
      const err = new Error("Struktur TLV EMVCo terpotong atau rusak.");
      err.statusCode = 400;
      err.code = "INVALID_TLV";
      throw err;
    }
    const tag = str.slice(cursor, cursor + 2);
    const lenStr = str.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) {
      const err = new Error("Tag atau panjang TLV EMVCo bukan angka valid.");
      err.statusCode = 400;
      err.code = "INVALID_TLV";
      throw err;
    }
    const len = Number.parseInt(lenStr, 10);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + len;
    if (len <= 0 || valueEnd > str.length) {
      const err = new Error("Panjang nilai TLV EMVCo melebihi batas payload.");
      err.statusCode = 400;
      err.code = "INVALID_TLV";
      throw err;
    }
    const value = str.slice(valueStart, valueEnd);
    tags.set(tag, value);
    ordered.push({ tag, value });
    cursor = valueEnd;
  }

  return { tags, ordered };
}

function parseSubTlv(subRaw = "") {
  const { tags } = parseEmvcoTlv(subRaw);
  return tags;
}

/**
 * Memverifikasi bahwa sebuah payload QRIS 100% milik merchant resmi NODATASHOP (ID1025451509315)
 * dan memiliki checksum CRC-16 EMVCo yang sah. Mencegah segala bentuk injeksi/penggantian QRIS.
 */
export function verifyPinnedQrisPayload(payload = "", expectedAmount = null) {
  const str = String(payload || "");
  if (
    !str ||
    /[\u0000-\u001F\u007F]/.test(str) ||
    /(?:https?|javascript|data|vbscript|file|mailto|tel):/i.test(str) ||
    str.includes("://")
  ) {
    const err = new Error("Payload QR ditolak: terdeteksi skema URL/karakter non-EMVCo (proteksi Anti-Quishing).");
    err.statusCode = 400;
    err.code = "QUISHING_OR_INVALID_FORMAT";
    throw err;
  }
  if (!str.startsWith("000201") || str.slice(-8, -4) !== "6304") {
    const err = new Error("Header atau posisi tag CRC-16 QRIS tidak sah.");
    err.statusCode = 400;
    err.code = "QRIS_INTEGRITY_VIOLATION";
    throw err;
  }

  const expectedCrc = str.slice(-4).toUpperCase();
  const computedCrc = computeCrc16CcittFalse(str.slice(0, -4));
  if (expectedCrc !== computedCrc) {
    const err = new Error("Checksum CRC-16 QRIS tidak cocok (indikasi manipulasi payload).");
    err.statusCode = 400;
    err.code = "QRIS_CRC_MISMATCH";
    throw err;
  }

  const { tags } = parseEmvcoTlv(str);
  const tag26 = tags.has("26") ? parseSubTlv(tags.get("26")) : new Map();
  const tag51 = tags.has("51") ? parseSubTlv(tags.get("51")) : new Map();

  const invariantsMatch =
    tags.get("00") === "01" &&
    (tags.get("01") === "11" || tags.get("01") === "12") &&
    tag26.get("00") === PINNED_QRIS_CONFIG.acquirerDomain &&
    tag26.get("01") === PINNED_QRIS_CONFIG.merchantPan &&
    tag51.get("00") === "ID.CO.QRIS.WWW" &&
    tag51.get("02") === PINNED_QRIS_CONFIG.nmid &&
    tags.get("53") === PINNED_QRIS_CONFIG.currency &&
    tags.get("58") === PINNED_QRIS_CONFIG.country &&
    tags.get("59") === PINNED_QRIS_CONFIG.merchantName;

  if (!invariantsMatch) {
    const err = new Error(
      "Identitas merchant atau NMID pada QRIS tidak sesuai dengan pin keamanan resmi NODATASHOP!"
    );
    err.statusCode = 403;
    err.code = "QRIS_MERCHANT_TAMPERED";
    throw err;
  }

  if (expectedAmount !== null && expectedAmount !== undefined) {
    if (expectedAmount === 0) {
      if (tags.get("01") !== "11" || tags.has("54")) {
        const err = new Error("QRIS statis tidak boleh memiliki injeksi nominal tersembunyi.");
        err.statusCode = 400;
        err.code = "QRIS_AMOUNT_MISMATCH";
        throw err;
      }
    } else {
      if (tags.get("01") !== "12" || tags.get("54") !== String(expectedAmount)) {
        const err = new Error("Nominal pada Tag 54 QRIS dinamis tidak sesuai permintaan.");
        err.statusCode = 400;
        err.code = "QRIS_AMOUNT_MISMATCH";
        throw err;
      }
    }
  }

  return {
    valid: true,
    merchantName: tags.get("59"),
    nmid: tag51.get("02"),
    pointOfInitiation: tags.get("01"),
    amount: tags.has("54") ? Number.parseInt(tags.get("54"), 10) : 0,
    crc16: computedCrc,
  };
}

export function buildPinnedDynamicQris(rawAmount = 0) {
  // 1. Verifikasi integritas konstanta statis terhadap SHA-256 pin terlebih dahulu
  const currentStaticHash = sha256Hex(PINNED_QRIS_CONFIG.staticPayload);
  if (!timingSafeHexEqual(currentStaticHash, PINNED_QRIS_CONFIG.staticPayloadSha256)) {
    const err = new Error("Konstanta QRIS dasar gagal verifikasi SHA-256!");
    err.statusCode = 500;
    err.code = "QRIS_STATIC_HASH_MISMATCH";
    throw err;
  }

  if (rawAmount === undefined || rawAmount === null || rawAmount === "" || rawAmount === 0 || rawAmount === "0") {
    verifyPinnedQrisPayload(PINNED_QRIS_CONFIG.staticPayload, 0);
    return {
      mode: "static",
      amount: 0,
      payload: PINNED_QRIS_CONFIG.staticPayload,
      payloadSha256: currentStaticHash,
      crc16: PINNED_QRIS_CONFIG.staticPayload.slice(-4),
    };
  }

  const strAmt = String(rawAmount).trim();
  if (!/^\d+$/.test(strAmt)) {
    const err = new Error("Nominal dukungan harus berupa angka bulat Rupiah yang valid.");
    err.statusCode = 400;
    throw err;
  }

  const amount = Number.parseInt(strAmt, 10);
  if (
    !Number.isSafeInteger(amount) ||
    amount < PINNED_QRIS_CONFIG.minAmount ||
    amount > PINNED_QRIS_CONFIG.maxAmount
  ) {
    const err = new Error(
      `Nominal dukungan QRIS harus berada di antara Rp1.000 hingga Rp10.000.000.`
    );
    err.statusCode = 400;
    throw err;
  }

  const { ordered } = parseEmvcoTlv(PINNED_QRIS_CONFIG.staticPayload);
  const rebuilt = [];
  let amountInserted = false;

  for (const item of ordered) {
    if (item.tag === "63") continue;
    if (item.tag === "54") continue;
    if (item.tag === "01") {
      rebuilt.push({ tag: "01", value: "12" });
      continue;
    }
    if (!amountInserted && (item.tag === "58" || Number.parseInt(item.tag, 10) > 54)) {
      rebuilt.push({ tag: "54", value: String(amount) });
      amountInserted = true;
    }
    rebuilt.push(item);
  }

  if (!amountInserted) {
    rebuilt.push({ tag: "54", value: String(amount) });
  }

  const bodyWithoutCrc = rebuilt
    .map(({ tag, value }) => `${tag}${String(value.length).padStart(2, "0")}${value}`)
    .join("");
  const signingInput = `${bodyWithoutCrc}6304`;
  const crc16 = computeCrc16CcittFalse(signingInput);
  const dynamicPayload = `${signingInput}${crc16}`;

  // Verifikasi ulang hasil akhir terhadap seluruh invariant identitas NODATASHOP
  verifyPinnedQrisPayload(dynamicPayload, amount);

  return {
    mode: "dynamic",
    amount,
    payload: dynamicPayload,
    payloadSha256: sha256Hex(dynamicPayload),
    crc16,
  };
}

let _lastVerifiedPosterStatKey = null;

export function verifyPosterFileIntegrity(publicDir) {
  const fullPath = path.join(publicDir, "assets", "qris-nodatashop.jpg");
  if (!fs.existsSync(fullPath)) {
    const err = new Error("Berkas poster QRIS resmi tidak ditemukan.");
    err.statusCode = 500;
    err.code = "QRIS_POSTER_MISSING";
    throw err;
  }
  const stat = fs.statSync(fullPath);
  const statKey = `${stat.size}:${stat.mtimeMs}`;
  if (_lastVerifiedPosterStatKey === statKey) {
    return true;
  }
  const digest = sha256Hex(fs.readFileSync(fullPath));
  if (!timingSafeHexEqual(digest, PINNED_QRIS_CONFIG.posterFileSha256)) {
    const err = new Error(
      "Peringatan Keamanan: Hash SHA-256 berkas poster QRIS berubah/dimodifikasi! Penyajian QR diblokir."
    );
    err.statusCode = 500;
    err.code = "QRIS_POSTER_TAMPERED";
    throw err;
  }
  _lastVerifiedPosterStatKey = statKey;
  return true;
}

function assertCleanQrSvg(svg = "") {
  if (
    !svg.startsWith("<svg") ||
    /<script|<foreignObject|<iframe|<image|on[a-z]+\s*=|javascript:/i.test(svg)
  ) {
    const err = new Error("Output SVG QR gagal melewati filter sanitasi keamanan.");
    err.statusCode = 500;
    err.code = "QRIS_SVG_UNSAFE";
    throw err;
  }
  return svg;
}

export async function generateVerifiedQrisPayloadAndSvg({ amount = 0, publicDir }) {
  if (publicDir) {
    verifyPosterFileIntegrity(publicDir);
  }
  const qrisData = buildPinnedDynamicQris(amount);
  const rawSvg = await QRCode.toString(qrisData.payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: {
      dark: "#0b0f19",
      light: "#ffffff",
    },
  });

  return {
    merchantName: PINNED_QRIS_CONFIG.merchantName,
    nmid: PINNED_QRIS_CONFIG.nmid,
    terminalId: PINNED_QRIS_CONFIG.terminalId,
    printedBy: PINNED_QRIS_CONFIG.printedBy,
    mode: qrisData.mode,
    amount: qrisData.amount,
    payload: qrisData.payload,
    payloadSha256: qrisData.payloadSha256,
    crc16: qrisData.crc16,
    posterUrl: PINNED_QRIS_CONFIG.posterAssetPath,
    posterSha256: PINNED_QRIS_CONFIG.posterFileSha256,
    presets: PINNED_QRIS_CONFIG.presets,
    svg: assertCleanQrSvg(rawSvg.trim()),
  };
}
