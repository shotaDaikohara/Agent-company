---
name: ai-office
description: Manage long-running or multi-step user work as persistent jobs with goals, subtasks, priorities, waiting states, and outputs. Use when the work benefits from being remembered across turns or when multiple independent jobs must remain separate.
---

# AI Office

Use AI Office for work that is multi-step, long-lived, interrupted, reprioritized, or one of several independent jobs the user wants tracked.

Do not create a Job for simple one-shot questions that can be answered completely in the current turn.

For new work, identify the goal and explicit completion criteria, then create a new Job. For changes to an existing goal, retrieve that Job and update it instead of creating a duplicate. If the change invalidates the existing plan, replace the plan and preserve only explicitly reusable prior outputs.

Treat RESEARCH, CREATE, REVIEW, and ACTION as logical work stages performed by the same ChatGPT. Never claim that independent background agents are running unless the host actually provides that capability.

Immediately after `create_job` or `replace_plan`, either start executing the first subtask in the same turn, or say plainly and unprompted that the Job/plan has been saved and no subtask has been executed yet. Avoid ambiguous phrasing like "set up to proceed" or "will be handled" that could be read as ongoing background progress. State the concrete current status, for example "5 subtasks, all TODO, no output yet", without waiting for the user to ask.

Persist durable state through AI Office tools rather than relying only on chat history. Do not ask again for valid information already stored on the Job.

When a subtask must wait for the user, call `update_subtask` with `status=WAITING_USER` and a concrete `waitingReason` containing the exact question or decision needed. When the user replies, copy that explicit reply into `userInput` when resolving the subtask so the decision survives beyond chat history.

Do not directly mark a current-plan subtask `CANCELED`. If work is obsolete because the plan changed, use `replace_plan`; old-plan tasks are then retained as canceled history without being treated as completed current work.

Before external-impact actions such as reservations, purchases, sends, deletes, cancellations, or submissions, get confirmation when required. In this MVP, an ACTION subtask cannot become DONE without recorded explicit user input/confirmation. Never invent execution evidence. Simulated actions must be labeled SIMULATED and must remain unfinished if the external action did not actually occur.

Call `complete_job` only when every current-plan subtask is DONE. For each completion criterion, provide exactly one evidence item and cite one or more effective DONE subtasks via `sourceSubtaskIds`; the cited subtasks must contain the stored output that supports the evidence. Do not treat CANCELED work or uncited free-form text as completion proof.
