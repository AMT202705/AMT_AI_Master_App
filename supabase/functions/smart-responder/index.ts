
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MODEL = "fal-ai/wan/v2.7/image-to-video";
const QUEUE_URL = `https://queue.fal.run/${MODEL}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "POST method required" }, 405);
  }

  try {
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (!FAL_KEY) {
      return respond({ error: "FAL_KEY secret is missing" }, 500);
    }

    const body = await req.json();
    const { action, image_url, prompt, duration, request_id } = body;

    const headers = {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    };

    if (action === "generate") {
      if (
        typeof image_url !== "string" ||
        !image_url.startsWith("https://")
      ) {
        return respond({ error: "Valid HTTPS image_url is required" }, 400);
      }

      if (
        typeof prompt !== "string" ||
        prompt.trim().length === 0 ||
        prompt.length > 5000
      ) {
        return respond({ error: "Prompt must be 1-5000 characters" }, 400);
      }

      const seconds = Number(duration || 5);

      if (!Number.isInteger(seconds) || seconds < 2 || seconds > 15) {
        return respond({ error: "Duration must be 2-15 seconds" }, 400);
      }

      const falResponse = await fetch(QUEUE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          image_url,
          prompt,
          duration: seconds,
          resolution: "720p",
          enable_prompt_expansion: true,
          enable_safety_checker: true,
        }),
      });

      const result = await falResponse.json();

      if (!falResponse.ok) {
        return respond({
          error: "Fal.ai generation request failed",
          details: result,
        }, 502);
      }

      return respond({
        success: true,
        request_id: result.request_id,
        status_url: result.status_url,
        response_url: result.response_url,
      });
    }

    if (action === "status" || action === "result") {
      if (
        typeof request_id !== "string" ||
        !/^[a-zA-Z0-9-]+$/.test(request_id)
      ) {
        return respond({ error: "Invalid request_id" }, 400);
      }

      const endpoint = action === "status"
        ? `${QUEUE_URL}/requests/${request_id}/status`
        : `${QUEUE_URL}/requests/${request_id}`;

      const falResponse = await fetch(endpoint, {
        headers: {
          Authorization: `Key ${FAL_KEY}`,
        },
      });

      const result = await falResponse.json();

      if (!falResponse.ok) {
        return respond({
          error: "Fal.ai request lookup failed",
          details: result,
        }, 502);
      }

      return respond(result);
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (error) {
    return respond({
      error: error instanceof Error
        ? error.message
        : "Unknown server error",
    }, 500);
  }
});
