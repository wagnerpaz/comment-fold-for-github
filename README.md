# Comment Fold for GitHub

<img src="icons/icon128.png" width="64" alt="">

A browser extension (Chrome / Edge / Brave, Manifest V3) that collapses
comment-only lines in GitHub diffs so you can review just the code.

It works on pull request **Files changed**, commit pages and compare pages.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.

## Use

- Click the **Fold comments** button in the bottom-right of a diff page, or press
  **Alt+Shift+C**.
- Each run of comment-only lines becomes one `▸ N comment lines (+a -d)` row.
  The `+`/`-` counts tell you when the hidden lines include added or
  removed comments. Click the row to expand it and click again to collapse it.
- The on/off setting is saved and shared across tabs.

## What counts as a comment

- A line is collapsed only when **all** of its visible text sits inside
  GitHub's comment syntax token (`.pl-c`). That covers `//`, `/* */`, `/** */`,
  `#`, `--`, `<!-- -->` and any other language GitHub highlights. Lines that mix
  code with a trailing comment stay visible.
- In split view, both sides must be comment or empty.
- If GitHub didn't highlight a file (too large or an unknown type), a
  conservative prefix check runs instead: `//`, `/*`, `*`, `*/`, `<!--`, `# `,
  `-- `, `;;`. It's skipped for prose files (`.md`, `.txt`, `.rst`, …).

## Privacy

Comment Fold collects no data. It makes no network requests, and the only
thing it stores is your on/off setting, in the browser's local extension
storage. It runs only on github.com.

## Known limits

- Python docstrings are highlighted as strings, not comments, so they stay
  visible.
- Supports both the classic diff (`td.blob-code`) and the newer React review
  page at `/pull/N/changes` (`td.diff-text-cell`). If GitHub changes its
  markup, adjust `isCodeCell` and `cellState` in `content.js`.
- JSX comments `{/* … */}` collapse too, including ones spread over several
  lines. The braces are only ignored around block comments, so `} // end if`
  and `{ // note` stay visible.
