import { VError } from "verror";

import { Ctx } from "../../../lib/ctx";
import * as Result from "../../../result";
import { BusinessEvent } from "../business_event";
import { InvalidCommand } from "../errors/invalid_command";
import { NotAuthorized } from "../errors/not_authorized";
import { NotFound } from "../errors/not_found";
import { PreconditionError } from "../errors/precondition_error";
import { Identity } from "../organization/identity";
import { ServiceUser } from "../organization/service_user";
import * as UserRecord from "../organization/user_record";
import * as NotificationCreated from "./notification_created";
import * as Project from "./project";
import * as ProjectClosed from "./project_closed";
import * as ProjectEventSourcing from "./project_eventsourcing";
import * as Subproject from "./subproject";

interface Repository {
  getProject(): Promise<Result.Type<Project.Project>>;
  getSubprojects(projectId: string): Promise<Result.Type<Subproject.Subproject[]>>;
  getUsersForIdentity(identity: Identity): Promise<UserRecord.Id[]>;
}

export async function closeProject(
  ctx: Ctx,
  issuer: ServiceUser,
  projectId: Project.Id,
  repository: Repository,
): Promise<Result.Type<{ newEvents: BusinessEvent[]; project: Project.Project }>> {
  let project = await repository.getProject();
  if (Result.isErr(project)) {
    return new NotFound(ctx, "project", projectId);
  }

  if (project.status === "closed") {
    // The project is already closed.
    return { newEvents: [], project };
  }

  // Create the new event:
  const projectClosed = ProjectClosed.createEvent(ctx.source, issuer.id, projectId);
  if (Result.isErr(projectClosed)) {
    return new VError(projectClosed, "failed to create event");
  }

  // Make sure all subprojects are already closed (we rely on closeSubproject doing a
  // similar check with respect to the subproject's workflowitems):
  const subprojects = await repository.getSubprojects(projectId);
  if (Result.isErr(subprojects)) {
    return new PreconditionError(
      ctx,
      projectClosed,
      `could not find subprojects for project ${projectId}`,
    );
  }
  if (subprojects.some(x => x.status !== "closed")) {
    return new PreconditionError(ctx, projectClosed, "at least one subproject is not closed yet");
  }

  // Check authorization (if not root):
  const intent = "project.close";
  if (issuer.id !== "root" && !Project.permits(project, issuer, [intent])) {
    return new NotAuthorized({ ctx, userId: issuer.id, intent, target: project });
  }

  // Check that the new event is indeed valid:
  const validationResult = ProjectEventSourcing.newProjectFromEvent(ctx, project, projectClosed);
  if (Result.isErr(validationResult)) {
    return new InvalidCommand(ctx, projectClosed, [validationResult]);
  }
  project = validationResult;

  // Create notification events:
  const recipients = project.assignee ? await repository.getUsersForIdentity(project.assignee) : [];
  const notifications = recipients
    // The issuer doesn't receive a notification:
    .filter(userId => userId !== issuer.id)
    .map(recipient =>
      NotificationCreated.createEvent(ctx.source, issuer.id, recipient, projectClosed, projectId),
    );

  return { newEvents: [projectClosed, ...notifications], project };
}
