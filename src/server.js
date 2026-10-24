import { createApp } from "./app.js";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`[NodataNime] Server aktif dan siap di http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`[NodataNime] Menerima sinyal ${signal}, menutup koneksi dengan aman...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
