import z from "zod";
import { scopedProcedure } from "../../context";
import { mapAgentEnvironmentError } from "./routing";
import { agentService } from "./service";

const runAgent = scopedProcedure("agent", "run");

export const actionsRouter = {
	revert: runAgent
		.route({
			method: "POST",
			path: "/agent/actions/{id}/revert",
			tags: ["Agent"],
			operationId: "revertAgentAction",
			summary: "Restore agent action snapshot",
		})
		.input(z.object({ id: z.string() }))
		.use(mapAgentEnvironmentError)
		.handler(({ context, input }) => agentService.actions.revert({ id: input.id, userId: context.user.id })),
};
