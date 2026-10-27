import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

const root = GLib.getenv('COPYOUS_PROJECT_ROOT') ?? GLib.get_current_dir();
for (const file of ['org.gnome.Shell.Extensions.src.gresource', 'gnome-shell-dbus-interfaces.gresource'])
	Gio.resources_register(Gio.Resource.load(`/usr/share/gnome-shell/${file}`));
Gio.resources_register(Gio.Resource.load(`${root}/dist/resources.gresource`));
const { ExtensionPreferences } = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
const prefs = {
	uuid: 'copyous-actions-test',
	gettext: (text) => text,
	ngettext: (singular, plural, count) => (count === 1 ? singular : plural),
};
ExtensionPreferences.lookupByURL = () => prefs;
const { ActionsPage } = await import(`file://${root}/dist/lib/preferences/actions/actionsPage.js`);
const { defaultConfig } = await import(`file://${root}/dist/lib/common/actions.js`);
const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};
const wait = (ms) =>
	new Promise((resolve) =>
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
			resolve();
			return GLib.SOURCE_REMOVE;
		}),
	);
async function capture(name) {
	const ready = GLib.getenv('COPYOUS_ACTIONS_READY');
	if (!ready) return;
	GLib.file_set_contents(ready, name);
	for (let i = 0; i < 100 && GLib.file_test(ready, GLib.FileTest.EXISTS); i++) await wait(50);
	assert(!GLib.file_test(ready, GLib.FileTest.EXISTS), 'Screenshot capture timed out');
}
function children(widget) {
	const result = [];
	for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) result.push(child);
	return result;
}
function descendants(widget) {
	return children(widget).flatMap((child) => [child, ...descendants(child)]);
}

const app = new Adw.Application({ application_id: 'dev.copyous.ActionsTest' });
let failed = false;
app.connect('activate', () => {
	(async () => {
		Adw.StyleManager.get_default().color_scheme = Adw.ColorScheme.FORCE_DARK;
		const window = new Adw.PreferencesWindow({ application: app, default_width: 680, default_height: 850 });
		Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).add_search_path(`${root}/resources/icons`);
		const provider = new Gtk.CssProvider();
		provider.load_from_path(`${root}/resources/css/prefs.css`);
		Gtk.StyleContext.add_provider_for_display(
			Gdk.Display.get_default(),
			provider,
			Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
		);
		const config = defaultConfig(prefs);
		const page = new ActionsPage(prefs, window, config);
		window.add(page);
		window.present();
		await wait(350);
		const list = page._actionsGroup._listbox;
		const rows = children(list).filter((row) => row instanceof Adw.PreferencesRow);
		const open = rows.find((row) => row.title === 'Open');
		const paste = rows.find((row) => row.title === 'Paste as Path');
		assert(open.subtitle === 'Group · 3 actions', 'Missing group count');
		assert(paste.subtitle === 'Images, Files, File Lists', 'Missing readable content types');
		assert(!paste._shortcutLabel.visible, 'Empty shortcut occupies space');
		assert(paste.activatable_widget === paste._editButton, 'Row does not activate editing');
		open.expanded = true;
		await wait(300);
		assert(open._actionsList.get_mapped(), 'Expanded actions are not visible');
		const child = children(open._actionsList.listbox).find((row) => row.action);
		let deleted = false;
		child.connect('delete', () => {
			deleted = true;
		});
		const deletion = child.delete();
		await wait(80);
		assert(window.visible_dialog.close_response === 'cancel', 'Closing delete accepts deletion');
		window.visible_dialog.close();
		await deletion;
		assert(!deleted, 'Closing confirmation deleted an action');
		await wait(250);
		const before = JSON.stringify(config);
		const reset = page.reset();
		await wait(80);
		assert(window.visible_dialog.close_response === 'cancel', 'Closing reset accepts reset');
		window.visible_dialog.close();
		await reset;
		assert(JSON.stringify(config) === before, 'Cancelled reset changed actions');
		await wait(250);
		const restore = page.restore();
		await wait(80);
		assert(window.visible_dialog.close_response === 'cancel', 'Closing restore accepts restore');
		window.visible_dialog.close();
		await restore;
		await wait(250);
		const edit = child.edit();
		await wait(80);
		assert(window.visible_dialog.heading === 'Edit Action', 'Action editor did not open');
		window.visible_dialog.close();
		await edit;
		await wait(250);
		open.actionSubmenu.actions.push({ ...paste.action, id: 'test-copy', name: 'Test copy' });
		open.notify('action-submenu');
		assert(open.subtitle === 'Group · 4 actions', 'Group count did not refresh');
		open.actionSubmenu.actions.pop();
		open.notify('action-submenu');
		await capture('expanded');
		open.expanded = false;
		await wait(300);
		await capture('overview');
		window.default_width = 440;
		window.default_height = 740;
		Gtk.Widget.set_default_direction(Gtk.TextDirection.RTL);
		await wait(300);
		assert(paste.get_direction() === Gtk.TextDirection.RTL, 'RTL direction did not reach action rows');
		assert(paste.get_width() <= window.get_width(), 'Action row exceeds narrow window width');
		assert(
			descendants(page).some((widget) => widget instanceof Gtk.Button && widget.tooltip_text === 'Edit Action'),
			'Missing accessible edit button',
		);
		await capture('narrow-rtl');
		child._editButton.emit('clicked');
		await wait(80);
		const editor = window.visible_dialog;
		const nameEntry = descendants(editor).find(
			(widget) => widget instanceof Adw.EntryRow && widget.title === 'Name',
		);
		nameEntry.text = 'Open <safely>';
		const save = descendants(editor).find(
			(widget) => widget instanceof Gtk.Button && widget.label?.replaceAll('_', '') === 'Save',
		);
		assert(save?.sensitive, 'Save button is not available');
		save.emit('clicked');
		await wait(300);
		assert(child.title === 'Open <safely>' && !child.use_markup, 'Edited title was not displayed literally');
		const [, saved] = GLib.file_get_contents(`${GLib.get_user_config_dir()}/${prefs.uuid}/actions.json`);
		assert(
			JSON.parse(new TextDecoder().decode(saved)).actions[0].actions[0].name === 'Open <safely>',
			'Edited action was not saved',
		);
		window.destroy();
		print(
			'PASS: action hierarchy, counts, content labels, editing, cancelled confirmations, narrow layout and RTL',
		);
	})()
		.catch((error) => {
			failed = true;
			logError(error);
		})
		.finally(() => app.quit());
});
await app.runAsync([]);
if (failed) imports.system.exit(1);
