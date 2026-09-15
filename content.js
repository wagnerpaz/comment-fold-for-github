(() => {
  const STORAGE_KEY = 'gccEnabled';
  const HIDDEN = 'gcc-hidden';
  const PLACEHOLDER = 'gcc-placeholder';
  const DIFF_PAGE = /^\/[^/]+\/[^/]+\/(pull\/\d+|commit\/|compare\/)/;
  // File types where a leading "#", "*" or "--" is content, not a comment.
  const PROSE_FILE = /\.(md|mdx|markdown|txt|rst|adoc|csv|tsv)$/i;
  // Used only when GitHub did not syntax-highlight the line (big or unknown files).
  const FALLBACK_COMMENT = /^(\/\/|\/\*|\{\/\*|\*\/|\*(\s|$)|<!--|-->|#(\s|$)|--\s|;;|%\s|rem\s)/i;
  const COMMENT_MARK = '';
  // Only comment markers, optionally wrapped in a JSX `{` and/or `}`.
  const JSX_WRAPPED = /^(\{)?+(\})?$/;

  let enabled = false;
  let applying = false;
  let button;

  const storage = globalThis.chrome?.storage?.local;

  function isDiffPage() {
    return DIFF_PAGE.test(location.pathname);
  }

  // Classic view: td.blob-code. New React view (/pull/N/changes): td.diff-text-cell.
  // The React code cell also carries data-line-number, so match code cells first.
  function isCodeCell(td) {
    if (td.matches('.blob-code-hunk, .diff-hunk-cell')) return false;
    return td.matches('.blob-code, .diff-text-cell');
  }

  function filePath(el) {
    const file = el.closest('[data-tagsearch-path], [data-file-path], [data-path]');
    if (!file) return '';
    return file.dataset.tagsearchPath ?? file.dataset.filePath ?? file.dataset.path ?? '';
  }

  // 'empty' | 'comment' | 'code'
  function cellState(td) {
    if (td.classList.contains('blob-code-empty')) return 'empty';
    // The React view renders the +/- marker as text next to .diff-text-inner, so read only the inner part.
    const inner = td.querySelector('.blob-code-inner, .diff-text-inner') || td;
    const text = inner.textContent;
    if (!text.trim()) return 'empty';

    if (inner.querySelector('[class*="pl-"]')) {
      // Swap each comment token for a marker, then look at what's left around the markers.
      const clone = inner.cloneNode(true);
      const comments = [...clone.querySelectorAll('.pl-c')].filter((c) => !c.parentElement.closest('.pl-c'));
      if (!comments.length) return 'code';
      const first = comments[0].textContent.trim();
      const last = comments[comments.length - 1].textContent.trim();
      comments.forEach((c) => c.replaceWith(COMMENT_MARK));
      const rest = clone.textContent.replace(/\s/g, '');
      const match = JSX_WRAPPED.exec(rest);
      if (!match) return 'code';
      // JSX comments: `{/* ... */}`, possibly spread over several lines. Only accept the
      // braces around block comments, so `} // end if` and `{ // note` stay visible.
      if (match[1] && !first.startsWith('/*')) return 'code';
      if (match[2] && !last.endsWith('*/')) return 'code';
      return 'comment';
    }

    if (PROSE_FILE.test(filePath(td))) return 'code';
    return FALLBACK_COMMENT.test(text.trim()) ? 'comment' : 'code';
  }

  // null = not a code row (hunk header, review thread, expander) | 'comment' | 'code'
  function rowState(tr) {
    const cells = [...tr.children].filter((td) => td.tagName === 'TD' && isCodeCell(td));
    if (!cells.length) return null;
    const states = cells.map(cellState);
    if (states.includes('code')) return 'code';
    return states.includes('comment') ? 'comment' : 'code';
  }

  function makePlaceholder(run, colspan) {
    const expanded = run[0].dataset.gccExpanded === '1';
    const added = run.filter((r) => r.querySelector('.blob-code-addition, .diff-text.addition')).length;
    const removed = run.filter((r) => r.querySelector('.blob-code-deletion, .diff-text.deletion')).length;

    const tr = document.createElement('tr');
    tr.className = PLACEHOLDER;
    const td = document.createElement('td');
    td.colSpan = colspan;
    const n = run.length;
    td.append(`${expanded ? '▾ hide' : '▸'} ${n} comment line${n === 1 ? '' : 's'}`);
    if (added || removed) {
      td.append(' (');
      if (added) td.append(Object.assign(document.createElement('span'), { className: 'gcc-add', textContent: `+${added}` }));
      if (added && removed) td.append(' ');
      if (removed) td.append(Object.assign(document.createElement('span'), { className: 'gcc-del', textContent: `-${removed}` }));
      td.append(')');
    }
    tr.append(td);

    tr.addEventListener('click', () => {
      const next = run[0].dataset.gccExpanded !== '1';
      run.forEach((r) => {
        r.dataset.gccExpanded = next ? '1' : '';
        r.classList.toggle(HIDDEN, !next);
      });
      withoutObserver(() => tr.replaceWith(makePlaceholder(run, colspan)));
    });

    run.forEach((r) => r.classList.toggle(HIDDEN, !expanded));
    return tr;
  }

  function processBody(body) {
    body.querySelectorAll(`:scope > tr.${PLACEHOLDER}`).forEach((p) => p.remove());
    const rows = [...body.children].filter((r) => r.tagName === 'TR');
    rows.forEach((r) => r.classList.remove(HIDDEN));
    if (!enabled) return;

    let run = [];
    const flush = () => {
      if (run.length) {
        const colspan = [...run[0].children].reduce((sum, td) => sum + (td.colSpan || 1), 0);
        run[0].before(makePlaceholder(run, colspan));
      }
      run = [];
    };
    for (const r of rows) {
      if (rowState(r) === 'comment') run.push(r);
      else flush();
    }
    flush();
  }

  function diffBodies(root = document) {
    return [...root.querySelectorAll('table tbody')].filter((b) =>
      b.closest('table.diff-table, [class*="diff" i]'),
    );
  }

  function withoutObserver(fn) {
    applying = true;
    try {
      fn();
    } finally {
      observer.takeRecords();
      applying = false;
    }
  }

  function processAll() {
    withoutObserver(() => diffBodies().forEach(processBody));
    updateButton();
  }

  function updateButton() {
    if (!button) {
      button = document.createElement('button');
      button.id = 'gcc-toggle';
      button.type = 'button';
      button.title = 'Fold comment-only lines (Alt+Shift+C)';
      // Same motif as the extension icon: a chevron followed by dots.
      button.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
        '<path d="M2 4.5v7L6.5 8z" fill="currentColor" class="gcc-chevron"/>' +
        '<circle cx="9" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/>' +
        '<circle cx="15" cy="8" r="1.2" fill="currentColor"/></svg><span class="gcc-label"></span>';
      button.addEventListener('click', () => setEnabled(!enabled));
    }
    if (!button.isConnected) document.body.append(button);
    button.hidden = !isDiffPage();
    button.setAttribute('aria-pressed', String(enabled));
    const folds = document.querySelectorAll(`tr.${PLACEHOLDER}`).length;
    button.querySelector('.gcc-label').textContent = enabled
      ? `${folds} comment block${folds === 1 ? '' : 's'} folded`
      : 'Fold comments';
  }

  function setEnabled(value) {
    enabled = value;
    storage?.set({ [STORAGE_KEY]: value });
    processAll();
  }

  let pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver((records) => {
    if (applying || !isDiffPage()) return;
    for (const rec of records) {
      const body = rec.target.closest?.('tbody');
      if (body) pending.add(body);
      for (const node of rec.addedNodes) {
        if (node.nodeType !== 1 || node.classList.contains(PLACEHOLDER)) continue;
        if (node.tagName === 'TBODY') pending.add(node);
        diffBodies(node).forEach((b) => pending.add(b));
      }
    }
    if (!pending.size || scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const bodies = [...pending].filter((b) => b.isConnected && b.closest('table.diff-table, [class*="diff" i]'));
      pending = new Set();
      withoutObserver(() => bodies.forEach(processBody));
      updateButton();
    }, 150);
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.altKey && e.shiftKey && e.code === 'KeyC') || !isDiffPage()) return;
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    setEnabled(!enabled);
  });

  // GitHub navigates with Turbo; re-check when the page changes.
  document.addEventListener('turbo:load', processAll);
  window.addEventListener('popstate', () => setTimeout(processAll, 300));

  storage?.onChanged?.addListener((changes) => {
    if (STORAGE_KEY in changes && changes[STORAGE_KEY].newValue !== enabled) {
      enabled = !!changes[STORAGE_KEY].newValue;
      processAll();
    }
  });

  const start = (stored) => {
    enabled = !!stored;
    observer.observe(document.body, { childList: true, subtree: true });
    processAll();
  };
  if (storage) storage.get(STORAGE_KEY).then((r) => start(r[STORAGE_KEY]));
  else start(false);
})();
