# MD → PDF Converter

A lightweight, zero-configuration CLI tool that reads a list of Markdown file paths and converts them into beautiful, highly readable PDF documents.

## Features

- **No Frontend Needed**: Runs entirely locally via the terminal.
- **Accurate Rendering**: Uses `markdown-it` + `highlight.js` to perfectly parse Markdown without character escaping bugs.
- **Beautiful Output**: Styled like GitHub's markdown view and AI chat previews (deep `#1e1e2e` code backgrounds, Inter font, clean headings).
- **Auto-Cleanup**: Automatically cleans up and fixes pre-escaped characters (e.g., `\#`, `\*`, `&#x20;`) from source files before rendering.

## Requirements

- Node.js installed on your machine.

## Installation

1. Clone this repository or download the files.
2. Open a terminal in the folder.
3. Install dependencies:
   ```sh
   npm install
   ```

## Usage

1. Open `location.txt` in a text editor.
2. Add the absolute paths of the `.md` files you want to convert (one path per line).
   Example:
   ```text
   C:\Users\you\Documents\notes.md
   D:\Projects\readme.md
   ```
3. Run the converter:
   ```sh
   npm start
   ```
   *or*
   ```sh
   node convert.js
   ```

The script will generate a `.pdf` file right next to each `.md` file with the exact same name.

## Configuration

- `convert.js`: The main logic. Contains the styling rules (`PAGE_CSS`) if you want to tweak colors, fonts, or margins.
- `location.txt`: The input list of files. Lines starting with `#` are ignored as comments.
