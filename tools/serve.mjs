#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.DARANOR_PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp"
};

if (!fs.existsSync(path.join(distRoot, "index.html"))) {
  throw new Error("dist/ is missing. Run npm run build first.");
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const requestPath = decodeURIComponent(url.pathname);
  let filePath = path.resolve(distRoot, `.${requestPath}`);
  if (requestPath.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!filePath.startsWith(`${distRoot}${path.sep}`) && filePath !== distRoot) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    if (!statError && stat.isDirectory()) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Daranor RPG is available at http://127.0.0.1:${port}/`);
});
