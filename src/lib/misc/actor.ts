import Clutter from 'gi://Clutter';

export function get_n_visible_children(actor: Clutter.Actor): number {
	let n = 0;
	for (const child of actor.get_children()) {
		if (child.visible) {
			n++;
		}
	}
	return n;
}

export function get_next_visible_sibling(actor: Clutter.Actor): Clutter.Actor | null {
	let next = actor.get_next_sibling();
	while (next !== null && !next.visible) {
		next = next.get_next_sibling();
	}
	return next;
}

export function get_previous_visible_sibling(actor: Clutter.Actor): Clutter.Actor | null {
	let previous = actor.get_previous_sibling();
	while (previous !== null && !previous.visible) {
		previous = previous.get_previous_sibling();
	}
	return previous;
}

export function get_first_visible_child(actor: Clutter.Actor): Clutter.Actor | null {
	const first = actor.get_first_child();
	if (first === null) {
		return null;
	}
	return first.visible ? first : get_next_visible_sibling(first);
}

export function get_last_visible_child(actor: Clutter.Actor): Clutter.Actor | null {
	const last = actor.get_last_child();
	if (last === null) {
		return null;
	}
	return last.visible ? last : get_previous_visible_sibling(last);
}
