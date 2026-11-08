/*
photo: the short-lived image URL for a photo reference.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { google } from "../../google/client.ts";
import { photoUri } from "../../google/places.ts";
import { jsonFlag } from "../../schemas.ts";

/** Input for `photo`. */
export const PhotoInput = z.strictObject({
  photo: z.string().min(1).describe('A photo reference from details, like "places/<id>/photos/<ref>".'),
  maxWidth: z.number().int().min(100).max(1600).default(800).describe("Image width in pixels (100-1600, default 800)."),
  json: jsonFlag,
});

/** Parsed `photo` input. */
export type PhotoInput = z.infer<typeof PhotoInput>;

/** Output of `photo`. */
export const PhotoOut = z.strictObject({
  photoUri: z.string().describe("Image URL. It expires after a while: open or download it soon."),
  note: z.string().describe("How to use the URL."),
});

/** Output of `photo`. */
export type PhotoOut = z.infer<typeof PhotoOut>;

/** Resolves a photo reference to an image URL. */
export const photoCommand = command({
  key: "photo",
  description:
    "Get a short-lived image URL for a place photo reference (from details --photos). Returns a link, not image data: MCP image results aren't supported by this plugin's framework version, so open the URL to see the picture.",
  notes: "Example: {argsbarg:program} photo places/ChIJ…/photos/AUc… --maxWidth 1000",
  options: [
    { name: "maxWidth", description: "Image width in pixels (100-1600, default 800).", kind: OptionKind.Number },
    { name: "json", description: "Emit JSON.", kind: OptionKind.Presence },
  ],
  positionals: [
    { name: "photo", description: "Photo reference from details.", kind: OptionKind.String, argMin: 1, argMax: 1 },
  ],
  inputSchema: PhotoInput,
  outputSchema: PhotoOut,
  mcpTool: { annotations: { readOnlyHint: true, openWorldHint: true } },
  handler: async (ctx) => {
    const uri = await photoUri(google(ctx), ctx.inputs.photo, ctx.inputs.maxWidth);
    const out: PhotoOut = { photoUri: uri, note: "The link expires; open or download it soon." };
    if (ctx.invocation === "cli") {
      console.log(ctx.hasFlag("json") ? JSON.stringify(out, null, 2) : uri);
      return;
    }
    return out;
  },
});
