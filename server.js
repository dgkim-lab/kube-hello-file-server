const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || "/data";
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || "");

const app = express();

function normalizeBasePath(value) {
  if (!value || value === "/") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function createUniqueFilePath(originalName) {
  const parsed = path.parse(originalName);
  const safeBase = parsed.name || "upload";
  const safeExt = parsed.ext || "";

  let candidate = path.join(DATA_DIR, `${safeBase}${safeExt}`);
  let counter = 1;

  while (true) {
    try {
      await fsp.access(candidate, fs.constants.F_OK);
      candidate = path.join(DATA_DIR, `${safeBase}-${counter}${safeExt}`);
      counter += 1;
    } catch (error) {
      if (error.code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, DATA_DIR);
  },
  async filename(req, file, cb) {
    try {
      const filename = path.basename(file.originalname || "upload");
      const fullPath = await createUniqueFilePath(filename);
      cb(null, path.basename(fullPath));
    } catch (error) {
      cb(error);
    }
  }
});

const upload = multer({ storage });

app.use(`${BASE_PATH}/files`, express.static(DATA_DIR));

app.get("/readyz", async (req, res, next) => {
  try {
    await ensureDataDir();
    await fsp.access(DATA_DIR, fs.constants.W_OK);
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

async function listFiles() {
  const dirents = await fsp.readdir(DATA_DIR, { withFileTypes: true });
  const files = await Promise.all(
    dirents
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const fullPath = path.join(DATA_DIR, entry.name);
        const stat = await fsp.stat(fullPath);
        return {
          name: entry.name,
          size: stat.size,
          updatedAt: stat.mtime
        };
      })
  );

  files.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return files;
}

function renderPage(files, uploadError) {
  const fileItems = files.length
    ? files
        .map((file) => {
          const name = escapeHtml(file.name);
          const href = `${BASE_PATH}/files/${encodeURIComponent(file.name)}`;
          const sizeKb = (file.size / 1024).toFixed(1);
          const updatedAt = escapeHtml(file.updatedAt.toISOString());
          return `<li><a href="${href}" target="_blank" rel="noreferrer">${name}</a> <span>${sizeKb} KB</span> <span>${updatedAt}</span></li>`;
        })
        .join("")
    : "<li>No files uploaded yet.</li>";

  const errorBlock = uploadError
    ? `<p class="error">${escapeHtml(uploadError)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>File Upload Server</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Helvetica, Arial, sans-serif;
      }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f4f7fb 0%, #eef2f6 100%);
        color: #1f2937;
      }
      main {
        max-width: 720px;
        margin: 48px auto;
        padding: 24px;
      }
      .panel {
        background: #ffffff;
        border: 1px solid #dbe3ec;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin-top: 0;
        font-size: 2rem;
      }
      p {
        line-height: 1.5;
      }
      form {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin: 24px 0 32px;
      }
      input[type="file"] {
        flex: 1 1 280px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 12px;
      }
      button {
        border: 0;
        border-radius: 10px;
        padding: 12px 18px;
        background: #0f766e;
        color: #ffffff;
        font-weight: 700;
        cursor: pointer;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px 16px;
        padding: 14px 0;
        border-top: 1px solid #e5e7eb;
      }
      li:first-child {
        border-top: 0;
      }
      a {
        color: #0f766e;
        text-decoration: none;
        word-break: break-all;
      }
      span {
        color: #64748b;
        font-size: 0.95rem;
      }
      .error {
        color: #b91c1c;
        font-weight: 600;
      }
      .hint {
        color: #64748b;
        font-size: 0.95rem;
      }
      @media (max-width: 640px) {
        main {
          margin: 24px auto;
          padding: 16px;
        }
        .panel {
          padding: 18px;
        }
        li {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>File Upload Server</h1>
        <p>Upload a file and access it immediately from the list below. Stored files are persisted in <code>${escapeHtml(DATA_DIR)}</code>.</p>
        ${errorBlock}
        <form action="${BASE_PATH}/upload" method="post" enctype="multipart/form-data">
          <input type="file" name="file" required>
          <button type="submit">Upload</button>
        </form>
        <p class="hint">Files</p>
        <ul>${fileItems}</ul>
      </section>
    </main>
  </body>
</html>`;
}

app.get(`${BASE_PATH}/`, async (req, res, next) => {
  try {
    const files = await listFiles();
    res.type("html").send(renderPage(files));
  } catch (error) {
    next(error);
  }
});

app.post(`${BASE_PATH}/upload`, (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      return next(error);
    }
    if (!req.file) {
      return res.status(400).type("html").send(renderPage([], "No file was uploaded."));
    }
    return res.redirect(`${BASE_PATH}/`);
  });
});

app.use(async (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  try {
    const files = await listFiles();
    res.status(500).type("html").send(renderPage(files, error.message || "Upload failed."));
  } catch (renderError) {
    next(renderError);
  }
});

ensureDataDir()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`File server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
