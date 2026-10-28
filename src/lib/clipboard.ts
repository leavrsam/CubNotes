/**
 * Smart Universal Clipboard Engine
 * Formats Markdown notes into rich-text HTML and clean plaintext simultaneously.
 * - When pasted into Slack / Teams: Clean bold titles, bullet points, and checkboxes (no raw markdown hashtags or asterisks).
 * - When pasted into Gmail / Outlook / Apple Mail: Rich styled headers, lists, and typography.
 * - When pasted into Docs / Notion: Native formatted blocks.
 */

function markdownToHtml(markdown: string, title?: string): string {
  const lines = markdown.split('\n');
  const htmlParts: string[] = [];
  
  if (title) {
    htmlParts.push(`<h1 style="font-size: 20px; font-weight: bold; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${escapeHtml(title)}</h1>`);
  }

  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Checkbox items
    const taskMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (taskMatch) {
      if (!inList) {
        htmlParts.push('<ul style="padding-left: 20px; margin: 6px 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">');
        inList = true;
      }
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const taskText = formatInlineStyles(taskMatch[2]);
      htmlParts.push(`<li style="list-style-type: none; margin-bottom: 4px;">${isChecked ? '☑ ' : '☐ '} ${taskText}</li>`);
      continue;
    }

    // Standard Bullet items
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        htmlParts.push('<ul style="padding-left: 20px; margin: 6px 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">');
        inList = true;
      }
      htmlParts.push(`<li style="margin-bottom: 4px;">${formatInlineStyles(bulletMatch[1])}</li>`);
      continue;
    }

    // Close any open list
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      htmlParts.push(`<h1 style="font-size: 18px; font-weight: bold; margin-top: 14px; margin-bottom: 6px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${formatInlineStyles(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('## ')) {
      htmlParts.push(`<h2 style="font-size: 16px; font-weight: bold; margin-top: 12px; margin-bottom: 6px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${formatInlineStyles(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('### ')) {
      htmlParts.push(`<h3 style="font-size: 14px; font-weight: bold; margin-top: 10px; margin-bottom: 4px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${formatInlineStyles(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('---') || trimmed.startsWith('***')) {
      htmlParts.push('<hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 12px 0;" />');
    } else {
      htmlParts.push(`<p style="margin: 6px 0; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${formatInlineStyles(trimmed)}</p>`);
    }
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  return `<div style="color: #18181b; font-size: 14px; line-height: 1.6;">${htmlParts.join('\n')}</div>`;
}

function markdownToCleanPlaintext(markdown: string, title?: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];

  if (title) {
    result.push(`*${title}*`);
    result.push('');
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    // Convert task checkboxes to clean unicode symbols
    const taskMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      result.push(`${isChecked ? '☑' : '☐'} ${taskMatch[2]}`);
      continue;
    }

    // Headings to Slack-friendly bold
    if (trimmed.startsWith('# ')) {
      result.push(`*${trimmed.slice(2)}*`);
    } else if (trimmed.startsWith('## ')) {
      result.push(`*${trimmed.slice(3)}*`);
    } else if (trimmed.startsWith('### ')) {
      result.push(`*${trimmed.slice(4)}*`);
    } else if (trimmed.startsWith('---')) {
      result.push('──────────');
    } else {
      result.push(trimmed);
    }
  }

  return result.join('\n').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInlineStyles(text: string): string {
  let res = escapeHtml(text);
  // Bold **word**
  res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *word* or _word_
  res = res.replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
  // Inline code `code`
  res = res.replace(/`([^`]+?)`/g, '<code style="background: #f4f4f5; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 12px;">$1</code>');
  return res;
}

export async function copyFormattedMeetingNotes(markdown: string, title?: string): Promise<boolean> {
  if (!markdown || !markdown.trim()) return false;

  const html = markdownToHtml(markdown, title);
  const plain = markdownToCleanPlaintext(markdown, title);

  try {
    if (typeof window !== 'undefined' && navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.warn("ClipboardItem write failed, falling back to plaintext:", err);
  }

  // Fallback to standard plaintext
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch (err) {
    console.error("Failed to copy notes to clipboard:", err);
    return false;
  }
}
