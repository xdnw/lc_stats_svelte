declare global {
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
