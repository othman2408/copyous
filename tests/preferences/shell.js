import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export async function run() {
	const root = GLib.getenv('COPYOUS_PROJECT_ROOT');
	if (!root) throw new Error('Run preferences tests with make test-preferences');
	const ready = `${GLib.get_user_cache_dir()}/copyous-actions-ready`;
	const screenshots = GLib.getenv('COPYOUS_TEST_SCREENSHOTS');
	const launcher = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.NONE });
	launcher.setenv('GSK_RENDERER', 'cairo', true);
	if (screenshots) {
		GLib.mkdir_with_parents(screenshots, 0o700);
		launcher.setenv('COPYOUS_ACTIONS_READY', ready, true);
	}
	const child = launcher.spawnv(['gjs', '-m', `${root}/tests/preferences/actions.js`]);
	let finished = false;
	let failure = null;
	child.wait_check_async(null, (object, result) => {
		try {
			object.wait_check_finish(result);
		} catch (error) {
			failure = error;
		}
		finished = true;
	});
	const deadline = GLib.get_monotonic_time() + 30_000_000;
	try {
		while (!finished) {
			if (GLib.get_monotonic_time() > deadline) throw new Error('Preferences tests timed out');
			if (screenshots && GLib.file_test(ready, GLib.FileTest.EXISTS)) {
				const [, bytes] = GLib.file_get_contents(ready);
				const name = new TextDecoder().decode(bytes);
				await Scripting.sleep(150);
				const stream = Gio.File.new_for_path(`${screenshots}/actions-${name}.png`).replace(
					null,
					false,
					Gio.FileCreateFlags.REPLACE_DESTINATION,
					null,
				);
				try {
					const screenshot = new Shell.Screenshot();
					await new Promise((resolve, reject) =>
						screenshot.screenshot(false, stream, (object, result) => {
							try {
								object.screenshot_finish(result);
								resolve();
							} catch (error) {
								reject(error);
							}
						}),
					);
				} finally {
					stream.close(null);
				}
				GLib.unlink(ready);
			}
			await Scripting.sleep(50);
		}
		if (failure) throw failure;
	} finally {
		if (!finished) child.force_exit();
	}
}
