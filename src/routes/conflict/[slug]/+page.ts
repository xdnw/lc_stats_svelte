import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load({ params }) {
	const id = parseInt(params.slug);
	if (isNaN(id)) {
		error(404, 'Not found');
	}
	return {
		id: id
	};
}