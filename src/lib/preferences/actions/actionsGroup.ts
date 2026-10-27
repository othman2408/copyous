import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _, ngettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
	type Action,
	type ActionSubmenu,
	instanceofAction,
	instanceofActionSubmenu,
	instanceofCommandAction,
} from '../../common/actions.js';
import { ItemType } from '../../common/constants.js';
import { JsObjectWrapper, registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { NestedListBox } from '../utils.js';
import { AddActionDialog, EditActionDialog } from './actionDialog.js';
import { AddActionSubmenuDialog, EditActionSubmenuDialog } from './actionSubMenuDialog.js';

Gio._promisify(Adw.AlertDialog.prototype, 'choose');

const ShortcutLabel = ('ShortcutLabel' in Gtk && !('ShortcutLabel' in Adw) ? (Gtk as typeof Adw) : Adw).ShortcutLabel;

@registerClass()
class DeleteDialog extends Adw.AlertDialog {
	constructor(props: Partial<Adw.AlertDialog.ConstructorProps>) {
		super(props);

		this.add_response('cancel', _('Cancel'));
		this.add_response('delete', _('Delete'));
		this.close_response = 'cancel';
		this.default_response = 'cancel';
		this.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
	}
}

@registerClass({
	Properties: {
		'action-submenu': GObject.ParamSpec.jsobject('action-submenu', null, null, GObject.ParamFlags.READABLE),
	},
})
class ActionSubmenuRowBase extends Adw.ExpanderRow {
	protected readonly _menuButton: Gtk.MenuButton;

	constructor(public readonly actionSubmenu: ActionSubmenu) {
		super({
			title: actionSubmenu.name,
			use_markup: false,
			title_lines: 1,
		});

		const dragHandle = new Gtk.Image({
			icon_name: Icon.DragHandle,
			valign: Gtk.Align.CENTER,
		});
		this.add_prefix(dragHandle);
		dragHandle.tooltip_text = _('Drag to reorder');
		this.add_prefix(new Gtk.Image({ icon_name: Icon.Folder, css_classes: ['dim-label'] }));
		this.connect('notify::action-submenu', () => this.updateSummary());
		this.updateSummary();

		this._menuButton = new Gtk.MenuButton({
			icon_name: Icon.ViewMore,
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		this._menuButton.tooltip_text = _('Group options');
		this.add_suffix(this._menuButton);
	}

	private updateSummary() {
		const count = this.actionSubmenu.actions.length;
		this.subtitle = _('Group') + ' · ' + ngettext('%d action', '%d actions', count).replace('%d', String(count));
	}
}

@registerClass({
	Signals: {
		delete: {},
	},
})
class ActionSubmenuRow extends ActionSubmenuRowBase {
	private readonly _actionsList: NestedListBox;
	private readonly _addActionButtonList: NestedListBox;
	private readonly _addActionButton: Adw.ButtonRow;

	constructor(
		private window: Adw.PreferencesWindow,
		actionSubmenu: ActionSubmenu,
	) {
		super(actionSubmenu);

		this._actionsList = new NestedListBox();
		this._actionsList.add_css_class('action-group-children');
		this.add_row(this._actionsList);
		this._actionsList.listbox.add_css_class('has-placeholder');
		this._actionsList.listbox.set_placeholder(
			new Adw.ActionRow({
				title: _('No Actions'),
				sensitive: false,
			}),
		);

		this._addActionButtonList = new NestedListBox();
		this._addActionButtonList.add_css_class('action-group-children');
		this.add_row(this._addActionButtonList);

		this._addActionButton = new Adw.ButtonRow({
			title: _('Add Action'),
			start_icon_name: Icon.Add,
		});
		this._addActionButton.connect('activated', this.add.bind(this));
		this._addActionButtonList.listbox.append(this._addActionButton);

		for (const action of this.actionSubmenu.actions) {
			this._actionsList.listbox.append(this.createRow(action));
		}

		const actionGroup = new Gio.SimpleActionGroup();

		const editAction = Gio.SimpleAction.new('edit', null);
		editAction.connect('activate', this.edit.bind(this));
		actionGroup.add_action(editAction);

		const deleteAction = Gio.SimpleAction.new('delete', null);
		deleteAction.connect('activate', this.delete.bind(this));
		actionGroup.add_action(deleteAction);

		this._menuButton.insert_action_group('action', actionGroup);

		const menu = new Gio.Menu();
		menu.append(_('Edit'), 'action.edit');
		menu.append(_('Delete'), 'action.delete');
		this._menuButton.menu_model = menu;

		this.configureDragAndDrop();
	}

	private createRow(action: Action): ActionRow {
		const row = new ActionRow(this.window, action);

		row.connect('notify::action', () => this.notify('action-submenu'));
		row.connect('delete', () => {
			this._actionsList.listbox.remove(row);
			this.updateActionSubmenu();
		});

		return row;
	}

	private updateActionSubmenu() {
		const actions = [];
		let child = this._actionsList.listbox.get_first_child();
		while (child) {
			if (child instanceof ActionRow) actions.push(child.action);
			child = child.get_next_sibling();
		}

		this.actionSubmenu.actions = actions;
		this.notify('action-submenu');
	}

	private async add() {
		const addActionDialog = new AddActionDialog(null);

		const response = await addActionDialog.choose(this.window, null);
		if (response !== 'add' || addActionDialog.action === null) return;

		this._actionsList.listbox.append(this.createRow(addActionDialog.action));
		this.actionSubmenu.actions.push(addActionDialog.action);
		this.notify('action-submenu');
	}

	private async edit() {
		const editSubmenuDialog = new EditActionSubmenuDialog(this.actionSubmenu);

		const response = await editSubmenuDialog.choose(this.window, null);
		if (response !== 'edit') return;

		this.title = this.actionSubmenu.name;
		this.notify('action-submenu');
	}

	private async delete() {
		const deleteSubmenuDialog = new DeleteDialog({
			heading: _('Delete Submenu?'),
			body: _('Deleting the submenu will delete all actions in the submenu'),
		});

		const response = await deleteSubmenuDialog.choose(this.window, null);
		if (response !== 'delete') return;

		this.emit('delete');
	}

	private configureDragAndDrop() {
		const dropController = new Gtk.DropControllerMotion();
		const addActionDropController = new Gtk.DropControllerMotion();
		const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });

		const expanderRow = this.child!.get_first_child()!.get_first_child() as Adw.ActionRow;
		expanderRow.add_controller(dropController);
		expanderRow.add_controller(dragSource);
		this._addActionButton.add_controller(addActionDropController);

		let dragX = 0;
		let dragY = 0;
		dragSource.connect('prepare', (_source, x, y) => {
			dragX = x;
			dragY = y;

			this.expanded = false;

			const value = new GObject.Value();
			value.init(ActionSubmenuRow.$gtype);
			value.set_object(this);

			return Gdk.ContentProvider.new_for_value(value);
		});

		dragSource.connect('drag-begin', (_source, drag) => {
			const dragWidget = new Gtk.ListBox({
				css_classes: ['boxed-list'],
				width_request: this.get_width(),
			});

			const dragRow = new ActionSubmenuRowBase(this.actionSubmenu);
			dragWidget.append(dragRow);
			dragWidget.drag_highlight_row(dragRow);

			const icon = Gtk.DragIcon.get_for_drag(drag);
			icon.child = dragWidget;

			drag.set_hotspot(dragX, dragY);
		});

		dragSource.connect('drag-end', (_source, _drag, deleteData) => {
			if (deleteData) this.emit('delete');
		});

		let sourceId: number = -1;
		dropController.connect('enter', () => {
			(expanderRow.parent as Gtk.ListBox).drag_highlight_row(expanderRow);

			if (!this.expanded && sourceId === -1) {
				sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
					this.expanded = true;
					sourceId = -1;
					return GLib.SOURCE_REMOVE;
				});
			}
		});

		dropController.connect('leave', () => {
			(expanderRow.parent as Gtk.ListBox).drag_unhighlight_row();

			if (sourceId >= 0) {
				GLib.source_remove(sourceId);
				sourceId = -1;
			}
		});

		addActionDropController.connect('enter', () =>
			this._addActionButtonList.listbox.drag_highlight_row(this._addActionButton),
		);
		addActionDropController.connect('leave', () => this._addActionButtonList.listbox.drag_unhighlight_row());

		const dropTarget = Gtk.DropTarget.new(ActionRow.$gtype, Gdk.DragAction.MOVE);
		this._actionsList.listbox.add_controller(dropTarget);

		dropTarget.connect('drop', (_drop, row: ActionRow, _x, y) => {
			const targetRow = this._actionsList.listbox.get_row_at_y(y);
			if (!row || !targetRow || row === targetRow) return false;
			let targetIndex = targetRow.get_index();
			if (row.parent === this._actionsList.listbox && row.get_index() < targetIndex) targetIndex++;

			this._actionsList.listbox.insert(this.createRow(row.action), targetIndex);
			this.updateActionSubmenu();
			targetRow.set_state_flags(Gtk.StateFlags.NORMAL, true);

			return true;
		});

		const addActionDropTarget = Gtk.DropTarget.new(ActionRow.$gtype, Gdk.DragAction.MOVE);
		this._addActionButtonList.listbox.add_controller(addActionDropTarget);

		addActionDropTarget.connect('drop', (_drop, row: ActionRow, _x, _y) => {
			if (!row) return false;

			this._actionsList.listbox.append(this.createRow(row.action));
			this.updateActionSubmenu();
			this._addActionButton.set_state_flags(Gtk.StateFlags.NORMAL, true);

			return true;
		});
	}
}

@registerClass({
	Properties: {
		action: GObject.ParamSpec.jsobject('action', null, null, GObject.ParamFlags.READABLE),
	},
})
class ActionRowBase extends Adw.ActionRow {
	protected readonly _menuButton: Gtk.MenuButton;
	protected readonly _editButton: Gtk.Button;
	protected readonly _shortcutLabel: Adw.ShortcutLabel;

	constructor(public readonly action: Action) {
		super({
			use_markup: false,
			title_lines: 1,
			subtitle_lines: 2,
		});

		this.add_prefix(
			new Gtk.Image({
				icon_name: Icon.DragHandle,
				valign: Gtk.Align.CENTER,
				tooltip_text: _('Drag to reorder'),
			}),
		);

		this._shortcutLabel = new ShortcutLabel({
			valign: Gtk.Align.CENTER,
			tooltip_text: _('Keyboard shortcut'),
		});
		this.add_suffix(this._shortcutLabel);

		this._editButton = new Gtk.Button({
			icon_name: Icon.Edit,
			tooltip_text: _('Edit Action'),
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		this.add_suffix(this._editButton);
		this.activatable_widget = this._editButton;

		this._menuButton = new Gtk.MenuButton({
			icon_name: Icon.ViewMore,
			tooltip_text: _('Action options'),
			valign: Gtk.Align.CENTER,
			css_classes: ['flat'],
		});
		this.add_suffix(this._menuButton);
		this.updateSummary();
	}

	protected updateSummary() {
		const labels: Record<ItemType, string> = {
			[ItemType.Text]: _('Text'),
			[ItemType.Code]: _('Code'),
			[ItemType.Image]: _('Images'),
			[ItemType.File]: _('Files'),
			[ItemType.Files]: _('File Lists'),
			[ItemType.Link]: _('Links'),
			[ItemType.Character]: _('Characters'),
			[ItemType.Color]: _('Colors'),
		};
		const types = [...new Set(this.action.types ?? [])];
		const scope =
			types.length === 0 || types.length === Object.keys(labels).length
				? _('All content types')
				: types.map((type) => labels[type]).join(', ');
		this.title = this.action.name;
		this.subtitle = scope;
		this.tooltip_text = instanceofCommandAction(this.action) ? this.action.command : scope;
		this._shortcutLabel.accelerator = this.action.shortcut?.[0] ?? '';
		this._shortcutLabel.visible = this._shortcutLabel.accelerator !== '';
	}
}

@registerClass({
	Signals: {
		delete: {},
	},
})
class ActionRow extends ActionRowBase {
	constructor(
		private window: Adw.PreferencesWindow,
		action: Action,
	) {
		super(action);
		this._editButton.connect('clicked', this.edit.bind(this));

		const actionGroup = new Gio.SimpleActionGroup();

		const editAction = Gio.SimpleAction.new('edit', null);
		editAction.connect('activate', this.edit.bind(this));
		actionGroup.add_action(editAction);

		const deleteAction = Gio.SimpleAction.new('delete', null);
		deleteAction.connect('activate', this.delete.bind(this));
		actionGroup.add_action(deleteAction);

		this._menuButton.insert_action_group('action', actionGroup);

		const menu = new Gio.Menu();
		menu.append(_('Edit'), 'action.edit');
		menu.append(_('Delete'), 'action.delete');
		this._menuButton.menu_model = menu;

		this.configureDragAndDrop();
	}

	private async edit() {
		const editActionDialog = new EditActionDialog(this.action);

		const response = await editActionDialog.choose(this.window, null);
		if (response !== 'save') return;

		this.updateSummary();
		this.notify('action');
	}

	private async delete() {
		const deleteActionDialog = new DeleteDialog({ heading: _('Delete Action?') });

		const response = await deleteActionDialog.choose(this.window, null);
		if (response !== 'delete') return;

		this.emit('delete');
	}

	private configureDragAndDrop() {
		const dropController = new Gtk.DropControllerMotion();
		const dragSource = new Gtk.DragSource({
			actions: Gdk.DragAction.MOVE,
		});

		this.add_controller(dropController);
		this.add_controller(dragSource);

		let dragX = 0;
		let dragY = 0;
		dragSource.connect('prepare', (_source, x, y) => {
			dragX = x;
			dragY = y;

			const value = new GObject.Value();
			value.init(ActionRow.$gtype);
			value.set_object(this);

			return Gdk.ContentProvider.new_for_value(value);
		});

		dragSource.connect('drag-begin', (_source, drag) => {
			const dragWidget = new Gtk.ListBox({
				css_classes: ['boxed-list'],
				width_request: this.get_width(),
				height_request: this.get_height(),
			});

			const dragRow = new ActionRowBase(this.action);
			dragWidget.append(dragRow);
			dragWidget.drag_highlight_row(dragRow);

			const icon = Gtk.DragIcon.get_for_drag(drag);
			icon.child = dragWidget;

			drag.set_hotspot(dragX, dragY);
		});

		dragSource.connect('drag-end', (_source, _drag, deleteData) => {
			if (deleteData) this.emit('delete');
		});

		dropController.connect('enter', () => (this.parent as Gtk.ListBox)?.drag_highlight_row(this));
		dropController.connect('leave', () => (this.parent as Gtk.ListBox)?.drag_unhighlight_row());
	}
}

@registerClass({
	Properties: {
		actions: GObject.ParamSpec.jsobject('actions', null, null, GObject.ParamFlags.READABLE),
	},
})
export class ActionsGroup extends Adw.PreferencesGroup {
	private _actions: (Action | ActionSubmenu)[] = [];
	private readonly _model: Gio.ListStore<JsObjectWrapper<Action | ActionSubmenu>>;
	private readonly _listbox: Gtk.ListBox;

	constructor(
		private window: Adw.PreferencesWindow,
		actions: (Action | ActionSubmenu)[],
	) {
		super({
			title: _('Clipboard Actions'),
			description: _(
				'Choose what you can do with copied content. Expand a group to see its actions. Drag to reorder.',
			),
		});

		this._actions = actions.filter((a) => instanceofAction(a) || instanceofActionSubmenu(a));

		this._listbox = new Gtk.ListBox({
			css_classes: ['boxed-list', 'has-placeholder'],
			selection_mode: Gtk.SelectionMode.NONE,
		});
		this._listbox.set_placeholder(
			new Adw.ActionRow({
				title: _('No Actions'),
				sensitive: false,
			}),
		);
		this.add(this._listbox);

		const jsobjects = this._actions.map((a) => new JsObjectWrapper(a));
		this._model = Gio.ListStore.new(JsObjectWrapper.$gtype) as Gio.ListStore<
			JsObjectWrapper<Action | ActionSubmenu>
		>;
		this._model.splice(0, 0, jsobjects);

		this._listbox.bind_model(this._model, this.createRow.bind(this));

		const addActionButton = new Gtk.MenuButton({
			valign: Gtk.Align.CENTER,
			css_classes: ['suggested-action'],
			tooltip_text: _('Add an action or group'),
			child: new Adw.ButtonContent({
				icon_name: Icon.Add,
				label: _('Add'),
			}),
		});
		this.header_suffix = addActionButton;

		const actionGroup = new Gio.SimpleActionGroup();

		const addAction = Gio.SimpleAction.new('add-action', null);
		addAction.connect('activate', this.addAction.bind(this));
		actionGroup.add_action(addAction);

		const addSubmenu = Gio.SimpleAction.new('add-sub-menu', null);
		addSubmenu.connect('activate', this.addSubmenu.bind(this));
		actionGroup.add_action(addSubmenu);

		addActionButton.insert_action_group('action-menu', actionGroup);

		const menu = new Gio.Menu();
		menu.append(_('Add Action'), 'action-menu.add-action');
		menu.append(_('Add Group'), 'action-menu.add-sub-menu');
		addActionButton.menu_model = menu;

		this.configureDragAndDrop();
	}

	get actions() {
		return this._actions;
	}

	set actions(actions: (Action | ActionSubmenu)[]) {
		this._actions = actions;
		const jsobjects = this._actions.map((a) => new JsObjectWrapper(a));
		this._model.splice(0, this._model.n_items, jsobjects);
		this.notify('actions');
	}

	private createRow(action: JsObjectWrapper<Action | ActionSubmenu>): ActionRow | ActionSubmenuRow {
		const row = instanceofAction(action.jsobject)
			? new ActionRow(this.window, action.jsobject)
			: instanceofActionSubmenu(action.jsobject)
				? new ActionSubmenuRow(this.window, action.jsobject)
				: null!;

		if (row instanceof ActionRow) {
			row.connect('notify::action', this.updateActions.bind(this));
		} else {
			row.connect('notify::action-submenu', this.updateActions.bind(this));
		}

		row.connect('delete', () => {
			const [success, index] = this._model.find(action);
			if (!success) return;

			this._model.splice(index, 1, []);
			this.updateActions();
		});

		return row;
	}

	private updateActions() {
		this._actions = Array.from(this._model).map((obj) => obj.jsobject);
		this.notify('actions');
	}

	private async addAction() {
		const addActionDialog = new AddActionDialog(null);

		const response = await addActionDialog.choose(this.window, null);
		if (response !== 'add' || addActionDialog.action === null) return;

		this._actions.push(addActionDialog.action);
		this._model.append(new JsObjectWrapper(addActionDialog.action));
		this.notify('actions');
	}

	private async addSubmenu() {
		const addActionSubmenuDialog = new AddActionSubmenuDialog(null);

		const response = await addActionSubmenuDialog.choose(this.window, null);
		if (response !== 'add') return;

		this._actions.push(addActionSubmenuDialog.actionSubmenu);
		this._model.append(new JsObjectWrapper(addActionSubmenuDialog.actionSubmenu));
		this.notify('actions');
	}

	private configureDragAndDrop() {
		const dropTarget = Gtk.DropTarget.new(GObject.TYPE_NONE, Gdk.DragAction.MOVE);
		dropTarget.set_gtypes([ActionRow.$gtype, ActionSubmenuRow.$gtype]);
		this._listbox.add_controller(dropTarget);

		dropTarget.connect('drop', (_drop, row: ActionRow | ActionSubmenuRow, _x, y) => {
			const targetRow = this._listbox.get_row_at_y(y);
			if (!row || !targetRow) return false;
			let targetIndex = targetRow.get_index();
			if (row.parent === this._listbox && row.get_index() < targetIndex) targetIndex++;

			const action = row instanceof ActionRow ? row.action : row.actionSubmenu;
			const jsobject = new JsObjectWrapper(action);
			this._model.insert(targetIndex, jsobject);
			targetRow.set_state_flags(Gtk.StateFlags.NORMAL, true);
			this._actions.push(action);
			this.notify('actions');

			return true;
		});
	}
}
