//---------------------------------------//
// Listr2                                //
// Link: https://github.com/xolyn/listr2 //
// Author: Uygnil@https://zhoulingyu.net //
// Version: v 1.0.3                      //
//---------------------------------------//

export default {
  async fetch(request, env, ctx) {
    // enable only if both env. var. are defined
    if (env.USERNAME && env.PASSWORD) {
      const authResult = checkAuthentication(request, env.USERNAME, env.PASSWORD);
      if (authResult) {
        return authResult;
      }
    }

    const url = new URL(request.url);

    if (url.pathname.startsWith("/raw/")) {
      const key = decodeURIComponent(url.pathname.slice(5));
      const obj = await env.R2.get(key, { onlyIf: {} });
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
    const rootUrl = env.ROOT;

    const { html, totalFiles, totalDirs } = await renderTree(env.R2, prefix, rootUrl);

    const page = `<!doctype html>
    <html lang="zh-CN">
    <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
    summary.notroot:before{content:""};
    summary.notroot:before{content:""};
    </style>
    </head>
    <body style='font-family:monospace;'>
    <h1>${escapeHtml(title)}</h1>
    <p>${totalDirs} folders , ${totalFiles} files.</p>
    ${prefix ? `<p><a href="/?prefix=${encodeURIComponent(parentPrefix(prefix))}">..</a></p>` : ""}
    ${html}
    <p style="margin-top:2rem;color:#666">Created by <a href="https://github.com/xolyn/listr2">Listr2</a></p>
    </body>
    </html>`;

    return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
};


function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


async function renderTree(bucket, prefix, rootUrl = null) {
  let totalFiles = 0, totalDirs = 0;

  async function listLevel(curPrefix) {

    const dirs = [];
    const files = [];
    let cursor;
    let currentLevelSize = 0;

    do {
      const page = await bucket.list({
        prefix: curPrefix,
        delimiter: "/", 
        cursor,
        limit: 1000,
        include: ["httpMetadata"]
      });
      cursor = page.truncated ? page.cursor : undefined;

      // drop prefix
      for (const obj of page.objects || []) {
        const name = obj.key.slice(curPrefix.length);
        if (name && !name.includes("/")) {
          files.push({ key: obj.key, name, meta: obj.httpMetadata, size: obj.size || 0 });
          currentLevelSize += obj.size || 0;
        }
      }
      // subfolder
      for (const p of page.delimitedPrefixes || []) {
        const name = p.slice(curPrefix.length).replace(/\/$/, "");
        if (name) dirs.push({ prefix: p, name });
      }
    } while (cursor);

    // gen. html
    let levelHtml = "";
    let totalSubDirSize = 0;

    // filesBlock / dirsBlock
    let filesBlock = "";
    if (files.length) {
      totalFiles += files.length;
      filesBlock = `<ul>\n` + files
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
        .map(f => {
          let href;
          if (rootUrl) {
            // custom root url prefix
            const cleanRootUrl = rootUrl.endsWith('/') ? rootUrl.slice(0, -1) : rootUrl;
            href = `${cleanRootUrl}/${f.key}`;
          } else {
            // fallback url prefix
            href = `/raw/${encodeURIComponent(f.key)}`;
          }
          const fileTooltip = formatSize(f.size);
          return `<li>📄 <a href="${href}" target="_blank" rel="noopener" title="${escapeHtml(fileTooltip)}">${escapeHtml(f.name)}</a></li>`;
        })
        .join("\n") + `\n</ul>\n`;
    }
    
    let dirsBlock = "";
    let totalSubDirFileCount = 0;
    
    for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))) {
      totalDirs++;
      const subResult = await listLevel(d.prefix);
      const openAttr = (curPrefix === "") ? "" : " open"; // set to default open for subfolders
      totalSubDirSize += subResult.size;
      totalSubDirFileCount += subResult.fileCount;
      const tooltip = `${formatSize(subResult.size)}`;
      dirsBlock += `<details${openAttr}>
        <summary style='cursor:pointer' class="notroot" title="${escapeHtml(tooltip)}">📂 ${escapeHtml(d.name)}/</summary>
        ${subResult.html}
      </details>\n`;
    }
    
    levelHtml = (curPrefix === "") ? (filesBlock + dirsBlock) : (dirsBlock + filesBlock);

    const totalSize = currentLevelSize + totalSubDirSize;
    const totalFileCount = files.length + totalSubDirFileCount;

    return { 
      html: `<div style="margin-left:1rem">${levelHtml || "<em>~EOF~</em>"}</div>`,
      size: totalSize,
      fileCount: totalFileCount
    };
  }

  const result = await listLevel(prefix);
  let html = result.html;
  
  // root folder
  if (!prefix) {
    const rootTooltip = `${formatSize(result.size)}`;
    html = `<details open>
    <summary style='cursor:pointer' title="${escapeHtml(rootTooltip)}">/</summary>
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

/** check auth. */
function checkAuthentication(request, username, password) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Restricted Area"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const [, b64] = auth.split(" ");
  const [user, pass] = atob(b64).split(":");

  if (user !== username || pass !== password) {
    return new Response("Invalid credentials.", {
      status: 403,
      headers: { "WWW-Authenticate": 'Basic realm="Restricted Area"' },
    });
  }

  // authenticated
  return null;
}
