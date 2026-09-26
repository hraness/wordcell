/**
 * Internal Promise facades for importers that own frontmatter fields.
 *
 * They match `createNote` and `updateNoteBody` in `authoring.ts`, plus the
 * internal `fields` parameter, which the public facades do not expose. Each
 * call enters one finite authoring runtime.
 */
import type {
  AuthoringOptions,
  CreateNoteInput,
  FrontmatterFields,
  FrontmatterFieldUpdates,
  NoteAuthoringResult,
  UpdateNoteBodyOptions,
} from "./authoring-model.js";
import { nativeAuthoringPlatform } from "./authoring-platform.js";
import { createNoteProgram, updateNoteBodyProgram } from "./authoring-program.js";
import { runAuthoring } from "./authoring-runtime.js";

/** Create a note whose frontmatter also carries `fields` after `title` and `tags`. */
export async function createNoteWithFields(
  root: string, input: CreateNoteInput, options: AuthoringOptions, fields: FrontmatterFields,
): Promise<NoteAuthoringResult> {
  return runAuthoring(createNoteProgram(nativeAuthoringPlatform, root, input, options, fields));
}

/** Replace a note body and set or delete top-level `fields` in the same revision-checked write. */
export async function updateNoteBodyWithFields(
  root: string, id: string, body: string, options: UpdateNoteBodyOptions, fields: FrontmatterFieldUpdates,
): Promise<NoteAuthoringResult> {
  return runAuthoring(updateNoteBodyProgram(nativeAuthoringPlatform, root, id, body, options, fields));
}
