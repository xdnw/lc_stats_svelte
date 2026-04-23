declare global {
	interface Window {
		vis?: unknown;
		__lcPrimedCompressedPayloads?: Record<string, Promise<ArrayBuffer>>;
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
