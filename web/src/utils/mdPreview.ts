/** 预览用：正文若是 Markdown 则在 iframe 内渲染，不改入库格式 */

export function looksLikeHtml(source: string): boolean {
  return /<(?:section|article|div|p|h[1-6]|ul|ol|blockquote|table|html|body)\b/i.test(source);
}

export function markdownToPreviewHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inCode = false;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let inQuote = false;

  const inline = (text: string) =>
    text
      .replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<img src="$2" alt="$1" style="max-width:100%;height:auto;display:block;margin:12px auto;" />',
      )
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const closeList = () => {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      html.push('</blockquote>');
      inQuote = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^```/.test(line)) {
      if (inCode) {
        html.push('</code></pre>');
        inCode = false;
      } else {
        closeList();
        closeQuote();
        html.push('<pre><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }
    if (!line.trim()) {
      closeList();
      closeQuote();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeQuote();
      const level = Math.min(6, heading[1].length);
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      closeList();
      if (!inQuote) {
        html.push('<blockquote>');
        inQuote = true;
      }
      html.push(`<p>${inline(line.replace(/^\s*>\s?/, ''))}</p>`);
      continue;
    }
    closeQuote();
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (inList && listType !== 'ul') closeList();
      if (!inList) {
        html.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (inList && listType !== 'ol') closeList();
      if (!inList) {
        html.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) html.push('</code></pre>');
  closeList();
  closeQuote();
  return html.join('\n').replace(/>([^<]*)</g, (_m, text: string) => `>${text.replace(/[*＊]+/g, '')}<`);
}

export function toPreviewHtml(source: string): string {
  const raw = source.trim();
  if (!raw) return '';
  if (looksLikeHtml(raw)) return source;
  return markdownToPreviewHtml(source);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
