import { readWorkspace } from "@/lib/server-workspace";
import type { Workspace } from "@/lib/workspace";

// A local, evidence-based guide. No browser API keys or paid provider calls.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      // Next can normalize request.url internally; Host preserves the address
      // the browser visited, including its local hostname and port.
      const host = request.headers.get("host") || new URL(request.url).host;
      if (new URL(origin).host !== host) throw new Error("Untrusted origin");
    } catch {
      return Response.json(
        { error: "Cross-origin requests are not accepted." },
        { status: 403 },
      );
    }
  }
  let body;
  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16000) {
          await reader.cancel();
          return Response.json(
            { error: "Request is too large." },
            { status: 413 },
          );
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
    body = JSON.parse(text);
  } catch {
    return Response.json(
      { error: "A valid JSON question is required." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body.message !== "string" ||
    !body.message.trim() ||
    body.message.length > 2000
  ) {
    return Response.json(
      { error: "Enter a question between 1 and 2,000 characters." },
      { status: 400 },
    );
  }
  if (body.apiKey && body.apiKey !== "demo") {
    return Response.json(
      {
        error:
          "API keys are not accepted. This guide reads saved workspace results locally.",
      },
      { status: 400 },
    );
  }
  try {
    const content = explain(body.message, await readWorkspace());
    if (body.stream === false)
      return Response.json({ content, provider: "workspace" });
    return new Response(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Export a valid workspace snapshot before asking about forecast results.",
      },
      { status: 503 },
    );
  }
}

function explain(question: string, workspace: Workspace): string {
  const q = question.toLowerCase();
  if (/inventory|stock|reorder|order|lead time|saving/.test(q)) {
    return "Rossmann records store sales revenue, not unit demand. An inventory policy needs SKU-level demand, lead times, demand uncertainty, stock on hand, stock on order, supplier constraints and your chosen service level. The Inventory planner lets you enter those inputs for an illustrative calculation. No purchases or measured inventory savings are connected.";
  }
  if (/compar|lightgbm|prophet|sarima|best|leaderboard/.test(q)) {
    return "The historical model outputs use different forecast origins and available information, so they cannot be ranked fairly. The saved LightGBM model also used same-day customer counts; new training excludes that input. The controlled comparison is the GRU against its seasonal baseline, with the same origin, dates and stores. A repeated rolling-origin benchmark remains future work.";
  }
  if (/gru|rnn|recurrent|attention|perform|neural/.test(q)) {
    const run = workspace.backtest;
    return run
      ? `The attention GRU uses ${run.lookback} days of history to forecast ${run.horizon} days directly. The test origin is ${run.forecast_origin}, covering ${run.test_start} through ${run.test_end}, with ${run.series.toLocaleString("en-GB")} stores.\n\nMeasured test WMAPE: GRU ${run.metrics.gru.wmape_percent.toFixed(2)}%; matched seasonal baseline ${run.metrics.seasonal_naive.wmape_percent.toFixed(2)}%. Lower is better.\n\nTraining-only scaling and validation-based checkpoint selection keep test targets out of training. This is one historical test origin and does not establish future performance.`
      : "The attention GRU is implemented, but no measured run has been exported. Train the GRU and refresh the dashboard snapshot to inspect its matched seasonal-baseline evaluation.";
  }
  if (/wmape|error|bias|metric/.test(q)) {
    return "WMAPE = sum of absolute forecast errors ÷ sum of absolute actual sales × 100. Lower is better; stores with more sales contribute more. Bias = total signed error ÷ total absolute actual sales × 100; positive values indicate overforecasting. WMAPE is undefined when total actual sales are zero, and the workspace shows a dash rather than a fabricated score.";
  }
  if (/data|quality|source|record|leak|customer/.test(q)) {
    return `This snapshot contains ${workspace.salesRows.toLocaleString("en-GB")} sales records from ${workspace.storeCount.toLocaleString("en-GB")} stores, covering ${workspace.salesStart} through ${workspace.salesEnd}. It was exported at ${workspace.exportedAt}. The data source is ${workspace.source}, rather than a live sales feed. Data health shows duplicate, missing, negative and non-finite sales checks. Same-day customer counts are excluded from new LightGBM training.`;
  }
  if (/mint|reconcil|hierarch/.test(q)) {
    return "The Python pipeline supports bottom-up aggregation. MinT is not implemented. Rossmann is store-level revenue, so it cannot establish SKU-level reconciliation or inventory gains.";
  }
  return "I can explain the saved GRU evaluation, WMAPE and bias, historical model comparisons, data quality, or inventory assumptions. Try asking ‘How did the GRU perform?’ or ‘What data is missing for inventory?’ This is a local evidence guide; it does not run training or change stock.";
}
