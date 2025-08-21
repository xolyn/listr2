export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/raw/")) {
      const key = decodeURIComponent(url.pathname.slice(5));
      const obj = await env.R2.get(key, { onlyIf: {} }); // If-None-Match/If-Modified-Since support
      if (!obj) return new Response("Not Found", { status: 404 });

      const headers = new Headers();
      const meta = obj.httpMetadata || {};
      if (meta.contentType) headers.set("Content-Type", meta.contentType);
      if (meta.contentLanguage) headers.set("Content-Language", meta.contentLanguage);
      if (meta.contentDisposition) headers.set("Content-Disposition", meta.contentDisposition);
      if (meta.cacheControl) headers.set("Cache-Control", meta.cacheControl);
      if (meta.contentEncoding) headers.set("Content-Encoding", meta.contentEncoding);
      headers.set("Content-Length", obj.size?.toString() || "");

      return new Response(obj.body, { headers });
    }

    const prefix = url.searchParams.get("prefix") ?? "";
    const title = env.SITE_TITLE || "R2 Browser";

    const { html, totalFiles, totalDirs } = await renderTree(env.R2, prefix);

    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style='font-family:monospace;'>
<h1>${escapeHtml(title)}</h1>
<p>${totalDirs} 📁 , ${totalFiles} 📄 </p>
${prefix ? `<p><a href="/?prefix=${encodeURIComponent(parentPrefix(prefix))}">..</a></p>` : ""}
${html}
<p style="margin-top:2rem;color:#666">Created by <a href="https://github.com/xolyn/listr2">Listr2</a></p>
</body>
</html>`;

    return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
};

/** recurse*/
async function renderTree(bucket, prefix) {
  let totalFiles = 0, totalDirs = 0;

  async function listLevel(curPrefix) {
    const dirs = [];
    const files = [];
    let cursor;

    do {
      const page = await bucket.list({
        prefix: curPrefix,
        delimiter: "/",   // pseudo-tree strcuture
        cursor,
        limit: 1000,
        include: ["httpMetadata"]
      });
      cursor = page.truncated ? page.cursor : undefined;

      // files
      for (const obj of page.objects || []) {
        const name = obj.key.slice(curPrefix.length);
        if (name && !name.includes("/")) files.push({ key: obj.key, name, meta: obj.httpMetadata });
      }
      // folders
      for (const p of page.delimitedPrefixes || []) {
        const name = p.slice(curPrefix.length).replace(/\/$/, "");
        if (name) dirs.push({ prefix: p, name });
      }
    } while (cursor);
    
    let levelHtml = "";

    // filesBlock / dirsBlock
    let filesBlock = "";
    if (files.length) {
      totalFiles += files.length;
      filesBlock = `<ul>\n` + files
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
        .map(f => {
          const href = `/raw/${encodeURIComponent(f.key)}`;
          return `<li>📄 <a href="${href}" target="_blank" rel="noopener">${escapeHtml(f.name)}</a></li>`;
        })
        .join("\n") + `\n</ul>\n`;
    }
    
    let dirsBlock = "";
    for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))) {
      totalDirs++;
      const sub = await listLevel(d.prefix);
      const openAttr = (curPrefix === "") ? "" : " open"; // only root folder is default open
      dirsBlock += `<details${openAttr}>
        <summary style='cursor:pointer'>📁 ${escapeHtml(d.name)}/</summary>
        ${sub}
      </details>\n`;
    }
    
    // files first, then folder
    levelHtml = (curPrefix === "") ? (filesBlock + dirsBlock) : (dirsBlock + filesBlock);

    // wrapper
    return `<div style="margin-left:1rem">${levelHtml || "<em>~EOF~</em>"}</div>`;
  }

  let html = await listLevel(prefix);
  // root: /
  if (!prefix) {
    html = `<details open>
    <summary style='cursor:pointer'>/</summary>
    ${html}
  </details>`;
  }
  return { html, totalFiles, totalDirs };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parentPrefix(pfx) {
  if (!pfx) return "";
  const trimmed = pfx.endsWith("/") ? pfx.slice(0, -1) : pfx;
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? "" : trimmed.slice(0, idx + 1); 
}
