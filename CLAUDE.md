# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A static, single-page tool that converts a chosen date/time into Discord timestamp markup (`<t:UNIX:FORMAT>`) and previews how each format renders. It has no build step, package manager, tests, or linter. To run it, open `index.html` in a browser or serve the directory statically (e.g. `python3 -m http.server`). Clipboard copy needs a secure context (localhost or https).

## Architecture

- The only external dependency is spacetime (date/timezone math), pinned to major version 7 on unpkg. There is no jQuery or CSS framework: the DOM code is plain JS, and `discordtime.css` is hand-written with color tokens on `:root` and a `prefers-color-scheme: light` override.
- `discordtime.js`:
  - State is two globals: `time` (a spacetime object) and `selectedTimezone` (a display name). Every input handler updates `time` and then calls `updateAll()`, which redraws the whole UI from those globals.
  - spacetime only accepts IANA ids. `customTimezones` maps the FFXIV display names `"Eorzean ST (GMT-0)"` (the default) and `"Server Time (GMT-0)"` to `Etc/GMT`, so always pass zones through `resolveTimezone()` before calling `goto()` or `spacetime(…, tz)`.
  - The timezone picker is a native `<datalist>`. `findTimezone()` matches typed text case-insensitively, and invalid input reverts to the current zone.
  - The output rows are generated from the `FORMATS` table. Previews use `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` with the browser locale, the same way Discord renders timestamps, so they show the viewer's local time rather than the selected zone. The relative (`R`) preview refreshes every 15 seconds.
  - The "Human readable time" field shows `describeTime()` output and accepts free text parsed by `parseHumanTime()`, both in `humantime.js` (a hand-written parser with no dependency besides spacetime). `describeTime()` output must parse back to the same time, so keep the two in sync. Typing shows a live preview, and Enter or blur commits it.
  - Query string: the first query **key** (not a value) is read as a time, e.g. `?8pm` or `?8pm-europe/amsterdam`. Text after `-` is the timezone, and a key ending in `st` selects Server Time.
