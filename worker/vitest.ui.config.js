import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		environmentOptions: {
			jsdom: {
				url: "http://localhost/",
			},
		},
		include: [
			"test/tests.test.js",
			"test/frontendAssets.test.js",
			"test/app.inline-edit-loader.test.js",
			"test/recents.test.js",
		],
	},
});
