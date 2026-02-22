const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "website");
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function safePath(urlPath) {
  const cleaned = urlPath.split("?")[0].split("#")[0];
  const target = cleaned === "/" ? "/index.html" : cleaned;
  const resolved = path.normalize(path.join(rootDir, target));
  if (!resolved.startsWith(rootDir)) {
    return null;
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url || "/");
  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Docs website running at http://localhost:${port}`);
  console.log("Press Ctrl+C to stop.");
});
