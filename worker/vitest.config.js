import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		include: [
			"test/index.spec.js",
			"test/openaiRoutes.spec.js",
			"test/callManager.test.js",
			"test/validator.test.js",
			"test/healthCheck.test.js",
			"test/requestQueue.test.js",
			"test/fallback.test.js",
			"test/textRenderer.test.js",
			"test/imageExporter.test.js",
		],
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
