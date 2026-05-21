import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		include: [
			"test/index.spec.js",
			"test/callManager.test.js",
			"test/validator.test.js",
		],
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
