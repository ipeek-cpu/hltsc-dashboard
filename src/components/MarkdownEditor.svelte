<script lang="ts">
  import { marked } from 'marked';
  import Icon from './Icon.svelte';

  let { value = '', onchange, placeholder = 'Enter description...' }: {
    value?: string;
    onchange?: (value: string) => void;
    placeholder?: string;
  } = $props();

  let mode: 'edit' | 'preview' = $state('edit');
  let textareaEl: HTMLTextAreaElement | null = $state(null);

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onchange?.(target.value);
  }

  function insertFormatting(before: string, after: string = '', defaultText: string = '') {
    if (!textareaEl) return;

    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const selectedText = value.substring(start, end);
    const textToWrap = selectedText || defaultText;

    const newValue = value.substring(0, start) + before + textToWrap + after + value.substring(end);
    onchange?.(newValue);

    // Restore focus and set cursor position
    requestAnimationFrame(() => {
      if (!textareaEl) return;
      textareaEl.focus();
      if (selectedText) {
        // If text was selected, place cursor after the inserted text
        textareaEl.setSelectionRange(start + before.length, start + before.length + textToWrap.length);
      } else {
        // If no text was selected, select the default text so user can type over it
        textareaEl.setSelectionRange(start + before.length, start + before.length + defaultText.length);
      }
    });
  }

  function insertAtLineStart(prefix: string) {
    if (!textareaEl) return;

    const start = textareaEl.selectionStart;
    // Find the start of the current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;

    const newValue = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onchange?.(newValue);

    requestAnimationFrame(() => {
      if (!textareaEl) return;
      textareaEl.focus();
      textareaEl.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  function insertLink() {
    if (!textareaEl) return;

    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const selectedText = value.substring(start, end);

    if (selectedText) {
      // Wrap selected text as link text
      insertFormatting('[', '](url)', '');
    } else {
      // Insert full link template
      insertFormatting('[', '](url)', 'link text');
    }
  }

  // Strip YAML frontmatter for preview rendering
  function stripFrontmatter(content: string): { frontmatter: string | null; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
      return { frontmatter: match[1], body: match[2] };
    }
    return { frontmatter: null, body: content };
  }

  // Format frontmatter as a readable block
  function formatFrontmatter(yaml: string): string {
    const lines = yaml.trim().split('\n');
    const formatted = lines.map(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let val = line.substring(colonIndex + 1).trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Truncate very long values
        if (val.length > 100) {
          val = val.substring(0, 100) + '...';
        }
        return `<strong>${key}:</strong> ${val}`;
      }
      return line;
    }).join('<br>');
    return `<div class="frontmatter-block">${formatted}</div>`;
  }

  let renderedMarkdown = $derived(() => {
    if (!value) return '<p class="empty-preview">No content</p>';
    try {
      const { frontmatter, body } = stripFrontmatter(value);
      let html = '';
      if (frontmatter) {
        html += formatFrontmatter(frontmatter);
      }
      if (body.trim()) {
        html += marked(body);
      }
      return html || '<p class="empty-preview">No content</p>';
    } catch {
      return value;
    }
  });

  const toolbarButtons = [
    { icon: 'bold', title: 'Bold (Ctrl+B)', action: () => insertFormatting('**', '**', 'bold text') },
    { icon: 'italic', title: 'Italic (Ctrl+I)', action: () => insertFormatting('_', '_', 'italic text') },
    { icon: 'type', title: 'Heading', action: () => insertAtLineStart('## ') },
    { icon: 'link', title: 'Link', action: insertLink },
    { icon: 'code', title: 'Inline Code', action: () => insertFormatting('`', '`', 'code') },
    { icon: 'list', title: 'Bullet List', action: () => insertAtLineStart('- ') },
    { icon: 'hash', title: 'Numbered List', action: () => insertAtLineStart('1. ') },
    { icon: 'minus', title: 'Blockquote', action: () => insertAtLineStart('> ') },
  ];

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        insertFormatting('**', '**', 'bold text');
      } else if (e.key === 'i') {
        e.preventDefault();
        insertFormatting('_', '_', 'italic text');
      } else if (e.key === 'k') {
        e.preventDefault();
        insertLink();
      }
    }
  }
</script>

<div class="markdown-editor">
  <div class="editor-header">
    <div class="editor-tabs">
      <button
        class="tab"
        class:active={mode === 'edit'}
        onclick={() => mode = 'edit'}
      >
        <Icon name="edit-3" size={14} />
        Edit
      </button>
      <button
        class="tab"
        class:active={mode === 'preview'}
        onclick={() => mode = 'preview'}
      >
        <Icon name="eye" size={14} />
        Preview
      </button>
    </div>

    {#if mode === 'edit'}
      <div class="toolbar">
        {#each toolbarButtons as btn}
          <button
            class="toolbar-btn"
            title={btn.title}
            onclick={btn.action}
            type="button"
          >
            <Icon name={btn.icon} size={16} />
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="editor-content">
    {#if mode === 'edit'}
      <textarea
        bind:this={textareaEl}
        class="editor-textarea"
        {placeholder}
        value={value}
        oninput={handleInput}
        onkeydown={handleKeydown}
      ></textarea>
    {:else}
      <div class="markdown-preview">
        {@html renderedMarkdown()}
      </div>
    {/if}
  </div>
</div>

<style>
  .markdown-editor {
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    gap: 8px;
  }

  .editor-tabs {
    display: flex;
    gap: 2px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .tab:hover {
    background: #eeeeee;
    color: #1a1a1a;
  }

  .tab.active {
    background: #ffffff;
    color: #1a1a1a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover {
    background: #e8e8e8;
    color: #1a1a1a;
  }

  .toolbar-btn:active {
    background: #ddd;
  }

  .editor-content {
    height: calc(100vh - 280px);
    overflow: hidden;
  }

  .editor-textarea {
    width: 100%;
    height: 100%;
    padding: 14px;
    padding-bottom: 40px;
    border: none;
    resize: none;
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: #1a1a1a;
    background: #ffffff;
    overflow-y: auto;
  }

  .editor-textarea:focus {
    outline: none;
  }

  .editor-textarea::placeholder {
    color: #aaaaaa;
  }

  .markdown-preview {
    padding: 14px;
    padding-bottom: 40px;
    font-size: 14px;
    line-height: 1.6;
    color: #1a1a1a;
    height: 100%;
    overflow-y: auto;
  }

  .markdown-preview :global(h1),
  .markdown-preview :global(h2),
  .markdown-preview :global(h3),
  .markdown-preview :global(h4),
  .markdown-preview :global(h5),
  .markdown-preview :global(h6) {
    margin-top: 0;
    margin-bottom: 12px;
    font-family: 'Figtree', sans-serif;
    font-weight: 600;
    color: #1a1a1a;
  }

  .markdown-preview :global(h1) { font-size: 1.5em; }
  .markdown-preview :global(h2) { font-size: 1.3em; }
  .markdown-preview :global(h3) { font-size: 1.15em; }

  .markdown-preview :global(p) {
    margin: 0 0 12px 0;
  }

  .markdown-preview :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-preview :global(ul),
  .markdown-preview :global(ol) {
    margin: 0 0 12px 0;
    padding-left: 20px;
  }

  .markdown-preview :global(li) {
    margin-bottom: 4px;
  }

  .markdown-preview :global(code) {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 0.9em;
  }

  .markdown-preview :global(pre) {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 12px 0;
  }

  .markdown-preview :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown-preview :global(blockquote) {
    margin: 0 0 12px 0;
    padding-left: 14px;
    border-left: 3px solid #e0e0e0;
    color: #666666;
  }

  .markdown-preview :global(a) {
    color: #2563eb;
    text-decoration: none;
  }

  .markdown-preview :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-preview :global(.empty-preview) {
    color: #aaaaaa;
    font-style: italic;
  }

  .markdown-preview :global(.frontmatter-block) {
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 16px;
    font-size: 13px;
    line-height: 1.8;
    color: #4b5563;
  }

  .markdown-preview :global(.frontmatter-block strong) {
    color: #1a1a1a;
    font-weight: 600;
  }
</style>
