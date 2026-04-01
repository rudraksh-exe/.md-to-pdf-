#!/usr/bin/env node

'use strict';

const fs        = require('fs');
const path      = require('path');
const puppeteer = require('puppeteer');
const hljs      = require('highlight.js');
const MarkdownIt = require('markdown-it');

// ─── markdown-it with highlight.js syntax highlighting ───────────────────────
const md = new MarkdownIt({
  html:        true,
  linkify:     true,
  typographer: false,          // keep backtick chars literal
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>'
        );
      } catch (_) {}
    }
    // fallback — still wrap in hljs class so styles apply
    return (
      '<pre class="hljs"><code>' +
      md.utils.escapeHtml(str) +
      '</code></pre>'
    );
  },
});

// ─── Fix corrupted/pre-escaped markdown source ───────────────────────────────
// Some editors or copy-paste workflows escape markdown special chars and encode
// spaces as &#x20; inside what should be raw code blocks. This undoes that
// before the content ever reaches the markdown parser.
function cleanMarkdown(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceTag = '';
  let pendingBlank = false;   // suppress consecutive blank lines inside fences

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // detect fenced code block boundaries (``` or ~~~)
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceTag = fenceMatch[1];
        pendingBlank = false;
        out.push(line);
        continue;
      } else if (line.startsWith(fenceTag)) {
        inFence = false;
        fenceTag = '';
        out.push(line);
        continue;
      }
    }

    if (inFence) {
      // 1. &#x20; → real space (indentation was encoded as HTML entities)
      line = line.replace(/&#x20;/g, ' ');
      // 2. unescape markdown-escaped chars: \# \* \[ \] \& \_ \` etc.
      line = line.replace(/\\([#*\[\]&_`!|\\{}()])/g, '$1');
      // 3. collapse excess blank lines (blank lines between code lines look bad)
      if (line.trim() === '') {
        if (pendingBlank) continue;   // skip second+ consecutive blank line
        pendingBlank = true;
      } else {
        pendingBlank = false;
      }
      out.push(line);
    } else {
      // Outside code blocks: only unescape \--- (thematic break) so --- works
      line = line.replace(/^\\(---+)$/, '$1');
      out.push(line);
    }
  }

  return out.join('\n');
}

// ─── ANSI colours ────────────────────────────────────────────────────────────
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const ok   = (s) => `\x1b[32m✔\x1b[0m  ${s}`;
const fail = (s) => `\x1b[31m✘\x1b[0m  ${s}`;
const info = (s) => `\x1b[36m→\x1b[0m  ${s}`;
const warn = (s) => `\x1b[33m!\x1b[0m  ${s}`;

// ─── GitHub-style CSS  +  highlight.js (github theme) ────────────────────────
// We inline the hljs github theme so no internet is needed at render time.
const HLJS_GITHUB_CSS = `
.hljs{color:#24292e;background:#f6f8fa}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background:#f0fff4}.hljs-deletion{color:#b31d28;background:#ffeef0}
`;

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #24292f;
    background: #ffffff;
    padding: 45px 60px;
    max-width: 900px;
    margin: 0 auto;
    word-wrap: break-word;
  }

  /* ── Headings ──────────────────────────────────────────── */
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    line-height: 1.25;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  h1 {
    font-size: 2em;
    font-weight: 700;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #d0d7de;
    margin-top: 0;
  }
  h2 {
    font-size: 1.5em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #d0d7de;
  }
  h3  { font-size: 1.25em; }
  h4  { font-size: 1em; }
  h5  { font-size: 0.875em; }
  h6  { font-size: 0.85em; color: #57606a; }

  /* ── Paragraph & inline ────────────────────────────────── */
  p   { margin-bottom: 1em; }
  strong { font-weight: 600; }
  em     { font-style: italic; }
  del    { text-decoration: line-through; color: #57606a; }
  a      { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* ── HR ────────────────────────────────────────────────── */
  hr {
    height: 1px;
    border: none;
    background: #d0d7de;
    margin: 1.8em 0;
  }

  /* ── Lists ─────────────────────────────────────────────── */
  ul, ol {
    padding-left: 2em;
    margin-bottom: 1em;
  }
  li { margin-bottom: 0.2em; }
  li > p { margin-bottom: 0.3em; }

  /* ── Blockquote ────────────────────────────────────────── */
  blockquote {
    border-left: 4px solid #d0d7de;
    color: #57606a;
    padding: 0 1em;
    margin: 0 0 1em 0;
  }
  blockquote > p:last-child { margin-bottom: 0; }

  /* ── Inline code ───────────────────────────────────────── */
  :not(pre) > code {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.875em;
    background: rgba(175,184,193,0.2);
    color: #24292f;
    padding: 0.2em 0.4em;
    border-radius: 6px;
    white-space: break-spaces;
  }

  /* ── Fenced code block ─────────────────────────────────── */
  pre.hljs {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.875em;
    line-height: 1.6;
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 16px;
    margin: 0 0 1em 0;
    overflow-x: auto;
    white-space: pre;
    word-wrap: normal;
  }
  pre.hljs > code {
    background: none;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
    color: inherit;
    white-space: inherit;
  }

  /* ── Tables ────────────────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 1em 0;
    display: block;
    overflow-x: auto;
  }
  thead tr { background: #f6f8fa; }
  th {
    padding: 6px 13px;
    border: 1px solid #d0d7de;
    font-weight: 600;
    text-align: left;
  }
  td {
    padding: 6px 13px;
    border: 1px solid #d0d7de;
    vertical-align: top;
  }
  tr:nth-child(even) { background: #f6f8fa; }

  /* ── Images ────────────────────────────────────────────── */
  img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    display: block;
    margin: 0.5em 0;
  }

  /* ── Task checkboxes ───────────────────────────────────── */
  .task-list-item { list-style: none; margin-left: -1.6em; }
  .task-list-item input { margin-right: 0.4em; }

  /* ── Page break hint ───────────────────────────────────── */
  h1, h2, h3 { page-break-after: avoid; }
  pre, table, blockquote { page-break-inside: avoid; }
`;

// ─── Build full HTML document ────────────────────────────────────────────────
function buildHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>${HLJS_GITHUB_CSS}</style>
  <style>${PAGE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ─── Convert a single .md file → .pdf ───────────────────────────────────────
async function convertFile(mdPath, browser) {
  const absPath = path.resolve(mdPath.trim());

  if (!fs.existsSync(absPath)) {
    console.log(fail(`File not found: ${absPath}`));
    return { success: false };
  }

  const ext = path.extname(absPath).toLowerCase();
  if (ext !== '.md' && ext !== '.markdown') {
    console.log(warn(`Skipping (not .md): ${absPath}`));
    return { success: false };
  }

  const source   = fs.readFileSync(absPath, 'utf8');
  const cleaned  = cleanMarkdown(source);
  const bodyHtml = md.render(cleaned);
  const title    = path.basename(absPath, ext);
  const fullHtml = buildHtml(title, bodyHtml);

  const pdfPath = absPath.replace(/\.(md|markdown)$/i, '.pdf');

  const page = await browser.newPage();
  try {
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    });
    console.log(ok(`${path.basename(absPath)}  →  ${pdfPath}`));
    return { success: true };
  } catch (err) {
    console.log(fail(`${absPath}: ${err.message}`));
    return { success: false };
  } finally {
    await page.close();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const locationFile = path.resolve('location.txt');

  console.log('\n' + bold('  MD → PDF Converter') + '  \x1b[2mv1.1.0\x1b[0m\n');
  console.log(info(`Reading: ${locationFile}\n`));

  if (!fs.existsSync(locationFile)) {
    console.log(fail(`'location.txt' not found.\n`));
    console.log('  Create it and add one .md path per line:\n');
    console.log('  \x1b[2mC:\\docs\\notes.md\n  C:\\projects\\readme.md\x1b[0m\n');
    process.exit(1);
  }

  const lines = fs
    .readFileSync(locationFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (!lines.length) {
    console.log(warn('location.txt is empty. Add at least one .md path.\n'));
    process.exit(0);
  }

  console.log(info(`Found ${bold(lines.length)} path(s) to process.\n`));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  for (const line of lines) {
    results.push(await convertFile(line, browser));
  }

  await browser.close();

  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  console.log('\n' + '─'.repeat(50));
  console.log(
    `  \x1b[32m\x1b[1m${passed} converted\x1b[0m   ` +
    (failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : `\x1b[2m${failed} failed\x1b[0m`)
  );
  console.log('─'.repeat(50) + '\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(fail(`Unexpected error: ${err.message}`));
  process.exit(1);
});
