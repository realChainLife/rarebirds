import Joi = require("joi");
import { VError } from "verror";

import Intent, { globalIntents } from "../../../authz/intents";
import * as Result from "../../../result";
import { Identity } from "../organization/identity";

type eventTypeType = "global_permission_revoked";
const eventType: eventTypeType = "global_permission_revoked";

export interface Event {
  type: eventTypeType;
  source: string;
  time: string; // ISO timestamp
  publisher: Identity;
  permission: Intent;
  revokee: Identity;
}

export const schema = Joi.object({
  type: Joi.valid(eventType).required(),
  source: Joi.string()
    .allow("")
    .required(),
  time: Joi.date()
    .iso()
    .required(),
  publisher: Joi.string().required(),
  permission: Joi.valid(globalIntents).required(),
  revokee: Joi.string().required(),
}).options({ stripUnknown: true });

export function createEvent(
  source: string,
  publisher: Identity,
  permission: Intent,
  revokee: Identity,
  time: string = new Date().toISOString(),
): Event {
  const event = {
    type: eventType,
    source,
    publisher,
    time,
    permission,
    revokee,
  };
  const validationResult = validate(event);
  if (Result.isErr(validationResult)) {
    throw new VError(validationResult, `not a valid ${eventType} event`);
  }
  return event;
}

export function validate(input: any): Result.Type<Event> {
  const { error, value } = Joi.validate(input, schema);
  return !error ? value : error;
}
