// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { JQueryStatic } from "jquery";

declare global {
	const $: JQueryStatic;
	const jQuery: JQueryStatic;

	interface JQuery<TElement = HTMLElement> {
		DataTable: (...args: unknown[]) => any;
	}

	interface JQueryStatic {
		fn: {
			dataTableExt?: {
				oStdClasses?: {
					sWrapper?: string;
				};
			};
		} & Record<string, unknown>;
	}

	interface Window {
		Plotly?: unknown;
		vis?: unknown;
		bootstrap?: {
			Modal?: {
				getOrCreateInstance: (element: Element) => {
					show: () => void;
					hide?: () => void;
				};
			};
		};
		[key: string]: unknown;
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}



export { };
