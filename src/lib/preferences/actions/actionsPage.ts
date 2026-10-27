import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Preferences from '../../../prefs.js';
import { ActionConfig, countDifference, defaultConfig, mergeConfig, saveConfig } from '../../common/actions.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ActionDefaultsPage } from './actionDefaults.js';
import { ActionsGroup } from './actionsGroup.js';

Gio._promisify(Adw.AlertDialog.prototype, 'choose');

@registerClass()
class ResetDialog extends Adw.AlertDialog {
	constructor(props: Partial<Adw.AlertDialog.ConstructorProps>) {
		super(props);

		this.add_response('cancel', _('Cancel'));
		this.add_response('reset', _('Reset'));
		this.close_response = 'cancel';
		this.default_response = 'cancel';
		this.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
	}
}

@registerClass()
class RestoreDialog extends Adw.AlertDialog {
	constructor(props: Partial<Adw.AlertDialog.ConstructorProps>) {
		super(props);

		this.add_response('cancel', _('Cancel'));
		this.add_response('restore', _('Restore'));
		this.close_response = 'cancel';
		this.default_response = 'cancel';
		this.set_response_appearance('restore', Adw.ResponseAppearance.SUGGESTED);
	}
}

@registerClass()
export class ActionsPage extends Adw.PreferencesPage {
	private _config: ActionConfig;
	private readonly _actionsGroup: ActionsGroup;
	private readonly _defaultsPage: ActionDefaultsPage;
	private readonly _restoreButton: Adw.ActionRow;
	private readonly _restoreBadge: Gtk.Label;

	constructor(
		private prefs: Preferences,
		private window: Adw.PreferencesWindow,
		config: ActionConfig,
	) {
		super({
			name: 'actions',
			title: _('Actions'),
			icon_name: Icon.Action,
		});

		this._config = config;

		this._actionsGroup = new ActionsGroup(window, this._config.actions);
		this.add(this._actionsGroup);

		const defaultsGroup = new Adw.PreferencesGroup({ title: _('Quick Activation') });
		this.add(defaultsGroup);
		const defaultsButton = new Adw.ActionRow({
			title: _('Default Actions'),
			subtitle: _('Choose what happens when you hold Ctrl while activating an item'),
			activatable: true,
		});
		defaultsGroup.add(defaultsButton);
		defaultsButton.add_prefix(new Gtk.Image({ icon_name: Icon.Keyboard }));
		defaultsButton.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));

		const resetGroup = new Adw.PreferencesGroup({ title: _('Manage Actions') });
		this.add(resetGroup);

		this._restoreButton = new Adw.ActionRow({
			title: _('Restore Built-In Actions'),
			subtitle: _('Add back missing built-ins. Keep your custom actions.'),
			activatable: true,
			sensitive: false,
		});
		this._restoreButton.add_prefix(new Gtk.Image({ icon_name: Icon.Undo }));
		this._restoreButton.connect('activated', this.restore.bind(this));
		resetGroup.add(this._restoreButton);

		this._restoreBadge = new Gtk.Label({
			css_classes: ['actions-badge'],
			valign: Gtk.Align.CENTER,
			visible: false,
		});
		this._restoreButton.add_suffix(this._restoreBadge);
		this.updateRestoreButton();

		const resetButton = new Adw.ActionRow({
			title: _('Reset All Actions'),
			subtitle: _('Replace all actions with the built-ins. Removes custom actions.'),
			activatable: true,
		});
		resetButton.add_css_class('reset-actions-row');
		resetButton.add_prefix(new Gtk.Image({ icon_name: Icon.Delete }));
		resetButton.connect('activated', this.reset.bind(this));
		resetGroup.add(resetButton);

		this._defaultsPage = new ActionDefaultsPage(this._config);
		defaultsButton.connect('activated', () => window.push_subpage(this._defaultsPage));
		this._defaultsPage.connect('notify::defaults', () => saveConfig(prefs, this._config));

		this._actionsGroup.connect('notify::actions', () => {
			this._config.actions = this._actionsGroup.actions;
			this._defaultsPage.update(this._config);

			saveConfig(prefs, this._config);
			this.updateRestoreButton();
		});
	}

	private async restore() {
		const resetDialog = new RestoreDialog({
			heading: _('Restore Built-In Actions?'),
			body: _(
				'Restoring the built-in actions will restore built-in actions that were removed. Custom actions will remain unchanged',
			),
		});

		const response = await resetDialog.choose(this.window, null);
		if (response !== 'restore') return;

		this._config = mergeConfig(this._config, defaultConfig(this.prefs));
		saveConfig(this.prefs, this._config, true);
		this.updateRestoreButton();

		this._actionsGroup.actions = this._config.actions;
		this._defaultsPage.setDefaults(this._config);
	}

	private async reset() {
		const resetDialog = new ResetDialog({
			heading: _('Reset Actions?'),
			body: _('Resetting the actions will delete all custom actions'),
		});

		const response = await resetDialog.choose(this.window, null);
		if (response !== 'reset') return;

		this._config = defaultConfig(this.prefs);
		saveConfig(this.prefs, this._config, true);
		this.updateRestoreButton();

		this._actionsGroup.actions = this._config.actions;
		this._defaultsPage.setDefaults(this._config);
	}

	private updateRestoreButton() {
		const count = countDifference(this._config, defaultConfig(this.prefs));
		this._restoreBadge.label = count.toString();
		this._restoreBadge.visible = count > 0;
		this._restoreButton.sensitive = count > 0;
	}
}
