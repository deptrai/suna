import { tool } from "@opencode-ai/plugin";
import Replicate from "replicate";
import { getEnv } from "./lib/get-env";

// Flux.1 schnell — fast, high-quality image generation
const FLUX_SCHNELL_MODEL =
  "black-forest-labs/flux-schnell";

// Stable Diffusion 3.5 Medium fallback (cheaper)
const SD35_MODEL =
  "stability-ai/stable-diffusion-3.5-medium";

export default tool({
  description:
    "Generate images from text prompts using AI (Flux.1 schnell via Replicate). " +
    "Returns direct image URLs that can be displayed inline. " +
    "Requires REPLICATE_API_TOKEN to be set. " +
    "Supports multiple images per request. " +
    "Use detailed, descriptive prompts for best results.",
  args: {
    prompt: tool.schema
      .string()
      .describe(
        "Text description of the image to generate. Be specific about style, subject, colors, and composition.",
      ),
    num_outputs: tool.schema
      .number()
      .optional()
      .describe("Number of images to generate (1-4). Default: 1"),
    aspect_ratio: tool.schema
      .string()
      .optional()
      .describe(
        "Aspect ratio of the output image. Options: '1:1', '16:9', '9:16', '4:3', '3:4', '21:9'. Default: '1:1'",
      ),
    output_format: tool.schema
      .string()
      .optional()
      .describe("Output format: 'webp', 'jpg', 'png'. Default: 'webp'"),
    num_inference_steps: tool.schema
      .number()
      .optional()
      .describe(
        "Number of inference steps (1-8 for schnell, higher = better quality but slower). Default: 4",
      ),
  },
  async execute(args, _context) {
    const token = getEnv("REPLICATE_API_TOKEN");
    if (!token) {
      return "Error: REPLICATE_API_TOKEN is not set. Please add your Replicate API token to generate images. Get one free at https://replicate.com/account/api-tokens";
    }

    const replicate = new Replicate({ auth: token });

    const numOutputs = Math.max(1, Math.min(args.num_outputs ?? 1, 4));
    const aspectRatio = args.aspect_ratio ?? "1:1";
    const outputFormat = (args.output_format ?? "webp") as
      | "webp"
      | "jpg"
      | "png";
    const steps = Math.max(1, Math.min(args.num_inference_steps ?? 4, 8));

    try {
      const output = await replicate.run(FLUX_SCHNELL_MODEL, {
        input: {
          prompt: args.prompt,
          num_outputs: numOutputs,
          aspect_ratio: aspectRatio,
          output_format: outputFormat,
          num_inference_steps: steps,
          go_fast: true,
          megapixels: "1",
        },
      });

      // Output is an array of image URLs (or ReadableStream objects)
      const urls: string[] = [];
      if (Array.isArray(output)) {
        for (const item of output) {
          if (typeof item === "string") {
            urls.push(item);
          } else if (item && typeof (item as any).url === "function") {
            // Replicate FileOutput object
            urls.push((item as any).url().toString());
          } else if (item && typeof (item as any).toString === "function") {
            urls.push((item as any).toString());
          }
        }
      } else if (typeof output === "string") {
        urls.push(output);
      }

      if (urls.length === 0) {
        return "Error: Image generation succeeded but returned no URLs.";
      }

      const result = {
        prompt: args.prompt,
        model: "flux-schnell",
        num_generated: urls.length,
        images: urls.map((url, i) => ({
          index: i + 1,
          url,
          aspect_ratio: aspectRatio,
          format: outputFormat,
        })),
      };

      return JSON.stringify(result, null, 2);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("401") || msg.includes("Unauthorized")) {
        return "Error: Invalid REPLICATE_API_TOKEN. Please check your token at https://replicate.com/account/api-tokens";
      }
      return `Error generating image: ${msg}`;
    }
  },
});
