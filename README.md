# Copyous

A GNOME Shell clipboard manager for text, code, images, files, links, and colors. Supports search, pinned items, tags, custom actions, and configurable shortcuts.

## Build and install

Requires Node.js 24.12 or newer, pnpm, Make, jq, gettext, GLib tools, and `gnome-extensions`. The GNOME Shell submodule supplies the Sass theme sources. Optional runtime packages include Libgda 5 or 6 with SQLite support and GSound; JSON storage works without Libgda.

```sh
git submodule update --init --recursive
pnpm install --ignore-scripts --frozen-lockfile
make build RELEASE=1
make install RELEASE=1
```

Log out and back in after updating, then enable Copyous:

```sh
gnome-extensions enable copyous@boerdereinar.dev
```

The build and type-aware linting use TypeScript 7. Oxlint checks correctness and GNOME-specific restrictions; Oxfmt handles formatting and import sorting. Stylesheets use native Dart Sass.

## Use

Open history with **Super + Shift + V**. Select an item and press **Enter** to copy it, **Ctrl + S** to pin it, or **Delete** to remove it. Preferences contain the complete shortcuts and action settings:

```sh
gnome-extensions prefs copyous@boerdereinar.dev
```

## Development

```sh
make lint
make test RELEASE=1
```

Tests need GJS, Libgda, and `gnome-shell-test-tool` with headless Wayland support. SQLite test fixtures also require `sqlite3`. Tests use isolated temporary history and settings. Run Shell tests sequentially because they share the test compositor socket.

Copy `.env.template` to `.env` for development settings. `make launch` installs a debug build and starts a nested Shell; `make launch-settings` opens preferences with logs.

## Credits and license

Copyous is a rewrite of [Pano](https://github.com/oae/gnome-shell-pano). Licensed under [GPL-3.0-or-later](LICENSE). Third-party source files retain their own license notices.
