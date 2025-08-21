//---------------------------------------//
// Listr2                                //
// Link: https://github.com/xolyn/listr2 //
// Author: Uygnil@https://zhoulingyu.net //
// Version: v 1.0.2                      //
//---------------------------------------//

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) 原样读取对象：/raw/<key>
    if (url.pathname.startsWith("/raw/")) {
      const key = decodeURIComponent(url.pathname.slice(5));
      const obj = await env.R2.get(key, { onlyIf: {} }); // 支持 If-None-Match/If-Modified-Since
      if (!obj) return new Response("Not Found", { status: 404 });

      // 尽量复用对象的 HTTP 元数据
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

    // 2) 目录页：?prefix=<folder/> 可浏览子目录；默认从根列出
    const prefix = url.searchParams.get("prefix") ?? "";
    const title = env.SITE_TITLE || "R2 Browser";
    const rootUrl = env.ROOT; // 可选的根URL环境变量

    const { html, totalFiles, totalDirs } = await renderTree(env.R2, prefix, rootUrl);

    const page = `<!doctype html>
<html lang="zh-CN">
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

/** 格式化文件大小为可读格式 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** 递归列出 prefix 下的目录与文件，使用 delimiter="/" 构建树状 */
async function renderTree(bucket, prefix, rootUrl = null) {
  let totalFiles = 0, totalDirs = 0;

  async function listLevel(curPrefix) {
    // 分页列目录与同级文件
    const dirs = [];
    const files = [];
    let cursor;
    let currentLevelSize = 0;

    do {
      const page = await bucket.list({
        prefix: curPrefix,
        delimiter: "/",   // 开启"伪目录"
        cursor,
        limit: 1000,
        include: ["httpMetadata"]
      });
      cursor = page.truncated ? page.cursor : undefined;

      // 同级文件（去掉前缀）
      for (const obj of page.objects || []) {
        const name = obj.key.slice(curPrefix.length);
        if (name && !name.includes("/")) {
          files.push({ key: obj.key, name, meta: obj.httpMetadata, size: obj.size || 0 });
          currentLevelSize += obj.size || 0;
        }
      }
      // 子目录（带尾部 /）
      for (const p of page.delimitedPrefixes || []) {
        const name = p.slice(curPrefix.length).replace(/\/$/, "");
        if (name) dirs.push({ prefix: p, name });
      }
    } while (cursor);

    // 生成 HTML：先目录，再文件
    let levelHtml = "";
    let totalSubDirSize = 0;

    // 生成两个块：filesBlock / dirsBlock
    let filesBlock = "";
    if (files.length) {
      totalFiles += files.length;
      filesBlock = `<ul>\n` + files
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
        .map(f => {
          // 根据是否设置ROOT环境变量生成不同的链接
          let href;
          if (rootUrl) {
            // 使用自定义根URL，直接拼接文件key
            const cleanRootUrl = rootUrl.endsWith('/') ? rootUrl.slice(0, -1) : rootUrl;
            href = `${cleanRootUrl}/${f.key}`;
          } else {
            // 使用默认的/raw/路径
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
      const openAttr = (curPrefix === "") ? "" : " open"; // 根目录的子目录默认关闭，其余层级保持打开
      totalSubDirSize += subResult.size;
      totalSubDirFileCount += subResult.fileCount;
      const tooltip = `${formatSize(subResult.size)}`;
      // const tooltip = `${formatSize(subResult.size)} (${subResult.fileCount} 个文件)`;
      dirsBlock += `<details${openAttr}>
        <summary style='cursor:pointer' title="${escapeHtml(tooltip)}">📁 ${escapeHtml(d.name)}/</summary>
        ${subResult.html}
      </details>\n`;
    }
    
    // 根目录：文件在前、文件夹在后；其他层：保持原先"文件夹在前、文件在后"
    levelHtml = (curPrefix === "") ? (filesBlock + dirsBlock) : (dirsBlock + filesBlock);

    const totalSize = currentLevelSize + totalSubDirSize;
    const totalFileCount = files.length + totalSubDirFileCount;

    // 顶层套一个容器，方便缩进
    return { 
      html: `<div style="margin-left:1rem">${levelHtml || "<em>~EOF~</em>"}</div>`,
      size: totalSize,
      fileCount: totalFileCount
    };
  }

  const result = await listLevel(prefix);
  let html = result.html;
  
  // 根目录显示为一个 summary 为 "/" 的 details
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
  return idx === -1 ? "" : trimmed.slice(0, idx + 1); // 返回带尾部 / 的父目录
}
