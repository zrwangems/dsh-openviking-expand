import { n as sourceContext } from "./host-CBJYZ3Tc.js";
import { z } from "zod";
const vikaKind = {
	kind: "vika",
	title: {
		zh: "Vika",
		en: "Vika"
	},
	description: {
		zh: "Vika（容器里的飞书/GitHub 智能体）通过本地桥把事件送入引擎；凭据和监听都在 Vika 侧，这里只做状态与准入。",
		en: "Vika, the Feishu/GitHub agent in its container, sends events through the local bridge. Credentials and listening live in Vika; this Source provides status and admission only."
	},
	schema: z.object({ label: z.string().trim().max(80).default("Vika") }).strict(),
	fields: [{
		key: "label",
		type: "text",
		label: {
			zh: "显示名",
			en: "Display name"
		},
		hint: {
			zh: "只影响面板显示。",
			en: "Affects the panel only."
		}
	}],
	health: ["vika"],
	scope: () => ({
		listened: true,
		observed: false
	}),
	policy: {
		schema: z.object({ allowed: z.array(z.object({
			id: z.string().trim().min(1).max(200),
			name: z.string().trim().max(100).optional()
		}).strict()).default([{
			id: "vika",
			name: "Vika"
		}]) }).strict(),
		fields: [{
			key: "allowed",
			type: "rows",
			label: {
				zh: "能发起工作的 Vika 身份",
				en: "Vika identities that may originate work"
			},
			columns: [{
				key: "id",
				type: "text",
				label: {
					zh: "身份",
					en: "Identity"
				},
				pattern: ".+"
			}, {
				key: "name",
				type: "text",
				label: {
					zh: "名字",
					en: "Name"
				},
				optional: true
			}]
		}],
		explicit: {
			zh: "Vika 经桥送入的事件默认是明确请求。",
			en: "Events Vika sends through the bridge are explicit requests by default."
		}
	}
};
const name = "vika-vika";
const inject = ["orchestrator"];
function apply(ctx) {
	ctx.effect(() => ctx.orchestrator.sources.register(vikaKind), "vika: source kind");
	ctx.effect(() => {
		sourceContext(ctx.orchestrator, vikaKind).report("vika", {
			state: "ready",
			detail: "Vika bridge: waiting for events"
		});
		return () => {};
	}, "vika: health");
}
export { apply, inject, name, vikaKind };
